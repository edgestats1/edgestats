/**
 * World Cup 2026 live tournament export — completed matches only.
 * Used by scripts/update-worldcup-live-stats.js (not connected to the website).
 */

import { apiFootballFetch } from '../../api/_lib/api-football-fetch.js';
import { buildPowerRankings } from './power-rankings-lib.js';
import {
  enrichTeamTotals,
  buildEnhancedMatchResult,
  buildGoalkeeperRankings,
  buildCornerTrends,
  buildCardTrends,
  buildRound1Analysis,
  buildPowerLookup,
  ROUND1_EXPORT_VERSION,
} from './round1-exports-lib.js';

export const WC_LEAGUE = 1;
export const WC_SEASON = 2026;
export const EXPORT_VERSION = 'wc2026-live-export-v4';

export const COMPLETED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
export const LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'];

const FIXTURE_CONCURRENCY = 3;
const FETCH_RETRY_ATTEMPTS = 4;
const FETCH_RETRY_DELAY_MS = 800;
const BATCH_DELAY_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(path, params, apiKey, attempts = FETCH_RETRY_ATTEMPTS) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await apiFootballFetch(path, params, apiKey);
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

function formatGroup(round) {
  if (!round) return null;
  return round.replace('Group Stage - ', 'Group ');
}

function formatDate(isoDate) {
  if (!isoDate) return null;
  return new Date(isoDate).toISOString();
}

function mapFixtureStatus(statusShort) {
  if (COMPLETED_STATUSES.includes(statusShort)) return 'completed';
  if (LIVE_STATUSES.includes(statusShort)) return 'live';
  return 'upcoming';
}

function parseRefereeField(refereeStr) {
  if (!refereeStr || typeof refereeStr !== 'string') {
    return { name: null, nationality: null };
  }

  const trimmed = refereeStr.trim();
  if (!trimmed) {
    return { name: null, nationality: null };
  }

  const commaIdx = trimmed.lastIndexOf(',');
  if (commaIdx > 0) {
    const name = trimmed.slice(0, commaIdx).trim();
    const nationality = trimmed.slice(commaIdx + 1).trim();
    return {
      name: name || null,
      nationality: nationality || null,
    };
  }

  return { name: trimmed, nationality: null };
}

export function normalizeFixture(item) {
  const fixture = item.fixture;
  const statusShort = fixture.status.short;
  const parsedReferee = parseRefereeField(fixture.referee);

  return {
    matchId: fixture.id,
    date: formatDate(fixture.date),
    group: formatGroup(item.league?.round),
    homeTeam: item.teams.home.name,
    homeTeamId: item.teams.home.id,
    awayTeam: item.teams.away.name,
    awayTeamId: item.teams.away.id,
    homeScore: item.goals.home,
    awayScore: item.goals.away,
    statusShort,
    status: mapFixtureStatus(statusShort),
    venue: fixture.venue?.name || fixture.venue?.city || null,
    city: fixture.venue?.city || null,
    refereeName: parsedReferee.name,
    refereeNationality: parsedReferee.nationality,
  };
}

function parseStatValue(statistics, typeNames) {
  if (!Array.isArray(statistics)) return null;

  const names = Array.isArray(typeNames) ? typeNames : [typeNames];
  for (const name of names) {
    const entry = statistics.find((stat) => stat.type === name);
    if (!entry || entry.value == null || entry.value === '') continue;

    if (typeof entry.value === 'string' && entry.value.endsWith('%')) {
      const num = parseFloat(entry.value.replace('%', ''));
      return Number.isFinite(num) ? num : null;
    }

    const num = Number(entry.value);
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

function parseTeamStatisticsBlock(statistics) {
  const passes = parseStatValue(statistics, ['Total passes']);
  const passesAccurate = parseStatValue(statistics, ['Passes accurate']);
  let passAccuracy = parseStatValue(statistics, ['Passes %', 'Pass Accuracy']);

  if (passAccuracy == null && passes != null && passesAccurate != null && passes > 0) {
    passAccuracy = roundNullable((passesAccurate / passes) * 100, 1);
  }

  return {
    shots: parseStatValue(statistics, ['Total Shots']),
    shotsOnTarget: parseStatValue(statistics, ['Shots on Goal']),
    corners: parseStatValue(statistics, ['Corner Kicks']),
    foulsCommitted: parseStatValue(statistics, ['Fouls']),
    yellowCards: parseStatValue(statistics, ['Yellow Cards']),
    redCards: parseStatValue(statistics, ['Red Cards']),
    saves: parseStatValue(statistics, ['Goalkeeper Saves']),
    possession: parseStatValue(statistics, ['Ball Possession']),
    passes,
    passAccuracy,
    xG: parseStatValue(statistics, ['Expected Goals', 'expected_goals', 'Expected goals']),
  };
}

function matchResult(goalsFor, goalsAgainst) {
  if (goalsFor == null || goalsAgainst == null) return null;
  if (goalsFor > goalsAgainst) return 'win';
  if (goalsFor < goalsAgainst) return 'loss';
  return 'draw';
}

function buildTeamMatchRow(fixture, side, opponentSide, teamStats) {
  const team = side === 'home' ? fixture.homeTeam : fixture.awayTeam;
  const opponent = opponentSide === 'home' ? fixture.homeTeam : fixture.awayTeam;
  const goalsFor = side === 'home' ? fixture.homeScore : fixture.awayScore;
  const goalsAgainst = side === 'home' ? fixture.awayScore : fixture.homeScore;

  return {
    team,
    opponent,
    group: fixture.group,
    matchId: fixture.matchId,
    date: fixture.date,
    goalsFor,
    goalsAgainst,
    result: matchResult(goalsFor, goalsAgainst),
    shots: teamStats.shots,
    shotsOnTarget: teamStats.shotsOnTarget,
    corners: teamStats.corners,
    foulsCommitted: teamStats.foulsCommitted,
    foulsDrawn: null,
    yellowCards: teamStats.yellowCards,
    redCards: teamStats.redCards,
    saves: teamStats.saves,
    possession: teamStats.possession,
    passes: teamStats.passes,
    passAccuracy: teamStats.passAccuracy,
    xG: teamStats.xG,
  };
}

function parseFixtureTeamMatchStats(fixture, statisticsData) {
  const blocks = statisticsData.response || [];
  const homeBlock = blocks.find((block) => block.team?.id === fixture.homeTeamId);
  const awayBlock = blocks.find((block) => block.team?.id === fixture.awayTeamId);

  const homeStats = parseTeamStatisticsBlock(homeBlock?.statistics);
  const awayStats = parseTeamStatisticsBlock(awayBlock?.statistics);

  return [
    buildTeamMatchRow(fixture, 'home', 'away', homeStats),
    buildTeamMatchRow(fixture, 'away', 'home', awayStats),
  ];
}

function playerAppeared(entry) {
  const stats = entry?.statistics?.[0];
  if (!stats) return false;

  const games = stats.games || {};
  const goals = stats.goals || {};

  return (games.minutes != null && games.minutes > 0)
    || (goals.total != null && goals.total > 0)
    || (goals.assists != null && goals.assists > 0)
    || (goals.saves != null && goals.saves > 0)
    || games.rating != null;
}

function parsePlayerMatchRow(fixture, teamName, opponentName, entry) {
  const stats = entry.statistics?.[0] || {};
  const games = stats.games || {};
  const goals = stats.goals || {};
  const shots = stats.shots || {};
  const fouls = stats.fouls || {};
  const cards = stats.cards || {};
  const passes = stats.passes || {};

  return {
    playerId: entry.player?.id ?? null,
    playerName: entry.player?.name ?? null,
    team: teamName,
    opponent: opponentName,
    matchId: fixture.matchId,
    minutes: games.minutes ?? null,
    goals: goals.total ?? null,
    assists: goals.assists ?? null,
    shots: shots.total ?? null,
    shotsOnTarget: shots.on ?? null,
    chancesCreated: passes.key ?? null,
    foulsCommitted: fouls.committed ?? null,
    foulsDrawn: fouls.drawn ?? null,
    yellowCards: cards.yellow ?? null,
    redCards: cards.red ?? null,
    saves: goals.saves ?? null,
    position: games.position ?? null,
  };
}

function parseFixturePlayerMatchStats(fixture, playersData) {
  const rows = [];

  for (const teamBlock of playersData.response || []) {
    const teamId = teamBlock.team?.id;
    const teamName = teamBlock.team?.name ?? null;
    const isHome = teamId === fixture.homeTeamId;
    const opponentName = isHome ? fixture.awayTeam : fixture.homeTeam;

    for (const entry of teamBlock.players || []) {
      if (!playerAppeared(entry)) continue;
      rows.push(parsePlayerMatchRow(fixture, teamName, opponentName, entry));
    }
  }

  return rows;
}

function sumNullable(values) {
  const nums = values.filter((value) => value != null && Number.isFinite(Number(value)));
  if (!nums.length) return null;
  return nums.reduce((total, value) => total + Number(value), 0);
}

function averageNullable(total, count) {
  if (total == null || !count) return null;
  return Math.round((total / count) * 100) / 100;
}

function roundNullable(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function eventMinute(event) {
  const elapsed = event.time?.elapsed;
  if (elapsed == null || !Number.isFinite(Number(elapsed))) return null;
  const extra = event.time?.extra ?? 0;
  return Number(elapsed) + (Number.isFinite(Number(extra)) ? Number(extra) : 0);
}

function parseCardTiming(eventsData) {
  const events = eventsData?.response || [];
  let firstYellowMinute = null;
  let firstRedMinute = null;

  for (const event of events) {
    if (event.type !== 'Card') continue;

    const minute = eventMinute(event);
    if (minute == null) continue;

    const detail = (event.detail || '').toLowerCase();
    const isYellow = detail.includes('yellow') && !detail.includes('yellow-red');
    const isRed = detail.includes('red');

    if (isYellow && firstYellowMinute == null) {
      firstYellowMinute = minute;
    }

    if (isRed && firstRedMinute == null) {
      firstRedMinute = minute;
    }
  }

  return { firstYellowMinute, firstRedMinute };
}

function calcRefereeStyle(totalYellowCards, totalFouls) {
  if (totalYellowCards == null && totalFouls == null) return null;

  const yellow = totalYellowCards ?? 0;
  const foulsPerYellowCard = (totalFouls != null && yellow > 0)
    ? totalFouls / yellow
    : null;

  if (yellow >= 6 || (foulsPerYellowCard != null && foulsPerYellowCard <= 4)) {
    return 'strict';
  }

  if (yellow <= 2 || (foulsPerYellowCard != null && foulsPerYellowCard >= 8)) {
    return 'low-card';
  }

  if (yellow >= 3 && yellow <= 5) {
    return 'balanced';
  }

  return null;
}

function buildRefereeBlock(fixture, teamMatchStats, eventsData) {
  const totalFouls = sumNullable(teamMatchStats.map((row) => row.foulsCommitted));
  const totalYellowCards = sumNullable(teamMatchStats.map((row) => row.yellowCards));
  const totalRedCards = sumNullable(teamMatchStats.map((row) => row.redCards));
  const { firstYellowMinute, firstRedMinute } = parseCardTiming(eventsData);

  const foulsPerYellowCard = (totalFouls != null && totalYellowCards != null && totalYellowCards > 0)
    ? roundNullable(totalFouls / totalYellowCards)
    : null;

  const cardsPerMatch = (totalYellowCards != null || totalRedCards != null)
    ? (totalYellowCards ?? 0) + (totalRedCards ?? 0)
    : null;

  const refereeStyle = calcRefereeStyle(totalYellowCards, totalFouls);

  return {
    name: fixture.refereeName,
    nationality: fixture.refereeNationality,
    totalFouls,
    totalYellowCards,
    totalRedCards,
    firstYellowMinute,
    firstRedMinute,
    foulsPerYellowCard,
    cardsPerMatch,
    refereeStyle,
  };
}

function calculateRawPlayerCardRisk(playerMatchStats, teamMatchStats) {
  const foulSum = sumNullable(playerMatchStats.map((row) => row.foulsCommitted));

  if (foulSum != null && foulSum > 0) {
    return roundNullable(foulSum / 6.5);
  }

  const teamYellow = sumNullable(teamMatchStats.map((row) => row.yellowCards));
  const teamRed = sumNullable(teamMatchStats.map((row) => row.redCards));

  if (teamYellow != null || teamRed != null) {
    return (teamYellow ?? 0) + (teamRed ?? 0);
  }

  return null;
}

function buildCardMarketSignal(referee, playerMatchStats, teamMatchStats) {
  const rawPlayerCardRisk = calculateRawPlayerCardRisk(playerMatchStats, teamMatchStats);
  const style = referee?.refereeStyle;

  if (!referee?.name && rawPlayerCardRisk == null) {
    return {
      rawPlayerCardRisk: null,
      refereeAdjustment: null,
      adjustedCardProjection: { low: null, high: null },
      notes: 'Referee and player discipline data unavailable from API.',
    };
  }

  if (!referee?.name) {
    return {
      rawPlayerCardRisk,
      refereeAdjustment: null,
      adjustedCardProjection: { low: null, high: null },
      notes: 'Referee data unavailable from API; card projection not adjusted.',
    };
  }

  if (style == null) {
    return {
      rawPlayerCardRisk,
      refereeAdjustment: null,
      adjustedCardProjection: { low: null, high: null },
      notes: 'Referee assigned but insufficient card/foul data to classify referee style.',
    };
  }

  if (rawPlayerCardRisk == null) {
    return {
      rawPlayerCardRisk: null,
      refereeAdjustment: null,
      adjustedCardProjection: { low: null, high: null },
      notes: `Referee style classified as ${style}, but player card risk baseline is unavailable.`,
    };
  }

  if (style === 'low-card') {
    return {
      rawPlayerCardRisk,
      refereeAdjustment: 'down',
      adjustedCardProjection: {
        low: roundNullable(rawPlayerCardRisk * 0.60),
        high: roundNullable(rawPlayerCardRisk * 0.75),
      },
      notes: 'Low-card referee profile; projected cards reduced by roughly 25–40%.',
    };
  }

  if (style === 'strict') {
    return {
      rawPlayerCardRisk,
      refereeAdjustment: 'up',
      adjustedCardProjection: {
        low: roundNullable(rawPlayerCardRisk * 1.20),
        high: roundNullable(rawPlayerCardRisk * 1.35),
      },
      notes: 'Strict referee profile; projected cards increased by roughly 20–35%.',
    };
  }

  return {
    rawPlayerCardRisk,
    refereeAdjustment: 'neutral',
    adjustedCardProjection: {
      low: roundNullable(rawPlayerCardRisk * 0.95),
      high: roundNullable(rawPlayerCardRisk * 1.05),
    },
    notes: 'Balanced referee profile; card projection unchanged.',
  };
}

function aggregateTeamTotals(teamMatchStats) {
  return enrichTeamTotals(teamMatchStats);
}

function trackMissingFields(processed) {
  const missing = new Set();
  const fields = [
    'xG', 'passAccuracy', 'possession', 'passes', 'foulsDrawn',
    'referee.name', 'firstYellowMinute', 'scorers',
  ];

  for (const entry of processed) {
    for (const row of entry.teamMatchStats || []) {
      if (row.xG == null) missing.add('xG');
      if (row.passAccuracy == null) missing.add('passAccuracy');
      if (row.possession == null) missing.add('possession');
      if (row.passes == null) missing.add('passes');
      if (row.foulsDrawn == null) missing.add('foulsDrawn');
    }
    const match = entry.matchResult;
    if (match?.referee?.name == null) missing.add('referee.name');
    if (match?.referee?.firstYellowMinute == null && match?.referee?.totalYellowCards > 0) {
      missing.add('firstYellowMinute');
    }
    if (!match?.scorers?.home?.length && !match?.scorers?.away?.length
      && (match?.goals?.home > 0 || match?.goals?.away > 0)) {
      missing.add('scorers');
    }
  }

  return { fields: [...missing].sort(), count: missing.size };
}

function buildMatchResultLegacy(fixture, referee, cardMarketSignal, teamRows, eventsData) {
  return buildEnhancedMatchResult(fixture, teamRows, eventsData, referee, cardMarketSignal);
}

function aggregatePlayerTotals(playerMatchStats) {
  const byPlayer = new Map();

  for (const row of playerMatchStats) {
    const key = `${row.playerId ?? 'unknown'}::${row.playerName ?? ''}::${row.team ?? ''}`;
    if (!byPlayer.has(key)) {
      byPlayer.set(key, []);
    }
    byPlayer.get(key).push(row);
  }

  return Array.from(byPlayer.values())
    .map((rows) => {
      const sample = rows[0];
      const matchesPlayed = rows.length;

      return {
        playerId: sample.playerId,
        playerName: sample.playerName,
        team: sample.team,
        position: sample.position,
        matchesPlayed,
        minutes: sumNullable(rows.map((row) => row.minutes)),
        goals: sumNullable(rows.map((row) => row.goals)),
        assists: sumNullable(rows.map((row) => row.assists)),
        shots: sumNullable(rows.map((row) => row.shots)),
        shotsOnTarget: sumNullable(rows.map((row) => row.shotsOnTarget)),
        chancesCreated: sumNullable(rows.map((row) => row.chancesCreated)),
        foulsCommitted: sumNullable(rows.map((row) => row.foulsCommitted)),
        foulsDrawn: sumNullable(rows.map((row) => row.foulsDrawn)),
        yellowCards: sumNullable(rows.map((row) => row.yellowCards)),
        redCards: sumNullable(rows.map((row) => row.redCards)),
        saves: sumNullable(rows.map((row) => row.saves)),
      };
    })
    .sort((a, b) => {
      const teamCompare = (a.team || '').localeCompare(b.team || '');
      if (teamCompare !== 0) return teamCompare;
      return (a.playerName || '').localeCompare(b.playerName || '');
    });
}

function aggregateRefereeTotals(matchResults) {
  const byReferee = new Map();

  for (const match of matchResults) {
    const referee = match.referee;
    if (!referee?.name) continue;

    const key = referee.name;
    if (!byReferee.has(key)) {
      byReferee.set(key, {
        name: referee.name,
        nationality: referee.nationality,
        matches: [],
      });
    }
    byReferee.get(key).matches.push(referee);
  }

  return Array.from(byReferee.values())
    .map((entry) => {
      const { matches } = entry;
      const matchesOfficiated = matches.length;
      const totalFouls = sumNullable(matches.map((row) => row.totalFouls));
      const totalYellowCards = sumNullable(matches.map((row) => row.totalYellowCards));
      const totalRedCards = sumNullable(matches.map((row) => row.totalRedCards));
      const firstYellowMinutes = matches
        .map((row) => row.firstYellowMinute)
        .filter((value) => value != null);

      const foulsPerYellowCard = (totalFouls != null && totalYellowCards != null && totalYellowCards > 0)
        ? roundNullable(totalFouls / totalYellowCards)
        : null;

      return {
        name: entry.name,
        nationality: entry.nationality,
        matchesOfficiated,
        totalFouls,
        totalYellowCards,
        totalRedCards,
        averageFouls: averageNullable(totalFouls, matchesOfficiated),
        averageYellowCards: averageNullable(totalYellowCards, matchesOfficiated),
        averageRedCards: averageNullable(totalRedCards, matchesOfficiated),
        foulsPerYellowCard,
        averageFirstYellowMinute: firstYellowMinutes.length
          ? roundNullable(firstYellowMinutes.reduce((sum, value) => sum + value, 0) / firstYellowMinutes.length)
          : null,
        refereeStyle: calcRefereeStyle(totalYellowCards, totalFouls),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildRefereeSummary(matchResults, referees) {
  const namedReferees = referees.filter((ref) => ref.name);
  const allReferees = matchResults.map((match) => match.referee).filter(Boolean);
  const totalFouls = sumNullable(allReferees.map((ref) => ref.totalFouls));
  const totalYellowCards = sumNullable(allReferees.map((ref) => ref.totalYellowCards));

  return {
    totalRefereesTracked: namedReferees.length,
    lowCardRefs: namedReferees.filter((ref) => ref.refereeStyle === 'low-card').length,
    balancedRefs: namedReferees.filter((ref) => ref.refereeStyle === 'balanced').length,
    strictRefs: namedReferees.filter((ref) => ref.refereeStyle === 'strict').length,
    tournamentAverageYellowCards: averageNullable(totalYellowCards, matchResults.length),
    tournamentAverageFoulsPerYellowCard: (totalFouls != null && totalYellowCards != null && totalYellowCards > 0)
      ? roundNullable(totalFouls / totalYellowCards)
      : null,
  };
}

function buildMatchResult(fixture, referee, cardMarketSignal, teamRows, eventsData) {
  return buildMatchResultLegacy(fixture, referee, cardMarketSignal, teamRows, eventsData);
}

async function processCompletedFixture(fixture, apiKey) {
  const [statisticsData, playersData, eventsData] = await Promise.all([
    fetchWithRetry('/fixtures/statistics', { fixture: fixture.matchId }, apiKey),
    fetchWithRetry('/fixtures/players', { fixture: fixture.matchId }, apiKey),
    fetchWithRetry('/fixtures/events', { fixture: fixture.matchId }, apiKey),
  ]);

  const teamMatchStats = parseFixtureTeamMatchStats(fixture, statisticsData);
  const playerMatchStats = parseFixturePlayerMatchStats(fixture, playersData);
  const referee = buildRefereeBlock(fixture, teamMatchStats, eventsData);
  const cardMarketSignal = buildCardMarketSignal(referee, playerMatchStats, teamMatchStats);

  return {
    teamMatchStats,
    playerMatchStats,
    matchResult: buildMatchResult(fixture, referee, cardMarketSignal, teamMatchStats, eventsData),
  };
}

export async function buildWorldcupLiveExport(apiKey) {
  const exportedAt = new Date().toISOString();

  const fixturesResult = await fetchWithRetry('/fixtures', {
    league: WC_LEAGUE,
    season: WC_SEASON,
    timezone: 'UTC',
  }, apiKey);

  const rawFixtures = fixturesResult.response || [];
  const normalizedFixtures = rawFixtures.map(normalizeFixture);

  const completedFixtures = normalizedFixtures.filter((fixture) => fixture.status === 'completed');
  const liveFixtures = normalizedFixtures.filter((fixture) => fixture.status === 'live');
  const upcomingFixtures = normalizedFixtures.filter((fixture) => fixture.status === 'upcoming');

  const processed = await mapWithConcurrency(
    completedFixtures,
    FIXTURE_CONCURRENCY,
    async (fixture) => processCompletedFixture(fixture, apiKey),
  );

  const teamMatchStats = processed.flatMap((entry) => entry.teamMatchStats);
  const playerMatchStats = processed.flatMap((entry) => entry.playerMatchStats);
  const matchResults = processed.map((entry) => entry.matchResult);

  const teamTotals = aggregateTeamTotals(teamMatchStats);
  const playerTotals = aggregatePlayerTotals(playerMatchStats);
  const referees = aggregateRefereeTotals(matchResults);
  const refereeSummary = buildRefereeSummary(matchResults, referees);
  const missingFields = trackMissingFields(processed);

  const matchResultsPayload = {
    version: EXPORT_VERSION,
    exportedAt,
    league: WC_LEAGUE,
    season: WC_SEASON,
    round: 'Round 1',
    matches: matchResults,
  };

  const teamStatsPayload = {
    version: EXPORT_VERSION,
    exportedAt,
    league: WC_LEAGUE,
    season: WC_SEASON,
    matchStats: teamMatchStats,
    teamTotals,
  };

  const playerStatsPayload = {
    version: EXPORT_VERSION,
    exportedAt,
    league: WC_LEAGUE,
    season: WC_SEASON,
    matchStats: playerMatchStats,
    playerTotals,
  };

  const refereeStatsPayload = {
    version: EXPORT_VERSION,
    exportedAt,
    league: WC_LEAGUE,
    season: WC_SEASON,
    referees,
  };

  const power = buildPowerRankings({
    exportedAt,
    teamStats: teamStatsPayload,
    playerStats: playerStatsPayload,
    matchResults: matchResultsPayload,
    refereeStats: refereeStatsPayload,
    refereeSummary,
    completedMatchesProcessed: completedFixtures.length,
  });

  const powerLookup = buildPowerLookup(power.powerRankings);

  const goalkeeperRankings = {
    version: ROUND1_EXPORT_VERSION,
    exportedAt,
    ...buildGoalkeeperRankings({
      playerTotals,
      teamTotals,
      matchStats: teamMatchStats,
      powerByTeam: powerLookup,
    }),
  };

  const cornerTrends = {
    version: ROUND1_EXPORT_VERSION,
    exportedAt,
    ...buildCornerTrends({ teamTotals, powerByTeam: powerLookup }),
  };

  const cardTrends = {
    version: ROUND1_EXPORT_VERSION,
    exportedAt,
    ...buildCardTrends({
      teamTotals,
      refereeStats: referees,
      refereeSummary,
      powerByTeam: powerLookup,
    }),
  };

  const round1Analysis = {
    version: ROUND1_EXPORT_VERSION,
    exportedAt,
    ...buildRound1Analysis({
      teamTotals,
      matchResults: matchResultsPayload,
      goalkeeperRankings,
      cornerTrends,
      cardTrends,
      powerRankings: power.powerRankings,
    }),
  };

  const summary = {
    version: EXPORT_VERSION,
    exportedAt,
    league: WC_LEAGUE,
    season: WC_SEASON,
    source: 'api-football',
    matchesChecked: normalizedFixtures.length,
    completedMatchesProcessed: completedFixtures.length,
    skippedUpcoming: upcomingFixtures.length,
    skippedLive: liveFixtures.length,
    teamMatchStatRows: teamMatchStats.length,
    playerMatchStatRows: playerMatchStats.length,
    teamsWithTotals: teamTotals.length,
    playersWithTotals: playerTotals.length,
    refereeSummary,
    powerSummary: power.powerSummary,
    round1Summary: {
      teamsWithRound1Matches: teamTotals.length,
      round1AnalysisHighlights: round1Analysis.topOverallPower?.length ?? 0,
    },
    missingFields,
    filesWritten: [
      'worldcup-live-match-results.json',
      'worldcup-live-team-stats.json',
      'worldcup-live-player-stats.json',
      'worldcup-live-referee-stats.json',
      'worldcup-live-power-rankings.json',
      'worldcup-live-team-strength.json',
      'worldcup-live-goalkeeper-rankings.json',
      'worldcup-live-corner-trends.json',
      'worldcup-live-card-trends.json',
      'worldcup-live-round1-analysis.json',
      'worldcup-live-summary.json',
    ],
    notes: [
      'Includes only World Cup 2026 fixtures with completed status (FT, AET, PEN, AWD, WO).',
      'Upcoming and live matches are excluded.',
      'Missing API fields are exported as null.',
      'Power rankings: 65% club-season player data, 35% Round 1 (50/50 for GK and corners).',
      'No FIFA rankings, bookmaker odds, or simulated data.',
    ],
  };

  return {
    summary,
    matchResults: matchResultsPayload,
    teamStats: teamStatsPayload,
    playerStats: playerStatsPayload,
    refereeStats: refereeStatsPayload,
    powerRankings: power.powerRankings,
    teamStrength: power.teamStrength,
    goalkeeperRankings,
    cornerTrends,
    cardTrends,
    round1Analysis,
  };
}
