/**
 * Serve World Cup live leaderboards from static JSON exports (completed matches only).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildLeaderboardsFromData } from './worldcup-leaderboards-lib.js';

const DATA_DIR = join(process.cwd(), 'api', '_lib', 'wc-data');
const ROOT_DATA_DIR = join(process.cwd(), 'data', 'worldcup-live');

export const WC_LEADERBOARDS_VERSION = 'wc2026-live-leaderboards-v2';

/** @type {object | null} */
let memoryCache = null;

function readJson(filename) {
  const bundledPath = join(DATA_DIR, filename);
  const rootPath = join(ROOT_DATA_DIR, filename);
  const absolutePath = existsSync(bundledPath) ? bundledPath : rootPath;
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing data file: ${filename}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

export function loadWorldCupLeaderboardSources() {
  if (memoryCache) return memoryCache;

  const teamStats = readJson('worldcup-live-team-stats.json');
  const playerStats = readJson('worldcup-live-player-stats.json');

  if (!teamStats?.teamTotals || !playerStats?.playerTotals) {
    throw new Error(
      'World Cup live stats not available. Run: npm run update-worldcup-live-stats',
    );
  }

  memoryCache = {
    teamStats,
    playerStats,
    summary: readJson('worldcup-live-summary.json'),
    gkRankings: readJson('worldcup-live-goalkeeper-rankings.json'),
    powerRankings: readJson('worldcup-live-power-rankings.json'),
  };

  return memoryCache;
}

export function getWorldCupLeaderboardsPayload(displayLimit = 10) {
  const sources = loadWorldCupLeaderboardSources();
  const leaderboards = buildLeaderboardsFromData(sources, { displayLimit });

  return {
    version: WC_LEADERBOARDS_VERSION,
    ok: true,
    ...leaderboards,
    meta: {
      completedMatchesProcessed: sources.summary?.completedMatchesProcessed ?? null,
      skippedUpcoming: sources.summary?.skippedUpcoming ?? null,
      skippedLive: sources.summary?.skippedLive ?? null,
      teamsWithTotals: sources.summary?.teamsWithTotals ?? null,
      playersWithTotals: sources.summary?.playersWithTotals ?? null,
    },
  };
}
