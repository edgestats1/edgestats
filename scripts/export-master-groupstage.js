/**
 * Build EdgeStats_Master_GroupStage_Complete.json from stored World Cup live exports.
 * Usage: npm run export-master-groupstage
 */

import { writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildMasterGroupStageExport } from '../data/worldcup-live/master-groupstage-export-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_PATH = join(ROOT, 'data/worldcup-live/EdgeStats_Master_GroupStage_Complete.json');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const doc = buildMasterGroupStageExport();
  writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);

  const { size } = statSync(OUT_PATH);
  const info = doc.tournamentInfo;
  const integrity = doc.dataIntegrity;

  console.info('[export-master-groupstage] Written:', OUT_PATH);
  console.info('[export-master-groupstage] File size:', formatBytes(size), `(${size} bytes)`);
  console.info('[export-master-groupstage] Top-level keys:', Object.keys(doc).join(', '));
  console.info('[export-master-groupstage] Tournament:', info.tournamentName);
  console.info('[export-master-groupstage] Stage:', info.currentStage);
  console.info('[export-master-groupstage] Matches:', info.totalMatchesPlayed);
  console.info('[export-master-groupstage] Teams:', doc.teamDatabase.length);
  console.info('[export-master-groupstage] Players:', doc.playerDatabase.length);
  console.info('[export-master-groupstage] Referees:', doc.refereeDatabase.length);
  console.info('[export-master-groupstage] Group stage matches processed:', integrity.groupStageMatchesProcessed);
  console.info('[export-master-groupstage] Skipped upcoming:', integrity.skippedUpcoming);
  console.info('[export-master-groupstage] Simulated data included:', integrity.simulatedDataIncluded);
  console.info('[export-master-groupstage] Future fixtures excluded:', integrity.futureFixturesExcluded);
}

main();
