#!/usr/bin/env node
/**
 * Local dev server for EdgeStats (static site + Vercel-style API routes).
 * Mirrors vercel.json rewrites so `npm run dev` works without Vercel login.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/** @type {Record<string, { file: string, query?: Record<string, string> }>} */
const API_ROUTES = {
  '/api/stripe-webhook': { file: 'membership.js', query: { route: 'stripe-webhook' } },
  '/api/public-config': { file: 'membership.js', query: { route: 'public-config' } },
  '/api/create-checkout': { file: 'membership.js', query: { route: 'create-checkout' } },
  '/api/profile': { file: 'membership.js', query: { route: 'profile' } },
  '/api/debug-supabase': { file: 'membership.js', query: { route: 'debug-supabase' } },
  '/api/homepage-rankings': { file: 'top-players.js', query: { scope: 'homepage-rankings' } },
  '/api/debug-home-rankings': { file: 'debug-player-stats.js', query: { scope: 'home-rankings' } },
  '/api/debug-homepage-rankings': { file: 'debug-player-stats.js', query: { scope: 'home-rankings' } },
  '/api/top-scorers': { file: 'top-players.js', query: { type: 'topscorers' } },
  '/api/knockout-fixtures': { file: 'worldcup-leaderboards.js', query: { scope: 'knockout-fixtures' } },
  '/api/model-tracker': { file: 'worldcup-leaderboards.js', query: { scope: 'model-tracker' } },
  '/api/player-fixtures': { file: 'fixtures.js' },
};

const STATIC_REWRITES = {
  '/privacy-policy': '/privacy-policy.html',
  '/terms-of-service': '/terms-of-service.html',
};

const STATIC_ROOT_FILES = new Set([
  'favicon.ico',
  'favicon.svg',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'site.webmanifest',
]);

/** @type {Map<string, (req: any, res: any) => Promise<void>>} */
const handlerCache = new Map();

function createVercelResponse(serverRes) {
  let statusCode = 200;
  const headers = {};

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(key, value) {
      headers[key] = value;
      return res;
    },
    json(body) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
      }
      const payload = JSON.stringify(body);
      serverRes.writeHead(statusCode, headers);
      serverRes.end(payload);
    },
    send(body) {
      serverRes.writeHead(statusCode, headers);
      serverRes.end(body);
    },
    end(body) {
      serverRes.writeHead(statusCode, headers);
      serverRes.end(body);
    },
  };

  return res;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function loadHandler(fileName) {
  if (handlerCache.has(fileName)) {
    return handlerCache.get(fileName);
  }

  const modulePath = pathToFileURL(join(ROOT, 'api', fileName)).href;
  const mod = await import(modulePath);
  const handler = mod.default;
  if (typeof handler !== 'function') {
    throw new Error(`API module ${fileName} has no default export handler`);
  }
  handlerCache.set(fileName, handler);
  return handler;
}

function resolveApiRoute(pathname) {
  if (API_ROUTES[pathname]) {
    return API_ROUTES[pathname];
  }

  if (pathname.startsWith('/api/')) {
    const fileName = pathname.slice('/api/'.length) + '.js';
    if (existsSync(join(ROOT, 'api', fileName))) {
      return { file: fileName };
    }
  }

  return null;
}

function serveStatic(serverRes, relativePath) {
  const filePath = join(ROOT, relativePath.replace(/^\//, ''));
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }

  const ext = extname(filePath);
  serverRes.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600',
  });
  serverRes.end(readFileSync(filePath));
  return true;
}

function shouldFallbackToIndex(pathname) {
  if (pathname.startsWith('/api/')) return false;
  const base = pathname.replace(/^\//, '');
  if (STATIC_ROOT_FILES.has(base)) return false;
  if (base.endsWith('.html')) return false;
  if (existsSync(join(ROOT, base)) && statSync(join(ROOT, base)).isFile()) return false;
  return true;
}

async function handleRequest(nodeReq, nodeRes) {
  const host = nodeReq.headers.host || `localhost:${PORT}`;
  const url = new URL(nodeReq.url || '/', `http://${host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (STATIC_REWRITES[pathname]) {
    if (serveStatic(nodeRes, STATIC_REWRITES[pathname])) return;
  }

  const apiRoute = resolveApiRoute(pathname);
  if (apiRoute) {
    try {
      const handler = await loadHandler(apiRoute.file);
      const query = Object.fromEntries(url.searchParams.entries());
      if (apiRoute.query) {
        Object.assign(query, apiRoute.query);
      }

      const body = await readRequestBody(nodeReq);
      const req = {
        method: nodeReq.method || 'GET',
        headers: nodeReq.headers,
        query,
        body: body.length ? body : undefined,
      };
      const res = createVercelResponse(nodeRes);
      await handler(req, res);
      return;
    } catch (err) {
      console.error('[dev-server] API error:', pathname, err);
      nodeRes.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      nodeRes.end(JSON.stringify({ error: 'Dev server failed to run API handler.', message: err.message }));
      return;
    }
  }

  if (pathname === '/' || pathname === '/index.html') {
    if (serveStatic(nodeRes, '/index.html')) return;
  }

  if (serveStatic(nodeRes, pathname)) return;

  if (shouldFallbackToIndex(pathname)) {
    if (serveStatic(nodeRes, '/index.html')) return;
  }

  nodeRes.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  nodeRes.end('Not found');
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[dev-server] Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
    }
  });
});

server.listen(PORT, () => {
  console.log(`EdgeStats dev server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
