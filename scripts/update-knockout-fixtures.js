/**
 * Fetch official World Cup 2026 knockout fixtures from API-Football.
 * Usage: npm run update-knockout-fixtures
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  buildKnockoutFixturesExport,
  KNOCKOUT_FIXTURES_PATH,
} from '../data/worldcup-live/knockout-fixtures-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_FILE = join(ROOT, KNOCKOUT_FIXTURES_PATH);

function loadApiKey() {
  const envPath = join(ROOT, '.env.local');
  const env = readFileSync(envPath, 'utf8');

  for (const line of env.split('\n')) {
    const match = line.match(/^API_FOOTBALL_KEY=(.+)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }

  throw new Error('API_FOOTBALL_KEY not found in .env.local');
}

async function main() {
  const apiKey = loadApiKey();
  console.info('[update-knockout-fixtures] Fetching official knockout fixtures from API-Football…');

  try {
    const payload = await buildKnockoutFixturesExport(apiKey);
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    console.info(`[update-knockout-fixtures] Wrote ${payload.fixtureCount} fixtures → ${KNOCKOUT_FIXTURES_PATH}`);
    console.info('[update-knockout-fixtures] Rounds:', payload.rounds.join(', '));
    console.info('[update-knockout-fixtures] Sample:', `${payload.fixtures[0].homeTeam} vs ${payload.fixtures[0].awayTeam} (${payload.fixtures[0].kickoffUTC})`);
  } catch (err) {
    if (err?.code === 'NO_KNOCKOUT_FIXTURES') {
      console.error('[update-knockout-fixtures] No official knockout fixtures found from API-Football.');
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error('[update-knockout-fixtures] Failed:', err.message);
  process.exit(1);
});
