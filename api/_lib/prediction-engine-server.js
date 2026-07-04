/**
 * Server-side prediction engine wrapper for Vercel API routes.
 * Uses compiled output from lib/prediction-engine/ (npm run build).
 */

import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const ENGINE_MATCH = join(ROOT, 'lib/prediction-engine/matchPredictor.js');

export async function runMatchPrediction(homeTeam, awayTeam) {
  if (!existsSync(ENGINE_MATCH)) {
    throw new Error('Prediction engine not built. Run: npm run build');
  }

  const { loadMasterModel } = await import('../../lib/prediction-engine/loadData.js');
  const { predictMatch } = await import('../../lib/prediction-engine/matchPredictor.js');
  const model = loadMasterModel();
  return predictMatch(model, homeTeam, awayTeam);
}

export function stripPredictionForFreeUser(result) {
  return {
    ok: true,
    locked: true,
    match: result.match,
    homeTeam: result.homeTeam,
    awayTeam: result.awayTeam,
    sport: result.sport,
    modelVersion: result.modelVersion,
    exportedAt: result.exportedAt,
    teaser: {
      message: 'Unlock the EdgeStats Prediction Generator',
      cta: 'Unlock Predictions',
    },
  };
}

export function formatPredictionForPremium(result) {
  return {
    ok: true,
    locked: false,
    prediction: result,
  };
}
