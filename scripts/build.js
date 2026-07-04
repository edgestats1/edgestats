#!/usr/bin/env node
/**
 * Build shared prediction engine + verify public site assets.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENGINE_ENTRY = join(ROOT, 'lib/prediction-engine/index.js');
const MASTER_MODEL = join(ROOT, 'data/worldcup-live/EdgeStats_AI_Master_Model.json');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.info('[build] Compiling prediction engine → lib/prediction-engine/');
run('npx', ['tsc', '-p', 'tsconfig.build.json', '--noCheck']);

if (!existsSync(ENGINE_ENTRY)) {
  console.error('[build] Missing compiled entry:', ENGINE_ENTRY);
  process.exit(1);
}

if (!existsSync(MASTER_MODEL)) {
  console.warn('[build] Warning: master model JSON not found. Run: npm run export-ai-master-model');
} else {
  console.info('[build] Master model present:', MASTER_MODEL);
}

console.info('[build] Done.');
