/**
 * World Cup 2026 live tournament export — completed matches only.
 * Used by scripts/update-worldcup-live-stats.js (not connected to the website).
 */

import { apiFootballFetch } from './api-football-fetch.js';

export const WC_LEAGUE = 1;
export const WC_SEASON = 2026;
export const EXPORT_VERSION = 'wc2026-live-export-v1';

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

export function normalizeFixture(item) {
  const fixture = item.fixture;
  const statusShort = fixture.status.short;

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
  return {
    shots: parseStatValue(statistics, ['Total Shots']),
    shotsOnTarget: parseStatValue(statistics, ['Shots on Goal']),
    corners: parseStatValue(statistics, ['Corner Kicks']),
    foulsCommitted: parseStatValue(statistics, ['Fouls']),
    yellowCards: parseStatValue(statistics, ['Yellow Cards']),
    redCards: parseStatValue(statistics, ['Red Cards']),
    saves: parseStatValue(statistics, ['Goalkeeper Saves']),
    possession: parseStatValue(statistics, ['Ball Possession']),
    passes: parseStatValue(statistics, ['Total passes']),
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

function aggregateTeamTotals(teamMatchStats) {
  const byTeam = new Map();

  for (const row of teamMatchStats) {
    if (!byTeam.has(row.team)) {
      byTeam.set(row.team, []);
    }
    byTeam.get(row.team).push(row);
  }

  return Array.from(byTeam.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team, rows]) => {
      const matchesPlayed = rows.length;
      const wins = rows.filter((row) => row.result === 'win').length;
      const draws = rows.filter((row) => row.result === 'draw').length;
      const losses = rows.filter((row) => row.result === 'loss').length;
      const goalsFor = sumNullable(rows.map((row) => row.goalsFor));
      const goalsAgainst = sumNullable(rows.map((row) => row.goalsAgainst));
      const totalShots = sumNullable(rows.map((row) => row.shots));
      const totalShotsOnTarget = sumNullable(rows.map((row) => row.shotsOnTarget));
      const totalCorners = sumNullable(rows.map((row) => row.corners));
      const totalFoulsCommitted = sumNullable(rows.map((row) => row.foulsCommitted));
      const totalYellowCards = sumNullable(rows.map((row) => row.yellowCards));
      const totalRedCards = sumNullable(rows.map((row) => row.redCards));
      const totalSaves = sumNullable(rows.map((row) => row.saves));

      return {
        team,
        matchesPlayed,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor != null && goalsAgainst != null ? goalsFor - goalsAgainst : null,
        totalShots,
        totalShotsOnTarget,
        totalCorners,
        totalFoulsCommitted,
        totalYellowCards,
        totalRedCards,
        totalSaves,
        averages: {
          goalsFor: averageNullable(goalsFor, matchesPlayed),
          goalsAgainst: averageNullable(goalsAgainst, matchesPlayed),
          shots: averageNullable(totalShots, matchesPlayed),
          shotsOnTarget: averageNullable(totalShotsOnTarget, matchesPlayed),
          corners: averageNullable(totalCorners, matchesPlayed),
          foulsCommitted: averageNullable(totalFoulsCommitted, matchesPlayed),
          yellowCards: averageNullable(totalYellowCards, matchesPlayed),
          redCards: averageNullable(totalRedCards, matchesPlayed),
          saves: averageNullable(totalSaves, matchesPlayed),
        },
      };
    });
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

function buildMatchResult(fixture) {
  return {
    matchId: fixture.matchId,
    date: fixture.date,
    group: fixture.group,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    statusShort: fixture.statusShort,
    venue: fixture.venue,
    city: fixture.city,
  };
}

async function processCompletedFixture(fixture, apiKey) {
  const [statisticsData, playersData] = await Promise.all([
    fetchWithRetry('/fixtures/statistics', { fixture: fixture.matchId }, apiKey),
    fetchWithRetry('/fixtures/players', { fixture: fixture.matchId }, apiKey),
  ]);

  return {
    teamMatchStats: parseFixtureTeamMatchStats(fixture, statisticsData),
    playerMatchStats: parseFixturePlayerMatchStats(fixture, playersData),
    matchResult: buildMatchResult(fixture),
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
    filesWritten: [
      'worldcup-live-match-results.json',
      'worldcup-live-team-stats.json',
      'worldcup-live-player-stats.json',
      'worldcup-live-summary.json',
    ],
    notes: [
      'Includes only World Cup 2026 fixtures with completed status (FT, AET, PEN, AWD, WO).',
      'Upcoming and live matches are excluded.',
      'Missing API fields are exported as null.',
    ],
  };

  return {
    summary,
    matchResults: {
      version: EXPORT_VERSION,
      exportedAt,
      league: WC_LEAGUE,
      season: WC_SEASON,
      matches: matchResults,
    },
    teamStats: {
      version: EXPORT_VERSION,
      exportedAt,
      league: WC_LEAGUE,
      season: WC_SEASON,
      matchStats: teamMatchStats,
      teamTotals,
    },
    playerStats: {
      version: EXPORT_VERSION,
      exportedAt,
      league: WC_LEAGUE,
      season: WC_SEASON,
      matchStats: playerMatchStats,
      playerTotals,
    },
  };
}
