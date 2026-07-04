/**
 * Debug route: trace player/club stat pipeline for Match Centre.
 * GET /api/debug-player-stats
 * GET /api/debug-player-stats?playerId=123
 * GET /api/debug-player-stats?fixtureId=456&teamSide=home
 */

import {
  apiFootballFetch,
  pickClubStatRow,
  pickInternationalStatRow,
  findPlayerInFixturePlayers,
} from './_lib/api-football-fetch.js';
import { getCachedHomepageRankingsDebugReport } from './_lib/cached-api-football.js';

const COMPLETED = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const CLUB_SEASONS = [2025, 2026, 2024];
const WC_SEASON = 2026;
const WC_LEAGUE = 1;

async function resolveSamplePlayer(apiKey, playerId, fixtureId, teamSide) {
  if (playerId) {
    return {
      playerId: Number(playerId),
      nationalTeamId: null,
      nationalTeamName: null,
      source: 'query-playerId',
    };
  }

  let fixture;
  if (fixtureId) {
    const fx = await apiFootballFetch('/fixtures', { id: fixtureId }, apiKey);
    fixture = fx.response?.[0] || null;
  } else {
    const upcoming = await apiFootballFetch('/fixtures', {
      league: WC_LEAGUE,
      season: WC_SEASON,
      next: 1,
    }, apiKey);
    fixture = upcoming.response?.[0] || null;
  }

  if (!fixture) return null;

  const side = teamSide === 'away' ? 'away' : 'home';
  const team = fixture.teams[side];
  const squad = await apiFootballFetch('/players/squads', { team: team.id }, apiKey);
  const players = squad.response?.[0]?.players || [];
  const sample = players.find((p) => p.id) || null;

  if (!sample) return null;

  return {
    playerId: sample.id,
    playerName: sample.name,
    nationalTeamId: team.id,
    nationalTeamName: team.name,
    fixtureId: fixture.fixture.id,
    source: 'fixture-squad-sample',
  };
}

function summarizeStatRow(stat) {
  if (!stat) return null;
  return {
    team: stat.team?.name || null,
    teamId: stat.team?.id || null,
    league: stat.league?.name || null,
    leagueId: stat.league?.id || null,
    season: stat.league?.season || null,
    appearances: stat.games?.appearances ?? stat.games?.appearences ?? null,
    minutes: stat.games?.minutes ?? null,
    goals: stat.goals?.total ?? null,
    assists: stat.goals?.assists ?? null,
    rating: stat.games?.rating ?? null,
  };
}

function playerAppeared(entry) {
  if (!entry?.statistics?.[0]) return false;
  const stats = entry.statistics[0];
  const games = stats.games || {};
  const goals = stats.goals || {};
  return (games.minutes != null && games.minutes > 0)
    || goals.total != null
    || goals.assists != null
    || games.rating != null;
}

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API_FOOTBALL_KEY is not configured.' });
  }

  if (req.query.scope === 'homepage-rankings' || req.query.scope === 'home-rankings') {
    try {
      const report = await getCachedHomepageRankingsDebugReport();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('X-EdgeStats-Debug-Source', report.ready ? 'cached' : 'cache-miss');

      if (!report.ready) {
        return res.status(200).json(report);
      }

      return res.status(200).json(report.payload);
    } catch (err) {
      console.error('home-rankings debug error:', err);
      return res.status(500).json({
        ok: false,
        cacheReady: false,
        error: 'Homepage rankings debug failed.',
        message: err.message,
      });
    }
  }

  const sample = await resolveSamplePlayer(
    apiKey,
    req.query.playerId,
    req.query.fixtureId,
    req.query.teamSide,
  );

  if (!sample) {
    return res.status(404).json({
      ok: false,
      error: 'Could not resolve a sample player. Pass ?playerId= or ?fixtureId=',
    });
  }

  const steps = [];
  const playerId = sample.playerId;
  let profile = null;
  let allStatistics = [];
  let clubRow = null;
  let intlRow = null;
  let seasonsUsed = [];

  for (const season of [WC_SEASON, ...CLUB_SEASONS]) {
    const result = await apiFootballFetch('/players', { id: playerId, season }, apiKey);
    const entry = result.response?.[0] || null;
    steps.push({
      step: season === WC_SEASON ? 'A-world-cup-player-stats' : 'C-club-season-player-stats',
      endpoint: 'GET /players',
      params: { id: playerId, season },
      httpStatus: result.status,
      ok: result.ok,
      responseCount: result.results,
      apiError: result.error,
      apiErrors: result.errors,
      url: result.url,
    });

    if (!result.ok) continue;
    if (entry?.player) profile = entry.player;
    if (entry?.statistics?.length) {
      seasonsUsed.push(season);
      allStatistics = allStatistics.concat(entry.statistics);
    }
  }

  const nationalTeamName = sample.nationalTeamName || null;
  intlRow = pickInternationalStatRow(allStatistics, nationalTeamName);
  clubRow = pickClubStatRow(allStatistics, nationalTeamName);

  const invalidPlayerFixtures = await apiFootballFetch('/fixtures', {
    player: playerId,
    last: 12,
  }, apiKey);

  steps.push({
    step: 'INVALID-legacy-player-fixtures-param',
    endpoint: 'GET /fixtures',
    params: { player: playerId, last: 12 },
    httpStatus: invalidPlayerFixtures.status,
    ok: invalidPlayerFixtures.ok,
    responseCount: invalidPlayerFixtures.results,
    apiError: invalidPlayerFixtures.error,
    apiErrors: invalidPlayerFixtures.errors,
    url: invalidPlayerFixtures.url,
    note: 'API-Football /fixtures does NOT document a player parameter. This call often returns 0 results and was the root cause of empty last-5 logs.',
  });

  let lastFiveDiagnosis = {
    emptyReason: null,
    fallbackUsed: null,
    matchesFound: 0,
    matchesWithPlayerStats: 0,
    logPreview: [],
  };

  const clubTeamId = clubRow?.team?.id || null;
  const clubSeason = clubRow?.league?.season || CLUB_SEASONS[0];
  let fixtureCandidates = [];

  if (clubTeamId) {
    for (const season of [clubSeason, ...CLUB_SEASONS]) {
      const clubFixtures = await apiFootballFetch('/fixtures', {
        team: clubTeamId,
        season,
        last: 15,
      }, apiKey);

      steps.push({
        step: 'D-club-team-fixtures',
        endpoint: 'GET /fixtures',
        params: { team: clubTeamId, season, last: 15 },
        httpStatus: clubFixtures.status,
        ok: clubFixtures.ok,
        responseCount: clubFixtures.results,
        apiError: clubFixtures.error,
        apiErrors: clubFixtures.errors,
        url: clubFixtures.url,
      });

      if (clubFixtures.ok && clubFixtures.response.length) {
        fixtureCandidates = clubFixtures.response.filter((item) => {
          const status = item.fixture?.status?.short;
          return COMPLETED.includes(status);
        });
        if (fixtureCandidates.length) {
          lastFiveDiagnosis.fallbackUsed = 'club-team-fixtures';
          break;
        }
      }
    }
  }

  if (!fixtureCandidates.length && sample.nationalTeamId) {
    const natFixtures = await apiFootballFetch('/fixtures', {
      team: sample.nationalTeamId,
      last: 15,
    }, apiKey);

    steps.push({
      step: 'B-national-team-fixtures',
      endpoint: 'GET /fixtures',
      params: { team: sample.nationalTeamId, last: 15 },
      httpStatus: natFixtures.status,
      ok: natFixtures.ok,
      responseCount: natFixtures.results,
      apiError: natFixtures.error,
      apiErrors: natFixtures.errors,
      url: natFixtures.url,
    });

    fixtureCandidates = (natFixtures.response || []).filter((item) => {
      const status = item.fixture?.status?.short;
      return COMPLETED.includes(status);
    });
    if (fixtureCandidates.length) {
      lastFiveDiagnosis.fallbackUsed = 'national-team-fixtures';
    }
  }

  lastFiveDiagnosis.matchesFound = fixtureCandidates.length;

  const logPreview = [];
  for (const item of fixtureCandidates.slice(0, 8)) {
    const fixtureId = item.fixture?.id;
    if (!fixtureId) continue;

    const fxPlayers = await apiFootballFetch('/fixtures/players', { fixture: fixtureId }, apiKey);
    steps.push({
      step: 'D-fixture-players',
      endpoint: 'GET /fixtures/players',
      params: { fixture: fixtureId },
      httpStatus: fxPlayers.status,
      ok: fxPlayers.ok,
      responseCount: fxPlayers.results,
      apiError: fxPlayers.error,
      apiErrors: fxPlayers.errors,
      url: fxPlayers.url,
      fixtureLabel: `${item.teams?.home?.name || 'Home'} vs ${item.teams?.away?.name || 'Away'}`,
    });

    const entry = findPlayerInFixturePlayers(fxPlayers, playerId);
    const appeared = playerAppeared(entry);
    if (appeared) {
      lastFiveDiagnosis.matchesWithPlayerStats += 1;
      const stats = entry.statistics[0];
      logPreview.push({
        fixtureId,
        match: `${item.teams?.home?.name} vs ${item.teams?.away?.name}`,
        goals: stats.goals?.total ?? null,
        assists: stats.goals?.assists ?? null,
        minutes: stats.games?.minutes ?? null,
        rating: stats.games?.rating ?? null,
      });
    }

    if (logPreview.length >= 5) break;
  }

  lastFiveDiagnosis.logPreview = logPreview;

  if (!logPreview.length) {
    if (!clubRow) {
      lastFiveDiagnosis.emptyReason = 'No club season row found in /players responses — cannot resolve club team id for fixture lookup.';
    } else if (!fixtureCandidates.length) {
      lastFiveDiagnosis.emptyReason = 'No completed fixtures returned for club team (GET /fixtures?team=&season=&last=).';
    } else if (invalidPlayerFixtures.results > 0 && fixtureCandidates.length === 0) {
      lastFiveDiagnosis.emptyReason = 'Legacy code used GET /fixtures?player= which is not a documented API-Football parameter.';
    } else {
      lastFiveDiagnosis.emptyReason = 'Fixtures found but player did not appear in /fixtures/players responses (not in squad/minutes for those matches).';
    }
  } else {
    lastFiveDiagnosis.emptyReason = null;
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    sample,
    player: {
      id: playerId,
      name: profile?.name || sample.playerName || null,
      nationalTeam: nationalTeamName,
    },
    clubDetected: clubRow ? {
      teamId: clubRow.team?.id,
      teamName: clubRow.team?.name,
      leagueId: clubRow.league?.id,
      leagueName: clubRow.league?.name,
      season: clubRow.league?.season,
    } : null,
    nationalDetected: intlRow ? summarizeStatRow(intlRow) : null,
    clubSeasonStats: summarizeStatRow(clubRow),
    seasonsUsed,
    endpointsCalled: steps.map((s) => ({ step: s.step, url: s.url, responseCount: s.responseCount, ok: s.ok })),
    steps,
    lastFiveDiagnosis,
    recommendedFix: logPreview.length
      ? 'Use GET /fixtures?team={clubTeamId}&season={clubSeason}&last=N then GET /fixtures/players?fixture={id} per match.'
      : 'Ensure /players returns a club stat row, then fetch club team fixtures by team id + season (not player id).',
  });
}
