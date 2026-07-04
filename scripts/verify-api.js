#!/usr/bin/env node
/**
 * Local verification script — tests API-Football key via the same proxy logic as Vercel.
 * Run: node scripts/verify-api.js
 * Requires: .env.local with API_FOOTBALL_KEY
 */

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env.local');
const API_BASE = 'https://v3.football.api-sports.io';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error('.env.local must be a file in the project root, not a folder.');
  }

  const vars = {};
  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  });
  return vars;
}

async function main() {
  console.log('EdgeStats API verification\n');

  let env;
  try {
    env = loadEnvFile(ENV_PATH);
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }

  const apiKey = env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.error('FAIL: API_FOOTBALL_KEY not found in .env.local');
    console.error('Expected format: API_FOOTBALL_KEY=your_key_here');
    process.exit(1);
  }

  console.log('OK  .env.local is a valid file');
  console.log('OK  API_FOOTBALL_KEY is set (' + apiKey.length + ' chars)');

  const url = API_BASE + '/fixtures?league=1&season=2026&next=10&timezone=UTC';
  console.log('\nRequesting next 10 World Cup 2026 fixtures...\n');

  const response = await fetch(url, {
    headers: { 'x-apisports-key': apiKey },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('FAIL: HTTP', response.status);
    console.error(data.message || data.error || JSON.stringify(data));
    process.exit(1);
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    console.error('FAIL: API errors:', data.errors);
    process.exit(1);
  }

  const fixtures = data.response || [];
  console.log('OK  API key accepted');
  console.log('OK  Received', fixtures.length, 'fixture(s)\n');

  if (fixtures.length === 0) {
    console.log('Note: No fixtures returned — season data may not be published yet.');
    process.exit(0);
  }

  fixtures.slice(0, 10).forEach(function (item, i) {
    const home = item.teams.home.name;
    const away = item.teams.away.name;
    const date = new Date(item.fixture.date).toLocaleString('en-US');
    const round = item.league.round || 'World Cup';
    console.log((i + 1) + '. ' + home + ' vs ' + away);
    console.log('   ' + round + ' · ' + date);
  });

  console.log('\nAll checks passed.');
}

main().catch(function (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
});
