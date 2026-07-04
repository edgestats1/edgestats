/**
 * Vercel serverless proxy for API-Football v3 player ranking endpoints.
 * GET /api/top-players?type=topscorers|...
 * GET /api/homepage-rankings (rewrite) — static data/homepage-rankings.json
 */

import {
  CACHE_TTL,
  applyCacheHeaders,
  cachedApiFootballFetch,
  resolveCacheTtl,
  sendCachedProxyResponse,
} from './_lib/cached-api-football.js';
import {
  getHomepageRankingsApiPayload,
  HOMEPAGE_RANKINGS_STATIC_VERSION,
} from './_lib/homepage-rankings-static.js';

export const config = {
  maxDuration: 300,
};

const ALLOWED_TYPES = {
  topscorers: 'topscorers',
  topassists: 'topassists',
  topyellowcards: 'topyellowcards',
  topredcards: 'topredcards',
};

function applyStaticRankingsHeaders(res) {
  applyCacheHeaders(res, CACHE_TTL.HOMEPAGE_RANKINGS);
  res.setHeader('X-EdgeStats-Rankings-Version', HOMEPAGE_RANKINGS_STATIC_VERSION);
  res.setHeader('X-EdgeStats-Rankings-Source', 'data/homepage-rankings.json');
  res.setHeader('X-EdgeStats-Cache', 'static');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.query.scope === 'homepage-rankings') {
    try {
      const payload = getHomepageRankingsApiPayload();
      applyStaticRankingsHeaders(res);
      return res.status(200).json(payload);
    } catch (err) {
      console.error('homepage-rankings static error:', err);
      return res.status(503).json({
        ok: false,
        error: 'Homepage rankings dataset not available.',
        message: err.message,
      });
    }
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API_FOOTBALL_KEY is not configured. Add it in Vercel Environment Variables.',
    });
  }

  const type = ALLOWED_TYPES[req.query.type];
  if (!type) {
    return res.status(400).json({
      error: 'Missing or invalid query param: type (topscorers, topassists, topyellowcards, topredcards)',
    });
  }

  const params = {
    league: String(req.query.league || '1'),
    season: String(req.query.season || '2026'),
  };

  const upstreamPath = `/players/${type}`;

  try {
    const result = await cachedApiFootballFetch(upstreamPath, params, apiKey);
    const ttl = resolveCacheTtl(upstreamPath, params);
    return sendCachedProxyResponse(res, result, ttl);
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to reach API-Football',
      message: err.message,
    });
  }
}
