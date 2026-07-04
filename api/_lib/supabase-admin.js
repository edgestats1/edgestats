import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function upgradeProfileToPremium({
  userId,
  email,
  stripeCustomerId,
  stripeSessionId,
}) {
  const supabase = getSupabaseAdmin();
  const payload = {
    role: 'premium',
    premium_since: new Date().toISOString(),
    stripe_customer_id: stripeCustomerId || null,
    stripe_session_id: stripeSessionId || null,
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select('id, email, role')
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    if (email) {
      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: email.toLowerCase(),
          ...payload,
        })
        .select('id, email, role')
        .single();

      if (insertError) throw insertError;
      return inserted;
    }

    throw new Error('Profile not found for user id: ' + userId);
  }

  if (!email) {
    throw new Error('Unable to upgrade premium user without id or email.');
  }

  const normalizedEmail = email.toLowerCase();
  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('email', normalizedEmail)
    .select('id, email, role')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('No profile matched email: ' + normalizedEmail);
  }

  return data;
}

export async function getUserFromAccessToken(accessToken) {
  if (!accessToken) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

export async function getProfileForUser(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, premium_since, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function ensureProfileForUser(user) {
  const supabase = getSupabaseAdmin();
  const email = user.email ? user.email.toLowerCase() : null;

  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email, role, premium_since, stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email,
      role: 'free',
    }, { onConflict: 'id' })
    .select('id, email, role, premium_since, stripe_customer_id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return getProfileForUser(user.id);
    }
    throw insertError;
  }

  return created;
}
