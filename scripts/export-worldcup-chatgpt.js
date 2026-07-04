/**
 * Combine all World Cup live JSON exports into one file for ChatGPT analysis.
 * Usage: npm run export-worldcup-chatgpt
 *
 * Reads existing files only — does not fetch API data or modify source exports.
 */

import { readFileSync, writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'data/worldcup-live');
const OUTPUT_FILE = 'worldcup-live-combined-analysis.json';

const SOURCE_FILES = [
  { key: 'teamStats', filename: 'worldcup-live-team-stats.json' },
  { key: 'playerStats', filename: 'worldcup-live-player-stats.json' },
  { key: 'matchResults', filename: 'worldcup-live-match-results.json' },
  { key: 'refereeStats', filename: 'worldcup-live-referee-stats.json' },
  { key: 'summary', filename: 'worldcup-live-summary.json' },
  { key: 'powerRankings', filename: 'worldcup-live-power-rankings.json' },
  { key: 'teamStrength', filename: 'worldcup-live-team-strength.json' },
  { key: 'goalkeeperRankings', filename: 'worldcup-live-goalkeeper-rankings.json' },
  { key: 'cornerTrends', filename: 'worldcup-live-corner-trends.json' },
  { key: 'cardTrends', filename: 'worldcup-live-card-trends.json' },
  { key: 'round1Analysis', filename: 'worldcup-live-round1-analysis.json' },
];

function readJson(filename) {
  const path = join(OUT_DIR, filename);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const loaded = {};
  const filesIncluded = [];

  for (const { key, filename } of SOURCE_FILES) {
    loaded[key] = readJson(filename);
    filesIncluded.push(filename);
  }

  const summary = loaded.summary;
  const round1MatchesProcessed = summary?.completedMatchesProcessed ?? null;

  const combined = {
    exportedAt: new Date().toISOString(),
    purpose: 'Combined World Cup 2026 Round 1 live data export for ChatGPT analysis',
    dataIntegrity: {
      completedMatchesOnly: true,
      round1MatchesProcessed,
      futureFixturesExcluded: true,
      simulatedDataIncluded: false,
      missingFieldsUseNull: true,
    },
    filesIncluded,
    teamStats: loaded.teamStats,
    playerStats: loaded.playerStats,
    matchResults: loaded.matchResults,
    refereeStats: loaded.refereeStats,
    summary: loaded.summary,
    powerRankings: loaded.powerRankings,
    teamStrength: loaded.teamStrength,
    goalkeeperRankings: loaded.goalkeeperRankings,
    cornerTrends: loaded.cornerTrends,
    cardTrends: loaded.cardTrends,
    round1Analysis: loaded.round1Analysis,
  };

  const outPath = join(OUT_DIR, OUTPUT_FILE);
  writeFileSync(outPath, `${JSON.stringify(combined, null, 2)}\n`);

  const { size } = statSync(outPath);
  const topLevelKeys = Object.keys(combined);
  const sections = SOURCE_FILES.map(({ key }) => key);

  console.info('[export-worldcup-chatgpt] Combined export written:', outPath);
  console.info('[export-worldcup-chatgpt] File size:', formatBytes(size), `(${size} bytes)`);
  console.info('[export-worldcup-chatgpt] Top-level keys:', topLevelKeys.join(', '));
  console.info('[export-worldcup-chatgpt] Sections included:', sections.join(', '));
  console.info('[export-worldcup-chatgpt] Source files merged:', filesIncluded.length, 'of', SOURCE_FILES.length);
  filesIncluded.forEach((name) => console.info('  -', name));
  console.info('[export-worldcup-chatgpt] Round 1 matches processed:', round1MatchesProcessed);
  console.info('[export-worldcup-chatgpt] Skipped upcoming (future fixtures):', summary?.skippedUpcoming ?? 'unknown');
  console.info('[export-worldcup-chatgpt] Skipped live:', summary?.skippedLive ?? 'unknown');
  console.info('[export-worldcup-chatgpt] Data integrity: completed matches only, no simulated data, null for missing fields');
}

main();
