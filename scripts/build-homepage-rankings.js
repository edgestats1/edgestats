/**
 * One-time build: official 48-team homepage rankings → data/homepage-rankings.json
 * Usage: npm run build:homepage-rankings
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildHomepageRankingsDebug } from '../api/_lib/homepage-rankings-debug.js';
import {
  getOfficialTeamNames,
  OFFICIAL_WC2026_TEAM_COUNT,
} from '../api/_lib/wc2026-official-teams.js';
import { HOMEPAGE_RANKINGS_STATIC_VERSION } from '../api/_lib/homepage-rankings-static.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_PATH = join(ROOT, 'data/homepage-rankings.json');

function loadApiKey() {
  const envPath = join(ROOT, '.env.local');
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const match = line.match(/^API_FOOTBALL_KEY=(.+)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('API_FOOTBALL_KEY not found in .env.local');
}

function assertOfficialTeamsOnly(debug) {
  const official = new Set(getOfficialTeamNames().map((n) => n.toLowerCase()));
  const violations = [];

  (debug.top20Goalscorers || []).forEach((player) => {
    if (player.country && !official.has(player.country.toLowerCase())) {
      violations.push({ category: 'top-goalscorers', player });
    }
  });

  if (violations.length) {
    throw new Error(`Non-official nations in rankings: ${JSON.stringify(violations.slice(0, 3))}`);
  }
}

async function main() {
  const apiKey = loadApiKey();
  const builtAt = new Date().toISOString();

  console.info('[build-homepage-rankings] Building official 48-team dataset…');
  const t0 = Date.now();

  const result = await buildHomepageRankingsDebug(apiKey, {
    rankingsCache: { hit: false, fresh: true, scope: 'build-script' },
  });

  const debug = {
    ...result.debug,
    teamsUsed: result.debug.totalTeamsProcessed,
    teamsExcluded: result.debug.teamsExcluded || [],
    totalPlayersWithVerifiedStats: result.debug.totalPlayersWithVerifiedClubStats,
    rankingSource: 'data/homepage-rankings.json',
    mockDataUsed: false,
    buildDurationSeconds: Math.round((Date.now() - t0) / 10) / 100,
  };

  if (debug.teamsUsed !== OFFICIAL_WC2026_TEAM_COUNT) {
    throw new Error(`Expected ${OFFICIAL_WC2026_TEAM_COUNT} teams, got ${debug.teamsUsed}`);
  }

  assertOfficialTeamsOnly(debug);

  const payload = {
    version: HOMEPAGE_RANKINGS_STATIC_VERSION,
    builtAt,
    source: 'official-48-team-build',
    categories: result.categories,
    debug,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  console.info('[build-homepage-rankings] Saved', OUT_PATH);
  console.info('[build-homepage-rankings] teamsUsed:', debug.teamsUsed);
  console.info('[build-homepage-rankings] verified:', debug.totalPlayersWithVerifiedStats);
  console.info('[build-homepage-rankings] harryKane:', debug.harryKane);
  console.info('[build-homepage-rankings] top goalscorer:', debug.top20Goalscorers?.[0]?.name);
}

main().catch((err) => {
  console.error('[build-homepage-rankings] FAILED:', err.message);
  process.exit(1);
});
