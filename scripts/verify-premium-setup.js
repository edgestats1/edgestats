#!/usr/bin/env node
/**
 * Verifies Premium membership deployment readiness.
 * Usage: npm run verify:premium [-- --url https://www.getedgestats.com]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REQUIRED_FILES = [
  'supabase/schema.sql',
  'auth.js',
  'premium-access.js',
  'api/public-config.js',
  'api/create-checkout.js',
  'api/stripe-webhook.js',
  'api/profile.js',
  'api/_lib/supabase-admin.js',
  'api/_lib/stripe.js',
];

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const OPTIONAL_ENV = ['STRIPE_PRICE_ID', 'SITE_URL', 'API_FOOTBALL_KEY'];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function isPlaceholder(value) {
  if (!value) return true;
  return /your[-_]|placeholder|xxx|sk_test_or_live|whsec_your|optional_one_time/i.test(value);
}

function checkFiles() {
  const missing = REQUIRED_FILES.filter(function (file) {
    return !fs.existsSync(path.join(ROOT, file));
  });
  return { ok: missing.length === 0, missing };
}

function checkLocalEnv() {
  const env = Object.assign(
    {},
    parseEnvFile(path.join(ROOT, '.env.example')),
    parseEnvFile(path.join(ROOT, '.env.local')),
    process.env
  );

  const missing = [];
  const present = [];

  REQUIRED_ENV.forEach(function (key) {
    if (isPlaceholder(env[key])) missing.push(key);
    else present.push(key);
  });

  const optional = OPTIONAL_ENV.filter(function (key) {
    return !isPlaceholder(env[key]);
  });

  return { ok: missing.length === 0, missing, present, optional, env };
}

async function checkRemote(baseUrl) {
  const results = [];

  async function probe(pathname, options) {
    const url = baseUrl.replace(/\/$/, '') + pathname;
    try {
      const res = await fetch(url, options || {});
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_e) { /* ignore */ }
      return { url, status: res.status, json, text: text.slice(0, 200) };
    } catch (err) {
      return { url, error: err.message };
    }
  }

  results.push({ name: 'public-config', ...(await probe('/api/public-config')) });
  results.push({ name: 'stripe-webhook-post', ...(await probe('/api/stripe-webhook', { method: 'POST' })) });
  results.push({ name: 'homepage', ...(await probe('/')) });

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf('--url');
  const baseUrl = urlIndex >= 0 ? args[urlIndex + 1] : 'https://www.getedgestats.com';

  console.log('EdgeStats Premium Setup Verification\n');

  const files = checkFiles();
  console.log(files.ok ? 'OK  Required files present' : 'FAIL Missing files: ' + files.missing.join(', '));

  const localEnv = checkLocalEnv();
  console.log('\nLocal / process environment:');
  REQUIRED_ENV.forEach(function (key) {
    const ok = localEnv.present.includes(key);
    console.log((ok ? 'OK  ' : 'MISS') + ' ' + key);
  });
  OPTIONAL_ENV.forEach(function (key) {
    const ok = localEnv.optional.includes(key);
    console.log((ok ? 'OK  ' : 'OPT ') + ' ' + key);
  });

  console.log('\nRemote checks (' + baseUrl + '):');
  const remote = await checkRemote(baseUrl);
  remote.forEach(function (item) {
    if (item.error) {
      console.log('FAIL ' + item.name + ' — ' + item.error);
      return;
    }

    if (item.name === 'public-config') {
      const ok = item.status === 200 && item.json && item.json.supabaseUrl && item.json.supabaseAnonKey;
      console.log((ok ? 'OK  ' : 'FAIL') + ' public-config HTTP ' + item.status + (ok ? '' : ' — ' + item.text));
      return;
    }

    if (item.name === 'stripe-webhook-post') {
      const ok = item.status === 400 || item.status === 500;
      console.log((ok ? 'OK  ' : 'WARN') + ' stripe-webhook reachable HTTP ' + item.status + ' (400/500 expected without Stripe signature)');
      return;
    }

    console.log((item.status === 200 ? 'OK  ' : 'FAIL') + ' homepage HTTP ' + item.status);
  });

  const publicConfig = remote.find(function (r) { return r.name === 'public-config'; });
  const deployed = publicConfig && publicConfig.status === 200;
  const envReady = localEnv.ok;

  console.log('\nSummary:');
  console.log('- Code complete: ' + (files.ok ? 'yes' : 'no'));
  console.log('- Local env complete: ' + (envReady ? 'yes' : 'no'));
  console.log('- Production API deployed: ' + (deployed ? 'yes' : 'no'));

  if (!files.ok || !envReady || !deployed) {
    process.exitCode = 1;
  }
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
