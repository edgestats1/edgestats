#!/usr/bin/env node
/**
 * Refresh live stats + official knockout fixtures for the prediction dashboard.
 * Usage: npm run refresh-prediction-dashboard
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function run(label, script) {
  console.info(`\n[refresh-prediction-dashboard] → ${label}`);
  const result = spawnSync('npm', ['run', script], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`[refresh-prediction-dashboard] Failed during: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.info('[refresh-prediction-dashboard] Starting dashboard data refresh…');
run('update-worldcup-live-stats', 'update-worldcup-live-stats');
run('update-knockout-fixtures', 'update-knockout-fixtures');
console.info('\n[refresh-prediction-dashboard] Done. Run: npm run prediction-dashboard');
