/**
 * Export EdgeStats_Model_Metadata.json
 * Usage: npm run export-model-metadata
 */

import { writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildModelMetadata } from '../data/worldcup-live/model-metadata-export-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_PATH = join(ROOT, 'data/worldcup-live/EdgeStats_Model_Metadata.json');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const doc = buildModelMetadata();
  writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);
  const { size } = statSync(OUT_PATH);

  console.info('[export-model-metadata] Written:', OUT_PATH);
  console.info('[export-model-metadata] File size:', formatBytes(size), `(${size} bytes)`);
  console.info('[export-model-metadata] Model version:', doc.modelVersion.modelVersion);
  console.info('[export-model-metadata] Team snapshots:', doc.teamPowerSnapshots.length);
  console.info('[export-model-metadata] Match prediction model implemented:', doc.matchPredictionModel.implementedInProject);
  console.info('[export-model-metadata] Confidence model implemented:', doc.confidenceModel.implementedInProject);
}

main();
