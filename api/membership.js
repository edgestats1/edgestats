import { getStripe, getSiteOrigin, readRawBody } from './_lib/stripe.js';
import {
  ensureProfileForUser,
  getUserFromAccessToken,
  upgradeProfileToPremium,
} from './_lib/supabase-admin.js';
import { formatSupabaseSetupError, runSupabaseDiagnostics } from './_lib/supabase-debug.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getWebhookRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return readRawBody(req);
}

async function handlePublicConfig(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({
      error: 'Supabase public config is not configured.',
    });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey,
  });
}

async function handleProfile(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await getUserFromAccessToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let profile;
  try {
    profile = await ensureProfileForUser(user);
  } catch (err) {
    console.error('profile route error:', err);
    return res.status(500).json({
      error: formatSupabaseSetupError(err),
      message: err.message,
      code: err.code || null,
    });
  }

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profile || {
      id: user.id,
      email: user.email,
      role: 'free',
    },
    isPremium: profile?.role === 'premium',
  });
}

function formatConfigError(label) {
  return label + ' is not configured on the server.';
}

async function handleDebugSupabase(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const report = await runSupabaseDiagnostics();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(report.ok ? 200 : 500).json(report);
}

async function handleCreateCheckout(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: formatConfigError('STRIPE_SECRET_KEY') });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase server credentials are not configured.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await getUserFromAccessToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Sign in required before checkout.' });
  }

  let profile;
  try {
    profile = await ensureProfileForUser(user);
  } catch (err) {
    console.error('create-checkout profile error:', err);
    return res.status(500).json({
      error: formatSupabaseSetupError(err),
      message: err.message,
      code: err.code || null,
    });
  }

  if (profile?.role === 'premium') {
    return res.status(400).json({ error: 'Your account already has Premium access.' });
  }

  const stripe = getStripe();
  const origin = getSiteOrigin(req);
  const priceId = process.env.STRIPE_PRICE_ID || 'price_1TfvAzLRnwjSa0NPfpTDnQ61';

  const sessionParams = {
    mode: 'payment',
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancelled`,
    client_reference_id: user.id,
    customer_email: user.email || undefined,
    metadata: {
      supabase_user_id: user.id,
      supabase_email: (user.email || '').toLowerCase(),
    },
    line_items: [{ price: priceId, quantity: 1 }],
  };

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('create-checkout stripe error:', err);
    const stripeMessage = err && err.message ? err.message : 'Stripe checkout failed.';
    if (priceId && /price|resource/i.test(stripeMessage)) {
      return res.status(500).json({
        error: 'Invalid STRIPE_PRICE_ID. Remove it from Vercel or set a valid one-time Price ID in Stripe.',
        message: stripeMessage,
      });
    }
    return res.status(500).json({
      error: 'Unable to start Stripe checkout.',
      message: stripeMessage,
    });
  }
}

async function handleStripeWebhook(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' });
  }

  const stripe = getStripe();
  const rawBody = await getWebhookRawBody(req);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('stripe-webhook signature error:', err.message);
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentStatus = session.payment_status || session.status;

    if (paymentStatus !== 'paid' && paymentStatus !== 'complete' && paymentStatus !== 'no_payment_required') {
      return res.status(200).json({ received: true, skipped: true });
    }

    const userId = session.client_reference_id
      || session.metadata?.supabase_user_id
      || null;
    const email = session.customer_details?.email
      || session.customer_email
      || session.metadata?.supabase_email
      || null;

    await upgradeProfileToPremium({
      userId,
      email,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
      stripeSessionId: session.id,
    });
  }

  return res.status(200).json({ received: true });
}

export default async function handler(req, res) {
  const route = req.query.route;

  try {
    switch (route) {
      case 'public-config':
        return await handlePublicConfig(req, res);
      case 'profile':
        return await handleProfile(req, res);
      case 'create-checkout':
        return await handleCreateCheckout(req, res);
      case 'stripe-webhook':
        return await handleStripeWebhook(req, res);
      case 'debug-supabase':
        return await handleDebugSupabase(req, res);
      default:
        return res.status(404).json({ error: 'Unknown membership route.' });
    }
  } catch (err) {
    console.error('membership route error:', route, err);
    return res.status(500).json({
      error: 'Membership handler failed.',
      message: err.message,
    });
  }
}
