/**
 * Local-only EdgeStats Prediction Dashboard server.
 * http://localhost:3333
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMasterModel, requireTeam } from '../prediction-engine/loadData.js';
import { predictMatch } from '../prediction-engine/matchPredictor.js';
import { findKnockoutFixture, getKnockoutMatchList } from '../prediction-engine/knockoutFixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const PORT = 3333;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res: ServerResponse, status: number, body: string, type = 'text/plain'): void {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(body);
}

function serveStatic(res: ServerResponse, filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath);
  const type = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(readFileSync(filePath));
  return true;
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf('?');
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const path = url.split('?')[0] ?? '/';

  try {
    if (path === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'edgestats-prediction-dashboard', port: PORT });
      return;
    }

    if (path === '/api/matches' && req.method === 'GET') {
      const model = loadMasterModel();
      sendJson(res, 200, getKnockoutMatchList(model));
      return;
    }

    if (path === '/api/predict' && req.method === 'GET') {
      const query = parseQuery(url);
      const homeInput = query.get('home')?.trim();
      const awayInput = query.get('away')?.trim();

      if (!homeInput || !awayInput) {
        sendJson(res, 400, { ok: false, error: 'Query params "home" and "away" are required.' });
        return;
      }

      const model = loadMasterModel();
      requireTeam(model, homeInput);
      requireTeam(model, awayInput);

      const fixture = findKnockoutFixture(model, homeInput, awayInput);

      const homeForPredict = fixture?.home.name ?? homeInput;
      const awayForPredict = fixture?.away.name ?? awayInput;

      const prediction = predictMatch(model, homeForPredict, awayForPredict, {
        pairingNote: fixture?.isSynthetic ? fixture.syntheticNote : null,
      });

      sendJson(res, 200, { ok: true, fixture, prediction });
      return;
    }

    if (path === '/' || path === '/index.html') {
      if (serveStatic(res, join(PUBLIC_DIR, 'index.html'))) return;
    }

    const assetPath = join(PUBLIC_DIR, path.replace(/^\//, ''));
    if (path.startsWith('/') && serveStatic(res, assetPath)) return;

    sendText(res, 404, 'Not found');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    sendJson(res, 500, { ok: false, error: message });
  }
}

const server = createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`EdgeStats Prediction Dashboard running at http://localhost:${PORT}`);
  console.log('Local only — not deployed to public website.');
});
