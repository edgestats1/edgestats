/**
 * Manual World Cup 2026 live stats export → data/worldcup-live/
 * Usage: npm run update-worldcup-live-stats
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildWorldcupLiveExport } from '../data/worldcup-live/export-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'data/worldcup-live');

const OUTPUT_FILES = {
  matchResults: 'worldcup-live-match-results.json',
  teamStats: 'worldcup-live-team-stats.json',
  playerStats: 'worldcup-live-player-stats.json',
  refereeStats: 'worldcup-live-referee-stats.json',
  powerRankings: 'worldcup-live-power-rankings.json',
  teamStrength: 'worldcup-live-team-strength.json',
  goalkeeperRankings: 'worldcup-live-goalkeeper-rankings.json',
  cornerTrends: 'worldcup-live-corner-trends.json',
  cardTrends: 'worldcup-live-card-trends.json',
  round1Analysis: 'worldcup-live-round1-analysis.json',
  summary: 'worldcup-live-summary.json',
};

function loadApiKey() {
  const envPath = join(ROOT, '.env.local');
  const env = readFileSync(envPath, 'utf8');

  for (const line of env.split('\n')) {
    const match = line.match(/^API_FOOTBALL_KEY=(.+)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }

  throw new Error('API_FOOTBALL_KEY not found in .env.local');
}

function writeJson(filename, payload) {
  const path = join(OUT_DIR, filename);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return path;
}

async function main() {
  const apiKey = loadApiKey();
  const t0 = Date.now();

  console.info('[update-worldcup-live-stats] Fetching World Cup 2026 fixtures from API-Football…');

  const result = await buildWorldcupLiveExport(apiKey);

  mkdirSync(OUT_DIR, { recursive: true });

  const written = [
    writeJson(OUTPUT_FILES.matchResults, result.matchResults),
    writeJson(OUTPUT_FILES.teamStats, result.teamStats),
    writeJson(OUTPUT_FILES.playerStats, result.playerStats),
    writeJson(OUTPUT_FILES.refereeStats, result.refereeStats),
    writeJson(OUTPUT_FILES.powerRankings, result.powerRankings),
    writeJson(OUTPUT_FILES.teamStrength, result.teamStrength),
    writeJson(OUTPUT_FILES.goalkeeperRankings, result.goalkeeperRankings),
    writeJson(OUTPUT_FILES.cornerTrends, result.cornerTrends),
    writeJson(OUTPUT_FILES.cardTrends, result.cardTrends),
    writeJson(OUTPUT_FILES.round1Analysis, result.round1Analysis),
    writeJson(OUTPUT_FILES.summary, result.summary),
  ];

  const { summary } = result;
  const durationSeconds = Math.round((Date.now() - t0) / 10) / 100;

  console.info('[update-worldcup-live-stats] Done in', durationSeconds, 's');
  console.info('[update-worldcup-live-stats] Matches checked:', summary.matchesChecked);
  console.info('[update-worldcup-live-stats] Completed matches processed:', summary.completedMatchesProcessed);
  console.info('[update-worldcup-live-stats] Teams processed:', summary.teamsWithTotals);
  console.info('[update-worldcup-live-stats] Players processed:', summary.playersWithTotals);
  console.info('[update-worldcup-live-stats] Referees processed:', summary.refereeSummary?.totalRefereesTracked ?? 0);
  console.info('[update-worldcup-live-stats] Skipped upcoming:', summary.skippedUpcoming);
  console.info('[update-worldcup-live-stats] Skipped live:', summary.skippedLive);
  console.info('[update-worldcup-live-stats] Team match stat rows:', summary.teamMatchStatRows);
  console.info('[update-worldcup-live-stats] Player match stat rows:', summary.playerMatchStatRows);
  console.info('[update-worldcup-live-stats] Referee styles — low-card:', summary.refereeSummary?.lowCardRefs ?? 0, 'balanced:', summary.refereeSummary?.balancedRefs ?? 0, 'strict:', summary.refereeSummary?.strictRefs ?? 0);
  console.info('[update-worldcup-live-stats] Power rankings — nations ranked:', result.powerRankings?.teamsRanked ?? 0);
  if (summary.powerSummary?.topOverall?.length) {
    console.info('[update-worldcup-live-stats] Top overall:', summary.powerSummary.topOverall.map((row) => `${row.rank}. ${row.team} (${row.overallPowerScore})`).join(', '));
  }
  if (summary.missingFields?.fields?.length) {
    console.info('[update-worldcup-live-stats] Missing API fields:', summary.missingFields.fields.join(', '));
  } else {
    console.info('[update-worldcup-live-stats] Missing API fields: none flagged');
  }
  console.info('[update-worldcup-live-stats] Files written:', summary.filesWritten?.length ?? written.length);
  written.forEach((path) => console.info('  -', path));
}

main().catch((err) => {
  console.error('[update-worldcup-live-stats] FAILED:', err.message);
  process.exit(1);
});
