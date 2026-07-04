/**
 * Serve prebuilt homepage rankings from data/homepage-rankings.json only.
 * JSON is imported at build time so Vercel bundles it with serverless functions.
 * No live API-Football calls at request time.
 */

import homepageRankingsData from '../../data/homepage-rankings.json';

export const HOMEPAGE_RANKINGS_STATIC_VERSION = 'wc2026-official-48-static-v1';

/** @type {object | null} */
let memoryCache = null;

export function loadHomepageRankingsStatic() {
  if (memoryCache) return memoryCache;

  if (!homepageRankingsData || !Array.isArray(homepageRankingsData.categories)) {
    throw new Error(
      'Homepage rankings dataset invalid. Run: npm run build:homepage-rankings',
    );
  }

  memoryCache = homepageRankingsData;
  return memoryCache;
}

export function getHomepageRankingsApiPayload() {
  const data = loadHomepageRankingsStatic();
  return {
    version: data.version || HOMEPAGE_RANKINGS_STATIC_VERSION,
    builtAt: data.builtAt || null,
    source: data.source || 'data/homepage-rankings.json',
    categories: data.categories || [],
    debug: data.debug || null,
  };
}

export function getHomepageRankingsDebugPayload() {
  const data = loadHomepageRankingsStatic();
  const debug = data.debug || {};

  return {
    ok: true,
    cacheReady: true,
    source: 'data/homepage-rankings.json',
    version: data.version || HOMEPAGE_RANKINGS_STATIC_VERSION,
    builtAt: data.builtAt || null,
    categories: data.categories || [],
    debug,
    ...debug,
  };
}
