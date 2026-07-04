/**
 * Server-side API-Football cache + in-flight request de-duplication.
 * Shared across warm serverless instances; CDN headers extend cache globally.
 */

const API_BASE = 'https://v3.football.api-sports.io';

/** TTLs in seconds */
export const CACHE_TTL = {
  FIXTURE_LIST: 600,           // 10 minutes
  MATCH_CENTRE: 3600,          // 1 hour
  CLUB_PLAYER_SEASON: 21600,   // 6 hours
  LAST_FIVE: 1800,             // 30 minutes
  HOMEPAGE_RANKINGS: 21600,    // 6 hours
  SQUAD_POOL: 86400,           // 24 hours — World Cup squads / team list
};

const memoryCache = new Map();
const inFlight = new Map();

/** Bump to invalidate stale ranking payloads after pool logic changes */
export const HOMEPAGE_RANKINGS_CACHE_VERSION = 'wc2026-official-48-v2';

/** Minimum verified players before a rankings payload may be cached or served from cache */
export const HOMEPAGE_RANKINGS_MIN_VERIFIED_PLAYERS = 1000;

/** @type {{ version: string, data: object, freshUntil: number, staleUntil: number } | null} */
let homepageRankingsCache = null;
/** @type {Promise<object> | null} */
let homepageRankingsInFlight = null;

function normalizeParams(params) {
  const out = {};
  if (!params) return out;
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') out[key] = String(value);
  });
  return out;
}

export function buildCacheKey(path, params) {
  const normalized = normalizeParams(params);
  const query = Object.keys(normalized)
    .sort()
    .map((key) => `${key}=${normalized[key]}`)
    .join('&');
  return `${path}?${query}`;
}

export function resolveCacheTtl(path, params) {
  const p = normalizeParams(params);

  if (path === '/fixtures') {
    if (p.last && p.team && !p.league) return CACHE_TTL.LAST_FIVE;
    if (p.league || p.next || p.status) return CACHE_TTL.FIXTURE_LIST;
    return CACHE_TTL.MATCH_CENTRE;
  }

  if (path === '/players' && p.id && p.season) {
    return CACHE_TTL.CLUB_PLAYER_SEASON;
  }

  if (path === '/teams' && p.league && p.season) {
    return CACHE_TTL.SQUAD_POOL;
  }

  if (path === '/players/squads') return CACHE_TTL.SQUAD_POOL;
  if (path === '/fixtures/lineups') return CACHE_TTL.MATCH_CENTRE;
  if (path === '/fixtures/players') return CACHE_TTL.MATCH_CENTRE;
  if (path === '/fixtures/statistics') return CACHE_TTL.MATCH_CENTRE;
  if (path === '/teams/statistics') return CACHE_TTL.MATCH_CENTRE;

  if (path.startsWith('/players/')) return CACHE_TTL.HOMEPAGE_RANKINGS;

  return CACHE_TTL.MATCH_CENTRE;
}

function isRateLimited(status, message, errors) {
  if (status === 429) return true;
  const text = [
    message || '',
    errors ? JSON.stringify(errors) : '',
  ].join(' ').toLowerCase();
  return text.includes('rate limit')
    || text.includes('request limit')
    || text.includes('too many requests');
}

async function fetchUpstream(path, params, apiKey) {
  const url = new URL(path, API_BASE);
  const normalized = normalizeParams(params);
  Object.entries(normalized).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: { 'x-apisports-key': apiKey },
  });

  let raw;
  try {
    raw = await response.json();
  } catch (err) {
    return {
      ok: false,
      status: response.status,
      url: url.toString(),
      error: 'Invalid JSON from API-Football',
      message: err.message,
      results: 0,
      response: [],
      errors: null,
      raw: null,
    };
  }

  const results = raw.results != null
    ? raw.results
    : (Array.isArray(raw.response) ? raw.response.length : 0);

  return {
    ok: response.ok,
    status: response.status,
    url: url.toString(),
    error: response.ok ? null : (raw.message || 'API-Football request failed'),
    message: raw.message || null,
    results,
    response: raw.response || [],
    errors: raw.errors || null,
    raw,
  };
}

/**
 * Cached fetch with in-flight de-duplication and stale fallback on rate limits.
 */
export async function cachedApiFootballFetch(path, params, apiKey) {
  const cacheKey = buildCacheKey(path, params);
  const ttlSeconds = resolveCacheTtl(path, params);
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  if (cached && cached.freshUntil > now) {
    return {
      ...cached.data,
      _cache: { hit: true, fresh: true, key: cacheKey },
    };
  }

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const result = await fetchUpstream(path, params, apiKey);
      const rateLimited = isRateLimited(result.status, result.message, result.errors);

      if (result.ok && !rateLimited) {
        memoryCache.set(cacheKey, {
          data: result,
          freshUntil: now + ttlSeconds * 1000,
          staleUntil: now + ttlSeconds * 2 * 1000,
        });
        return { ...result, _cache: { hit: false, fresh: true, key: cacheKey } };
      }

      if ((rateLimited || !result.ok) && cached && cached.staleUntil > Date.now()) {
        return {
          ...cached.data,
          _cache: { hit: true, stale: true, rateLimited, key: cacheKey },
        };
      }

      return { ...result, _cache: { hit: false, fresh: false, key: cacheKey } };
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

export function applyCacheHeaders(res, ttlSeconds) {
  const stale = ttlSeconds * 2;
  const value = `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${stale}`;
  res.setHeader('Cache-Control', value);
  res.setHeader('CDN-Cache-Control', value);
  res.setHeader('Vercel-CDN-Cache-Control', value);
}

export function sendCachedProxyResponse(res, result, ttlSeconds) {
  if (!result.ok && !result._cache?.stale) {
    return res.status(result.status && result.status >= 400 ? result.status : 502).json({
      error: result.error || result.message || 'API-Football request failed',
      errors: result.errors || null,
      cache: result._cache || null,
    });
  }

  applyCacheHeaders(res, ttlSeconds);
  if (result._cache) {
    res.setHeader('X-EdgeStats-Cache', result._cache.stale ? 'stale' : (result._cache.hit ? 'hit' : 'miss'));
  }

  return res.status(200).json(result.raw || {
    response: result.response,
    results: result.results,
    errors: result.errors,
  });
}

export function getHomepageRankingsCache() {
  return homepageRankingsCache;
}

export function clearHomepageRankingsCache() {
  homepageRankingsCache = null;
}

/** Reject incomplete enrichment builds (e.g. rate-limited partial production runs). */
export function isHomepageRankingsPayloadCacheable(data) {
  const debug = data?.debug || {};
  const verified = debug.totalPlayersWithVerifiedClubStats || 0;
  return debug.totalTeamsProcessed === 48
    && verified >= HOMEPAGE_RANKINGS_MIN_VERIFIED_PLAYERS
    && debug.harryKane?.inRankedPool === true;
}

export function setHomepageRankingsCache(data) {
  const now = Date.now();
  homepageRankingsCache = {
    version: HOMEPAGE_RANKINGS_CACHE_VERSION,
    data,
    freshUntil: now + CACHE_TTL.HOMEPAGE_RANKINGS * 1000,
    staleUntil: now + CACHE_TTL.HOMEPAGE_RANKINGS * 2 * 1000,
  };
  return homepageRankingsCache;
}

export function getHomepageRankingsInFlight() {
  return homepageRankingsInFlight;
}

export function setHomepageRankingsInFlight(promise) {
  homepageRankingsInFlight = promise;
  return promise;
}

export function clearHomepageRankingsInFlight() {
  homepageRankingsInFlight = null;
}

function formatCachedDebugPayload(payload, meta) {
  const debug = payload.debug || {};
  const categories = payload.categories || [];
  return {
    ok: true,
    cacheReady: true,
    cacheOnly: true,
    source: meta.source,
    version: HOMEPAGE_RANKINGS_CACHE_VERSION,
    builtAt: debug.builtAt || null,
    categories,
    debug: {
      ...debug,
      cache: {
        ...(debug.cache || {}),
        rankings: {
          hit: true,
          fresh: !meta.stale,
          scope: 'debug-home-rankings',
          source: meta.source,
        },
      },
    },
    ...debug,
  };
}

/**
 * Fast debug summary — reads prebuilt homepage rankings cache only.
 * Never triggers a full 48-team rebuild.
 */
export async function getCachedHomepageRankingsDebugReport() {
  const now = Date.now();
  const mem = homepageRankingsCache;

  if (mem
    && mem.version === HOMEPAGE_RANKINGS_CACHE_VERSION
    && mem.staleUntil > now
    && isHomepageRankingsPayloadCacheable(mem.data)) {
    return {
      ready: true,
      payload: formatCachedDebugPayload(mem.data, {
        source: 'in-memory',
        stale: mem.freshUntil <= now,
      }),
    };
  }

  const baseUrl = process.env.SITE_URL || 'https://www.getedgestats.com';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/homepage-rankings`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.categories && data.debug && isHomepageRankingsPayloadCacheable(data)) {
        return {
          ready: true,
          payload: formatCachedDebugPayload(
            {
              categories: data.categories,
              debug: {
                ...data.debug,
                version: data.version,
                builtAt: data.builtAt,
              },
            },
            { source: 'homepage-rankings-cdn', stale: false },
          ),
        };
      }
    }
  } catch {
    /* CDN fallback unavailable — return not-ready below */
  }

  return {
    ready: false,
    cacheReady: false,
    ok: false,
    message: 'Homepage rankings cache is not ready. Warm the cache with GET /api/homepage-rankings (first build takes ~2–3 minutes), then retry this debug endpoint.',
    warmUrl: '/api/homepage-rankings',
    version: HOMEPAGE_RANKINGS_CACHE_VERSION,
    hint: mem
      ? 'in-memory cache present but incomplete or expired on this instance'
      : 'no in-memory cache on this serverless instance',
  };
}

export async function getOrBuildHomepageRankings(buildFn) {
  const now = Date.now();

  if (homepageRankingsCache
    && homepageRankingsCache.version === HOMEPAGE_RANKINGS_CACHE_VERSION
    && homepageRankingsCache.freshUntil > now
    && isHomepageRankingsPayloadCacheable(homepageRankingsCache.data)) {
    const rankingsCache = { hit: true, fresh: true, scope: 'homepage-rankings' };
    const data = { ...homepageRankingsCache.data };
    if (data.debug) {
      data.debug = {
        ...data.debug,
        cache: {
          ...(data.debug.cache || {}),
          rankings: rankingsCache,
        },
      };
    }
    return { ...data, _cache: rankingsCache };
  }

  if (homepageRankingsInFlight) {
    return homepageRankingsInFlight;
  }

  const promise = (async () => {
    try {
      const rankingsCache = { hit: false, fresh: true, scope: 'homepage-rankings' };
      const data = await buildFn({ rankingsCache });
      const cacheable = isHomepageRankingsPayloadCacheable(data);

      if (cacheable) {
        setHomepageRankingsCache(data);
      } else {
        clearHomepageRankingsCache();
      }

      if (data.debug) {
        data.debug.cache = {
          ...(data.debug.cache || {}),
          rankings: {
            ...rankingsCache,
            cacheable,
            skippedCache: !cacheable,
          },
        };
      }
      return { ...data, _cache: { ...rankingsCache, cacheable, skippedCache: !cacheable } };
    } catch (err) {
      if (homepageRankingsCache
        && homepageRankingsCache.version === HOMEPAGE_RANKINGS_CACHE_VERSION
        && homepageRankingsCache.staleUntil > Date.now()
        && isHomepageRankingsPayloadCacheable(homepageRankingsCache.data)) {
        const rankingsCache = { hit: true, stale: true, scope: 'homepage-rankings', error: err.message };
        const data = { ...homepageRankingsCache.data };
        if (data.debug) {
          data.debug = {
            ...data.debug,
            cache: {
              ...(data.debug.cache || {}),
              rankings: rankingsCache,
            },
          };
        }
        return { ...data, _cache: rankingsCache };
      }
      throw err;
    } finally {
      clearHomepageRankingsInFlight();
    }
  })();

  setHomepageRankingsInFlight(promise);
  return promise;
}
