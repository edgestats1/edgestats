/**
 * Print sample World Cup leaderboard output from real JSON exports.
 * Run: node scripts/sample-worldcup-leaderboards.js
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

const { buildLeaderboardsFromData } = await import(
  pathToFileURL(join(root, 'lib/worldcup-leaderboards.js')).href
);

const sources = {
  teamStats: loadJson('data/worldcup-live/worldcup-live-team-stats.json'),
  playerStats: loadJson('data/worldcup-live/worldcup-live-player-stats.json'),
  summary: loadJson('data/worldcup-live/worldcup-live-summary.json'),
  gkRankings: loadJson('data/worldcup-live/worldcup-live-goalkeeper-rankings.json'),
};

const payload = buildLeaderboardsFromData(sources, { displayLimit: 5 });

console.log('=== World Cup Live Leaders Sample (top 5 each) ===\n');
console.log('exportedAt:', payload.exportedAt);
console.log('exportedAtFormatted:', payload.exportedAtFormatted);
console.log('dataNote:', payload.dataNote);
console.log('completedMatchesProcessed:', payload.completedMatchesProcessed);
console.log('source:', payload.source);
console.log('');

const sections = [
  ['Golden Boot', payload.goldenBoot],
  ['Goals By Country', payload.goalsByCountry],
  ['Corners By Country', payload.cornersByCountry],
  ['Goalkeeper Saves', payload.goalkeeperSaveLeaders],
  ['Shots By Country', payload.shotsByCountry],
  ['Discipline Table', payload.disciplineTable],
];

for (const [title, rows] of sections) {
  console.log(`--- ${title} ---`);
  console.log(JSON.stringify(rows, null, 2));
  console.log('');
}
