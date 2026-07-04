/**
 * Shared GET proxy handler for API-Football routes.
 */

import {
  cachedApiFootballFetch,
  resolveCacheTtl,
  sendCachedProxyResponse,
} from './cached-api-football.js';

export function createApiFootballProxy({
  upstreamPath,
  buildParams,
  validate,
  ttlOverride,
}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'API_FOOTBALL_KEY is not configured. Add it in Vercel Environment Variables.',
      });
    }

    const validationError = validate ? validate(req.query) : null;
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const params = buildParams(req.query);

    try {
      const result = await cachedApiFootballFetch(upstreamPath, params, apiKey);
      const ttl = ttlOverride || resolveCacheTtl(upstreamPath, params);
      return sendCachedProxyResponse(res, result, ttl);
    } catch (err) {
      return res.status(502).json({
        error: 'Failed to reach API-Football',
        message: err.message,
      });
    }
  };
}
