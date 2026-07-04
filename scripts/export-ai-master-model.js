/**
 * Export EdgeStats_AI_Master_Model.json
 * Usage: npm run export-ai-master-model
 */

import { writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildAiMasterModel } from '../data/worldcup-live/ai-master-model-export-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_PATH = join(ROOT, 'data/worldcup-live/EdgeStats_AI_Master_Model.json');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const doc = buildAiMasterModel();
  writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);
  const { size } = statSync(OUT_PATH);

  console.info('[export-ai-master-model] Written:', OUT_PATH);
  console.info('[export-ai-master-model] File size:', formatBytes(size), `(${size} bytes)`);
  console.info('[export-ai-master-model] Top-level keys:', Object.keys(doc).join(', '));
  console.info('[export-ai-master-model] Teams:', doc.teams.length);
  console.info('[export-ai-master-model] Players:', doc.players.length);
  console.info('[export-ai-master-model] Matches:', doc.matches.length);
  console.info('[export-ai-master-model] Source files merged:', doc.metadata.sourceFilesMerged.length);
  console.info('[export-ai-master-model] Verbatim source exports:', Object.keys(doc.verbatimSourceExports).length);
}

main();
