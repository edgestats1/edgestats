/**
 * Fetch official World Cup 2026 knockout fixtures from API-Football.
 * Used by scripts/update-knockout-fixtures.js and prediction dashboard.
 */

import { apiFootballFetch } from '../../api/_lib/api-football-fetch.js';
import { resolveOfficialTeamName } from './power-rankings-lib.js';
import { COMPLETED_STATUSES, WC_LEAGUE, WC_SEASON } from './export-lib.js';

export const KNOCKOUT_FIXTURES_VERSION = 'wc2026-knockout-fixtures-v1';
export const KNOCKOUT_FIXTURES_PATH = 'data/worldcup-live/worldcup-knockout-fixtures.json';

const FETCH_RETRY_ATTEMPTS = 4;
const FETCH_RETRY_DELAY_MS = 800;

const KNOCKOUT_ROUND_PATTERNS = [
  /round of 32/i,
  /round of 16/i,
  /8th finals/i,
  /quarter.?final/i,
  /semi.?final/i,
  /third.?place|3rd place/i,
  /\bfinal\b/i,
];

const EXCLUDED_ROUND_PATTERNS = [
  /group stage/i,
  /qualification|qualifying/i,
  /preliminary|play.?off/i,
  /friendlies/i,
];

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

export function isKnockoutRound(round) {
  if (!round || typeof round !== 'string') return false;
  if (EXCLUDED_ROUND_PATTERNS.some((pattern) => pattern.test(round))) return false;
  return KNOCKOUT_ROUND_PATTERNS.some((pattern) => pattern.test(round));
}

export function extractStage(round) {
  if (!round) return null;
  const normalized = round.trim();
  if (/round of 32/i.test(normalized)) return 'Round of 32';
  if (/round of 16|8th finals/i.test(normalized)) return 'Round of 16';
  if (/quarter.?final/i.test(normalized)) return 'Quarter-finals';
  if (/semi.?final/i.test(normalized)) return 'Semi-finals';
  if (/third.?place|3rd place/i.test(normalized)) return 'Third place';
  if (/\bfinal\b/i.test(normalized)) return 'Final';
  return normalized;
}

export function isUpcomingFixtureStatus(statusShort) {
  return !COMPLETED_STATUSES.includes(statusShort);
}

function formatKickoffLocal(isoDate, timezone) {
  if (!isoDate || !timezone || timezone === 'UTC') return null;
  try {
    return new Date(isoDate).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    });
  } catch {
    return null;
  }
}

export function normalizeKnockoutFixture(item) {
  const fixture = item.fixture;
  const round = item.league?.round ?? null;

  return {
    fixtureId: fixture.id,
    round,
    stage: extractStage(round),
    kickoffUTC: fixture.date ? new Date(fixture.date).toISOString() : null,
    kickoffLocal: formatKickoffLocal(fixture.date, fixture.timezone),
    homeTeam: item.teams.home.name,
    awayTeam: item.teams.away.name,
    homeTeamId: item.teams.home.id,
    awayTeamId: item.teams.away.id,
    homeTeamOfficial: resolveOfficialTeamName(item.teams.home.name),
    awayTeamOfficial: resolveOfficialTeamName(item.teams.away.name),
    venue: fixture.venue?.name ?? null,
    city: fixture.venue?.city ?? null,
    status: fixture.status?.short ?? null,
    source: 'api-football',
  };
}

export async function fetchKnockoutFixturesFromApi(apiKey) {
  const fixturesResult = await fetchWithRetry('/fixtures', {
    league: WC_LEAGUE,
    season: WC_SEASON,
    timezone: 'UTC',
  }, apiKey);

  const rawFixtures = fixturesResult.response || [];

  const fixtures = rawFixtures
    .filter((item) => isKnockoutRound(item.league?.round))
    .filter((item) => isUpcomingFixtureStatus(item.fixture?.status?.short))
    .map(normalizeKnockoutFixture)
    .sort((a, b) => {
      const aTime = a.kickoffUTC ? Date.parse(a.kickoffUTC) : 0;
      const bTime = b.kickoffUTC ? Date.parse(b.kickoffUTC) : 0;
      return aTime - bTime;
    });

  return fixtures;
}

export async function buildKnockoutFixturesExport(apiKey) {
  const exportedAt = new Date().toISOString();
  const fixtures = await fetchKnockoutFixturesFromApi(apiKey);

  if (!fixtures.length) {
    const error = new Error('No official knockout fixtures found from API-Football.');
    error.code = 'NO_KNOCKOUT_FIXTURES';
    throw error;
  }

  const rounds = [...new Set(fixtures.map((fixture) => fixture.stage).filter(Boolean))];

  return {
    version: KNOCKOUT_FIXTURES_VERSION,
    exportedAt,
    source: 'api-football',
    league: WC_LEAGUE,
    season: WC_SEASON,
    leagueName: 'World Cup',
    rounds,
    fixtureCount: fixtures.length,
    fixtures,
  };
}
