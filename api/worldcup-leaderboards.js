/**
 * GET /api/worldcup-leaderboards — World Cup live leaderboards from static JSON exports.
 * GET /api/knockout-fixtures (rewrite) — Knockout fixture schedule.
 * GET /api/model-tracker (rewrite) — Model accuracy tracker.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { applyCacheHeaders, CACHE_TTL } from './_lib/cached-api-football.js';
import {
  getWorldCupLeaderboardsPayload,
  WC_LEADERBOARDS_VERSION,
} from './_lib/worldcup-leaderboards-static.js';

const ROOT = process.cwd();
const FIXTURES_PATH = join(ROOT, 'data/worldcup-live/worldcup-knockout-fixtures.json');
const SUMMARY_PATH = join(ROOT, 'data/worldcup-live/worldcup-live-summary.json');
const METADATA_PATH = join(ROOT, 'data/worldcup-live/EdgeStats_Model_Metadata.json');
const TRACKING_PATH = join(ROOT, 'data/worldcup-live/model-accuracy-tracking.json');

export const config = {
  maxDuration: 30,
};

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function handleKnockoutFixtures(res) {
  if (!existsSync(FIXTURES_PATH)) {
    return res.status(503).json({
      ok: false,
      error: 'Knockout fixtures export not found. Run: npm run update-knockout-fixtures',
    });
  }

  const data = readJson(FIXTURES_PATH);
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    ok: true,
    version: data.version,
    exportedAt: data.exportedAt,
    rounds: data.rounds || [],
    fixtureCount: data.fixtureCount ?? (data.fixtures?.length ?? 0),
    fixtures: data.fixtures || [],
  });
}

function handleModelTracker(res) {
  const summary = readJson(SUMMARY_PATH);
  const metadata = readJson(METADATA_PATH);
  const tracking = readJson(TRACKING_PATH);

  const modelVersion = metadata?.modelVersion?.modelVersion ?? 'wc2026-live-power-rankings-v2';
  const completedMatches = summary?.completedMatchesProcessed ?? null;

  const hasTrackingData = Boolean(
    tracking
    && (
      tracking.winnerAccuracy != null
      || tracking.scorelineWithinOneGoal != null
      || tracking.cornerAccuracy != null
      || tracking.goalkeeperSaveAccuracy != null
    ),
  );

  const payload = {
    ok: true,
    hasTrackingData,
    modelVersion,
    engineVersion: 'v2-calibration',
    displayVersion: 'V2',
    tournamentStage: metadata?.modelVersion?.tournamentStage ?? 'Knockout Stage',
    completedGroupMatches: completedMatches,
    message: hasTrackingData
      ? null
      : 'Model tracking begins from the knockout stage.',
  };

  if (hasTrackingData) {
    payload.metrics = {
      winnerAccuracy: tracking.winnerAccuracy,
      scorelineWithinOneGoal: tracking.scorelineWithinOneGoal,
      cornerAccuracy: tracking.cornerAccuracy,
      goalkeeperSaveAccuracy: tracking.goalkeeperSaveAccuracy,
      sampleSize: tracking.sampleSize ?? null,
      updatedAt: tracking.updatedAt ?? null,
    };
  }

  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  return res.status(200).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const scope = req.query.scope;

  try {
    if (scope === 'knockout-fixtures') {
      return handleKnockoutFixtures(res);
    }
    if (scope === 'model-tracker') {
      return handleModelTracker(res);
    }

    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const displayLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;
    const payload = getWorldCupLeaderboardsPayload(displayLimit);

    applyCacheHeaders(res, CACHE_TTL.HOMEPAGE_RANKINGS);
    res.setHeader('X-EdgeStats-Leaderboards-Version', WC_LEADERBOARDS_VERSION);
    res.setHeader('X-EdgeStats-Leaderboards-Source', 'data/worldcup-live');
    res.setHeader('X-EdgeStats-Cache', 'static');

    return res.status(200).json(payload);
  } catch (err) {
    console.error('worldcup-leaderboards error:', err);
    return res.status(503).json({
      ok: false,
      error: 'World Cup data not available.',
      message: err.message,
    });
  }
}
