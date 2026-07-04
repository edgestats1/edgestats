/**
 * GET /api/predict?home=TeamA&away=TeamB
 * Premium users receive full prediction output; free users receive locked teaser.
 */

import { ensureProfileForUser, getUserFromAccessToken } from './_lib/supabase-admin.js';
import {
  formatPredictionForPremium,
  runMatchPrediction,
  stripPredictionForFreeUser,
} from './_lib/prediction-engine-server.js';

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const home = (req.query.home || '').trim();
  const away = (req.query.away || '').trim();

  if (!home || !away) {
    return res.status(400).json({
      ok: false,
      error: 'Query params "home" and "away" are required.',
    });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = token ? await getUserFromAccessToken(token) : null;
    let isPremium = false;

    if (user) {
      const profile = await ensureProfileForUser(user);
      isPremium = profile?.role === 'premium';
    }

    const result = await runMatchPrediction(home, away);

    res.setHeader('Cache-Control', 'private, no-store');

    if (!isPremium) {
      return res.status(200).json(stripPredictionForFreeUser(result));
    }

    return res.status(200).json(formatPredictionForPremium(result));
  } catch (err) {
    console.error('predict error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Prediction failed',
    });
  }
}
