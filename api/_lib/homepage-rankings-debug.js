/**
 * Server-side homepage rankings — official WC 2026 48-team pool + verified club stats.
 * Team list: wc2026-official-teams.js, IDs resolved from GET /fixtures?league=1&season=2026.
 */

import { apiFootballFetch, pickClubStatRow } from './api-football-fetch.js';
import {
  OFFICIAL_WC2026_GROUPS,
  OFFICIAL_WC2026_TEAM_COUNT,
  isRequiredNationIncluded,
  resolveOfficialTeams,
} from './wc2026-official-teams.js';

const WC_LEAGUE = 1;
const WC_SEASON = 2026;
const CLUB_SEASONS = [2025, 2026, 2024];
const SQUAD_CONCURRENCY = 2;
const STAT_CONCURRENCY = 4;
const FETCH_RETRY_ATTEMPTS = 5;
const FETCH_RETRY_DELAY_MS = 600;
const BATCH_DELAY_MS = 200;
const SQUAD_RETRY_DELAY_MS = 500;
const TOP_N = 10;
const DEBUG_TOP_N = 20;
const CARD_N = 4;
const SQUAD_POOL_TTL_MS = 24 * 60 * 60 * 1000;
const SQUAD_POOL_CACHE_VERSION = 'wc2026-official-48-v2';

/** @type {{ version: string, data: object, freshUntil: number, staleUntil: number } | null} */
let globalSquadPoolCache = null;
/** @type {Promise<object> | null} */
let globalSquadPoolInFlight = null;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parsePremiumFields(stat) {
  if (!stat) return null;
  const fouls = stat.fouls || {};
  const cards = stat.cards || {};
  const passes = stat.passes || {};
  const committed = fouls.committed ?? null;
  const drawn = fouls.drawn ?? null;
  let foulsTotal = null;
  if (committed != null || drawn != null) {
    foulsTotal = (committed || 0) + (drawn || 0);
  }
  let cardsTotal = null;
  if (cards.yellow != null || cards.red != null) {
    cardsTotal = (cards.yellow || 0) + (cards.red || 0);
  }
  return {
    goals: stat.goals?.total ?? null,
    assists: stat.goals?.assists ?? null,
    fouls: foulsTotal,
    foulsCommitted: committed,
    cards: cardsTotal,
    chancesCreated: passes.key ?? null,
    cornersInvolved: passes.cross ?? null,
  };
}

function buildStatMeta(clubStat) {
  return {
    source: 'club-season',
    season: clubStat.league?.season ?? null,
    league: clubStat.league?.name ?? null,
    leagueId: clubStat.league?.id ?? null,
    club: clubStat.team?.name ?? null,
    clubId: clubStat.team?.id ?? null,
  };
}

function buildRankingPlayer(player, profile, clubStat, nationalTeam) {
  const premium = parsePremiumFields(clubStat);
  if (!premium) return null;

  const foulsDrawn = clubStat.fouls?.drawn ?? null;
  const foulsCommitted = clubStat.fouls?.committed ?? null;
  const mostFouledValue = foulsDrawn != null && foulsDrawn > 0 ? foulsDrawn : premium.fouls;

  let disciplineRisk = null;
  if (foulsCommitted != null || premium.cards != null) {
    disciplineRisk = (foulsCommitted || 0) + (premium.cards || 0);
    if (disciplineRisk <= 0) disciplineRisk = null;
  }

  let chanceCreation = null;
  if (premium.chancesCreated != null || premium.cornersInvolved != null) {
    chanceCreation = (premium.chancesCreated || 0) + (premium.cornersInvolved || 0);
    if (chanceCreation <= 0) chanceCreation = null;
  }

  return {
    id: player.id,
    name: profile?.name || player.name,
    photo: profile?.photo || player.photo,
    team: nationalTeam || '',
    club: clubStat.team?.name || null,
    goals: premium.goals,
    assists: premium.assists,
    foulsDrawn: mostFouledValue,
    disciplineRisk,
    chanceCreation,
    statMeta: buildStatMeta(clubStat),
  };
}

async function fetchWithRetry(fetchFn, attempts = FETCH_RETRY_ATTEMPTS) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await fetchFn();
      if (result?.ok && !result?._cache?.rateLimited) {
        return result;
      }
      lastError = new Error(result?.error || result?.message || 'API request failed');
    } catch (err) {
      lastError = err;
    }

    if (attempt < attempts - 1) {
      await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError || new Error('API request failed');
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
      if (BATCH_DELAY_MS > 0) {
        await sleep(BATCH_DELAY_MS);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function rankPoolByMetric(pool, metric, limit) {
  return pool.slice()
    .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
    .filter((player) => player[metric] != null && player[metric] > 0)
    .slice(0, limit)
    .map((player) => ({
      id: player.id,
      name: player.name,
      photo: player.photo,
      team: player.team,
      club: player.club,
      value: player[metric],
      rawValue: player[metric],
      statSource: player.statMeta?.source || 'club-season',
      statMeta: player.statMeta || null,
    }));
}

function formatRankedPlayer(player) {
  return {
    name: player.name,
    country: player.team,
    club: player.club,
    value: player.value,
    rawValue: player.rawValue ?? player.value,
    statSource: player.statSource || 'club-season',
    statMeta: player.statMeta || null,
  };
}

async function fetchPlayerStatisticsBundle(apiKey, playerId, nationalTeam) {
  let profile = null;
  const statistics = [];
  const seen = new Set();

  for (const season of CLUB_SEASONS) {
    let result;
    try {
      result = await fetchWithRetry(
        () => apiFootballFetch('/players', { id: playerId, season }, apiKey),
        2,
      );
    } catch {
      continue;
    }

    const entry = result.response?.[0];
    if (!entry) continue;
    if (entry.player) profile = entry.player;
    for (const stat of entry.statistics || []) {
      const key = [stat.league?.id, stat.league?.season, stat.team?.id].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      statistics.push(stat);
    }
    if (pickClubStatRow(statistics, nationalTeam)) break;
  }

  return { profile, statistics };
}

async function collectFixtureTeamLookup(apiKey) {
  const fixturesResult = await fetchWithRetry(
    () => apiFootballFetch('/fixtures', {
      league: WC_LEAGUE,
      season: WC_SEASON,
      timezone: 'UTC',
    }, apiKey),
  );

  const fixtures = fixturesResult.response || [];
  const fixtureTeams = [];

  fixtures.forEach((item) => {
    [item.teams?.home, item.teams?.away].forEach((team) => {
      if (team?.id) fixtureTeams.push({ id: team.id, name: team.name });
    });
  });

  return {
    fixtureCount: fixtures.length,
    fixtureTeams,
    official: resolveOfficialTeams(fixtureTeams),
  };
}

async function fetchTeamSquad(apiKey, team) {
  const squadResult = await fetchWithRetry(
    () => apiFootballFetch('/players/squads', { team: team.id }, apiKey),
  );

  const squadPlayers = squadResult.response?.[0]?.players || [];
  if (!squadPlayers.length) {
    throw new Error(`Empty squad for ${team.officialName}`);
  }

  return squadPlayers;
}

async function appendTeamSquad(apiKey, team, players, seenPlayers, squadsProcessed, squadsFailed) {
  try {
    const squadPlayers = await fetchTeamSquad(apiKey, team);
    let added = 0;

    for (const player of squadPlayers) {
      if (!player?.id || seenPlayers.has(player.id)) continue;
      seenPlayers.add(player.id);
      players.push({
        id: player.id,
        name: player.name,
        photo: player.photo,
        nationalTeam: team.officialName,
        nationalTeamId: team.id,
        apiTeamName: team.apiName,
      });
      added += 1;
    }

    if (added > 0) {
      squadsProcessed.push(team.officialName);
      return true;
    }

    squadsFailed.push({ team: team.officialName, reason: 'no-players-added' });
    return false;
  } catch (err) {
    squadsFailed.push({ team: team.officialName, reason: err.message });
    return false;
  }
}

async function buildOfficialSquadPool(apiKey) {
  const { fixtureCount, official } = await collectFixtureTeamLookup(apiKey);

  console.info('[home-rankings] official teams resolved', {
    teamsFound: official.teamsFound.length,
    teamsMissing: official.teamsMissing,
  });

  if (!official.complete) {
    throw new Error(
      `Official team resolution incomplete: ${official.teamCount}/${OFFICIAL_WC2026_TEAM_COUNT}. Missing: ${official.teamsMissing.join(', ')}`,
    );
  }

  const players = [];
  const seenPlayers = new Set();
  const squadsProcessed = [];
  const squadsFailed = [];

  await mapWithConcurrency(official.teams, SQUAD_CONCURRENCY, async (team) => {
    await appendTeamSquad(apiKey, team, players, seenPlayers, squadsProcessed, squadsFailed);
  });

  let squadsMissing = official.teams
    .map((t) => t.officialName)
    .filter((name) => !squadsProcessed.includes(name));

  if (squadsMissing.length) {
    console.info('[home-rankings] retrying missing squads sequentially', squadsMissing);
    for (const team of official.teams) {
      if (squadsProcessed.includes(team.officialName)) continue;
      await sleep(SQUAD_RETRY_DELAY_MS);
      await appendTeamSquad(apiKey, team, players, seenPlayers, squadsProcessed, squadsFailed);
    }
  }

  squadsMissing = official.teams
    .map((t) => t.officialName)
    .filter((name) => !squadsProcessed.includes(name));

  console.info('[home-rankings] squad pool built', {
    teamsFound: official.teamsFound.length,
    teamsMissing: squadsMissing,
    squadsProcessed: squadsProcessed.length,
    playersFound: players.length,
    squadsFailed: squadsFailed.length,
  });

  if (squadsProcessed.length !== OFFICIAL_WC2026_TEAM_COUNT) {
    throw new Error(
      `Squad pool incomplete: ${squadsProcessed.length}/${OFFICIAL_WC2026_TEAM_COUNT} squads loaded. Missing: ${squadsMissing.join(', ')}`,
    );
  }

  return {
    teams: official.teams,
    players,
    teamCount: official.teamCount,
    playerCount: players.length,
    fixtureCount,
    teamSource: 'official-wc2026-48',
    groups: OFFICIAL_WC2026_GROUPS,
    teamsFound: official.teamsFound,
    teamsMissing: squadsMissing,
    squadsProcessed,
    squadsProcessedCount: squadsProcessed.length,
    squadsFailed,
    playersFound: players.length,
  };
}

function squadCacheValid(cache) {
  return cache
    && cache.version === SQUAD_POOL_CACHE_VERSION
    && cache.freshUntil > Date.now()
    && cache.data?.teamCount === OFFICIAL_WC2026_TEAM_COUNT;
}

async function getOrBuildOfficialSquadPool(apiKey) {
  const now = Date.now();

  if (squadCacheValid(globalSquadPoolCache)) {
    return {
      ...globalSquadPoolCache.data,
      _cache: { hit: true, fresh: true, scope: 'official-squad-pool' },
    };
  }

  if (globalSquadPoolInFlight) {
    return globalSquadPoolInFlight;
  }

  globalSquadPoolInFlight = (async () => {
    try {
      const data = await buildOfficialSquadPool(apiKey);
      globalSquadPoolCache = {
        version: SQUAD_POOL_CACHE_VERSION,
        data,
        freshUntil: now + SQUAD_POOL_TTL_MS,
        staleUntil: now + SQUAD_POOL_TTL_MS * 2,
      };
      return { ...data, _cache: { hit: false, fresh: true, scope: 'official-squad-pool' } };
    } catch (err) {
      if (globalSquadPoolCache
        && globalSquadPoolCache.version === SQUAD_POOL_CACHE_VERSION
        && globalSquadPoolCache.data?.teamCount === OFFICIAL_WC2026_TEAM_COUNT
        && globalSquadPoolCache.staleUntil > Date.now()) {
        return {
          ...globalSquadPoolCache.data,
          _cache: { hit: true, stale: true, scope: 'official-squad-pool', error: err.message },
        };
      }
      throw err;
    } finally {
      globalSquadPoolInFlight = null;
    }
  })();

  return globalSquadPoolInFlight;
}

function findHarryKane(players, pool) {
  const matchName = (name) => {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('kane') && (n.includes('harry') || n.startsWith('h.'));
  };

  const squadEntry = (players || []).find((p) => p.id === 184 || matchName(p.name));
  const rankedEntry = (pool || []).find((p) => p.id === 184 || matchName(p.name));

  return {
    found: Boolean(squadEntry || rankedEntry),
    inSquadPool: Boolean(squadEntry),
    inRankedPool: Boolean(rankedEntry),
    clubStatsVerified: Boolean(rankedEntry),
    playerId: squadEntry?.id || rankedEntry?.id || null,
    name: squadEntry?.name || rankedEntry?.name || null,
    country: squadEntry?.nationalTeam || rankedEntry?.team || null,
    club: rankedEntry?.club || null,
    goals: rankedEntry?.goals ?? null,
    assists: rankedEntry?.assists ?? null,
  };
}

function buildDebugReport({ squadPool, pool, enrichLog, categories, rankingsCache }) {
  const countriesIncluded = squadPool.teamsFound.slice().sort();
  const englandIncluded = isRequiredNationIncluded(countriesIncluded, 'england');
  const keyNations = {
    england: isRequiredNationIncluded(countriesIncluded, 'england'),
    france: isRequiredNationIncluded(countriesIncluded, 'france'),
    brazil: isRequiredNationIncluded(countriesIncluded, 'brazil'),
    argentina: isRequiredNationIncluded(countriesIncluded, 'argentina'),
    portugal: isRequiredNationIncluded(countriesIncluded, 'portugal'),
    spain: isRequiredNationIncluded(countriesIncluded, 'spain'),
  };

  const top10PerCategory = {};
  categories.forEach((category) => {
    top10PerCategory[category.id] = (category.playersTop10 || []).map(formatRankedPlayer);
  });

  return {
    rankingSource: 'Official World Cup 2026 48-team tournament pool',
    teamSource: squadPool.teamSource,
    officialTeamCount: OFFICIAL_WC2026_TEAM_COUNT,
    totalTeamsProcessed: squadPool.squadsProcessedCount,
    totalTeamsInPool: squadPool.teamCount,
    totalSquadsProcessed: squadPool.squadsProcessedCount,
    fixtureCount: squadPool.fixtureCount,
    groups: squadPool.groups,
    teamsFound: squadPool.teamsFound,
    teamsMissing: squadPool.teamsMissing,
    squadsProcessed: squadPool.squadsProcessed,
    squadsFailed: squadPool.squadsFailed || [],
    countriesIncluded,
    englandIncluded,
    keyNations,
    totalPlayersProcessed: squadPool.playerCount,
    totalPlayersFound: squadPool.playersFound,
    totalPlayersEnriched: enrichLog.playersEnriched,
    totalPlayersEnrichFailed: enrichLog.playersEnrichFailed,
    totalPlayersWithVerifiedClubStats: pool.length,
    categoriesGenerated: categories.length,
    top10PerCategory,
    top20Goalscorers: rankPoolByMetric(pool, 'goals', DEBUG_TOP_N).map(formatRankedPlayer),
    top20Assists: rankPoolByMetric(pool, 'assists', DEBUG_TOP_N).map(formatRankedPlayer),
    top20FoulsWon: rankPoolByMetric(pool, 'foulsDrawn', DEBUG_TOP_N).map(formatRankedPlayer),
    top20DisciplineRisks: rankPoolByMetric(pool, 'disciplineRisk', DEBUG_TOP_N).map(formatRankedPlayer),
    top20ChanceCreators: rankPoolByMetric(pool, 'chanceCreation', DEBUG_TOP_N).map(formatRankedPlayer),
    teamsUsed: squadPool.squadsProcessedCount,
    teamsExcluded: [],
    mockDataUsed: false,
    harryKane: findHarryKane(squadPool.players, pool),
    enrichLog,
    cache: {
      squadPool: squadPool._cache || null,
      rankings: rankingsCache || null,
    },
    endpoints: [
      'GET /fixtures?league=1&season=2026 (team id lookup only)',
      'GET /players/squads?team={teamId}',
      'GET /players?id={playerId}&season={2025|2026|2024}',
    ],
  };
}

export async function buildHomepageRankingsDebug(apiKey, options = {}) {
  const squadPool = await getOrBuildOfficialSquadPool(apiKey);

  if (squadPool.teamCount !== OFFICIAL_WC2026_TEAM_COUNT) {
    throw new Error(`Expected ${OFFICIAL_WC2026_TEAM_COUNT} teams before enrichment, got ${squadPool.teamCount}`);
  }

  const enrichLog = {
    playersProcessed: squadPool.players.length,
    playersEnriched: 0,
    playersEnrichFailed: 0,
    playersNoClubStat: 0,
  };

  const enriched = await mapWithConcurrency(squadPool.players, STAT_CONCURRENCY, async (player) => {
    try {
      const bundle = await fetchPlayerStatisticsBundle(apiKey, player.id, player.nationalTeam);
      const clubStat = pickClubStatRow(bundle.statistics, player.nationalTeam);
      if (!clubStat) {
        enrichLog.playersNoClubStat += 1;
        enrichLog.playersEnrichFailed += 1;
        return null;
      }
      const ranked = buildRankingPlayer(player, bundle.profile, clubStat, player.nationalTeam);
      if (ranked) {
        enrichLog.playersEnriched += 1;
        return ranked;
      }
      enrichLog.playersEnrichFailed += 1;
      return null;
    } catch {
      enrichLog.playersEnrichFailed += 1;
      return null;
    }
  });

  console.info('[home-rankings] enrichment complete', enrichLog);

  const pool = enriched.filter(Boolean);

  const categoryDefs = [
    { id: 'top-goalscorers', title: 'Top Goalscorers', metric: 'goals', unit: 'goals' },
    { id: 'top-assists', title: 'Top Assist Providers', metric: 'assists', unit: 'assists' },
    { id: 'most-fouled', title: 'Most Fouled Players', metric: 'foulsDrawn', unit: 'fouls' },
    { id: 'discipline-risks', title: 'Discipline Risks', metric: 'disciplineRisk', unit: 'risk points' },
    { id: 'chance-creators', title: 'Chance Creators', metric: 'chanceCreation', unit: 'chances' },
  ];

  const categories = categoryDefs.map((def) => {
    const top10 = rankPoolByMetric(pool, def.metric, TOP_N);
    return {
      id: def.id,
      title: def.title,
      unit: def.unit,
      players: top10.slice(0, CARD_N),
      playersTop10: top10,
    };
  });

  const debug = buildDebugReport({
    squadPool,
    pool,
    enrichLog,
    categories,
    rankingsCache: options.rankingsCache || null,
  });

  return {
    ok: true,
    categories,
    debug,
    ...debug,
  };
}

/** Client-facing payload: categories + debug only */
export async function buildHomepageRankingsPayload(apiKey, options = {}) {
  const result = await buildHomepageRankingsDebug(apiKey, options);
  return {
    categories: result.categories,
    debug: result.debug,
  };
}
