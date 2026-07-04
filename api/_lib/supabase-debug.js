import { getSupabaseAdmin } from './supabase-admin.js';

const EXPECTED_COLUMNS = [
  'id',
  'email',
  'role',
  'stripe_customer_id',
  'stripe_session_id',
  'premium_since',
  'created_at',
  'updated_at',
];

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch (_err) {
    return null;
  }
}

function getProjectRef(url) {
  if (!url) return null;
  const match = String(url).match(/https:\/\/([^.]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

function classifySupabaseError(error) {
  if (!error) return null;

  const code = error.code || null;
  const message = error.message || String(error);

  if (code === 'PGRST205' || /could not find the table|schema cache/i.test(message)) {
    return {
      type: 'TABLE_MISSING',
      recommendedFix: 'Run supabase/schema.sql in the Supabase SQL Editor for the project shown in supabaseProjectRef.',
    };
  }

  if (code === '42501' && /permission denied for table/i.test(message)) {
    return {
      type: 'TABLE_GRANTS_MISSING',
      recommendedFix: 'Grant service_role access to public.profiles. Run the GRANT SQL at the bottom of supabase/schema.sql in Supabase SQL Editor.',
    };
  }

  if (code === '42501' || /row-level security/i.test(message)) {
    return {
      type: 'RLS_DENIED',
      recommendedFix: 'Set SUPABASE_SERVICE_ROLE_KEY in Vercel to the service_role secret (not the anon key) for the same project as SUPABASE_URL.',
    };
  }

  if (code === '23503') {
    return {
      type: 'FOREIGN_KEY',
      recommendedFix: 'The profiles row must reference an existing auth.users id. Sign up through Supabase Auth first, then retry checkout.',
    };
  }

  return {
    type: 'UNKNOWN',
    recommendedFix: 'Check the Supabase error code and message below, then fix the matching Vercel env var or run supabase/schema.sql.',
  };
}

export async function runSupabaseDiagnostics() {
  const supabaseUrl = process.env.SUPABASE_URL || null;
  const supabaseProjectRef = getProjectRef(supabaseUrl);

  const result = {
    ok: false,
    supabaseUrl,
    supabaseProjectRef,
    expectedTable: 'public.profiles',
    env: {
      supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
      supabaseAnonKeyConfigured: Boolean(process.env.SUPABASE_ANON_KEY),
      supabaseServiceRoleKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      anonJwtRole: null,
      anonProjectRef: null,
      serviceRoleJwtRole: null,
      serviceRoleProjectRef: null,
      projectRefsMatch: null,
    },
    table: {
      exists: null,
      readable: false,
      writable: false,
      sampleRowCount: null,
    },
    columns: {
      expected: EXPECTED_COLUMNS,
      present: [],
      missing: [],
    },
    supabaseErrors: [],
    recommendedFix: null,
    sqlToRun: null,
  };

  const anonPayload = decodeJwtPayload(process.env.SUPABASE_ANON_KEY);
  if (anonPayload) {
    result.env.anonJwtRole = anonPayload.role || null;
    result.env.anonProjectRef = anonPayload.ref || null;
  }

  const servicePayload = decodeJwtPayload(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (servicePayload) {
    result.env.serviceRoleJwtRole = servicePayload.role || null;
    result.env.serviceRoleProjectRef = servicePayload.ref || null;
  }

  const refs = [supabaseProjectRef, result.env.anonProjectRef, result.env.serviceRoleProjectRef].filter(Boolean);
  result.env.projectRefsMatch = refs.length <= 1 || refs.every(function (ref) { return ref === refs[0]; });

  if (!result.env.projectRefsMatch) {
    result.supabaseErrors.push({
      code: 'ENV_PROJECT_MISMATCH',
      message: 'SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY must all belong to the same Supabase project.',
      details: {
        supabaseUrlProjectRef: supabaseProjectRef,
        anonProjectRef: result.env.anonProjectRef,
        serviceRoleProjectRef: result.env.serviceRoleProjectRef,
      },
    });
    result.recommendedFix = 'In Vercel, set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY from the same Supabase project (Settings → API).';
  }

  if (result.env.serviceRoleJwtRole && result.env.serviceRoleJwtRole !== 'service_role') {
    result.supabaseErrors.push({
      code: 'WRONG_SERVICE_KEY_ROLE',
      message: 'SUPABASE_SERVICE_ROLE_KEY JWT role is "' + result.env.serviceRoleJwtRole + '" but must be "service_role".',
    });
    result.recommendedFix = 'Replace SUPABASE_SERVICE_ROLE_KEY in Vercel with the service_role secret from Supabase → Settings → API.';
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    result.recommendedFix = result.recommendedFix || 'Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.';
    return result;
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    result.supabaseErrors.push({
      code: 'ADMIN_CLIENT',
      message: err.message,
    });
    result.recommendedFix = result.recommendedFix || 'Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.';
    return result;
  }

  const { data, error, count } = await supabase
    .from('profiles')
    .select('id, email, role, stripe_customer_id, stripe_session_id, premium_since, created_at, updated_at', { count: 'exact' })
    .limit(1);

  if (error) {
    result.supabaseErrors.push({
      code: error.code || null,
      message: error.message,
      details: error.details || null,
      hint: error.hint || null,
    });

    const classified = classifySupabaseError(error);
    if (classified) {
      result.table.exists = classified.type === 'TABLE_MISSING' ? false : true;
      result.recommendedFix = result.recommendedFix || classified.recommendedFix;
      if (classified.type === 'TABLE_MISSING') {
        result.sqlToRun = 'Run the full contents of supabase/schema.sql in Supabase project ' + (supabaseProjectRef || 'your-project') + '.';
      }
      if (classified.type === 'TABLE_GRANTS_MISSING') {
        result.table.exists = true;
        result.table.readable = false;
        result.sqlToRun = 'Run the full contents of supabase/fix-profiles-grants.sql in Supabase project ' + (supabaseProjectRef || 'your-project') + '.';
      }
    }
  } else {
    result.table.exists = true;
    result.table.readable = true;
    result.table.sampleRowCount = typeof count === 'number' ? count : null;

    if (data && data.length) {
      result.columns.present = Object.keys(data[0]);
    } else {
      result.columns.present = EXPECTED_COLUMNS.slice();
    }
  }

  const probeId = '00000000-0000-0000-0000-000000000099';
  const { error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: probeId,
      email: 'diagnostic-probe@invalid.edgestats',
      role: 'free',
    });

  if (!insertError) {
    result.table.writable = true;
    await supabase.from('profiles').delete().eq('id', probeId);
  } else {
    result.supabaseErrors.push({
      phase: 'insert_probe',
      code: insertError.code || null,
      message: insertError.message,
      details: insertError.details || null,
      hint: insertError.hint || null,
    });

    if (insertError.code === '23503') {
      result.table.writable = true;
      result.table.exists = true;
    } else if (insertError.code === '42501' && /permission denied for table/i.test(insertError.message || '')) {
      result.table.exists = true;
      result.table.writable = false;
      result.recommendedFix = result.recommendedFix || 'Run supabase/fix-profiles-grants.sql in Supabase SQL Editor for project ' + (supabaseProjectRef || 'your-project') + '.';
      result.sqlToRun = result.sqlToRun || 'Run the full contents of supabase/fix-profiles-grants.sql (or re-run supabase/schema.sql).';
    } else {
      const classified = classifySupabaseError(insertError);
      if (classified) {
        if (classified.type === 'TABLE_MISSING') result.table.exists = false;
        if (classified.type === 'RLS_DENIED') {
          result.table.exists = true;
          result.table.writable = false;
        }
        result.recommendedFix = result.recommendedFix || classified.recommendedFix;
        if (classified.type === 'TABLE_MISSING') {
          result.sqlToRun = 'Run the full contents of supabase/schema.sql in Supabase project ' + (supabaseProjectRef || 'your-project') + '.';
        }
      }
    }
  }

  if (result.columns.present.length) {
    result.columns.missing = EXPECTED_COLUMNS.filter(function (column) {
      return result.columns.present.indexOf(column) === -1;
    });
  }

  if (result.columns.missing.length) {
    result.recommendedFix = result.recommendedFix || 'Profiles table is missing expected columns. Re-run supabase/schema.sql.';
    result.sqlToRun = result.sqlToRun || 'Run the full contents of supabase/schema.sql in Supabase project ' + (supabaseProjectRef || 'your-project') + '.';
  }

  result.ok = Boolean(
    result.table.exists
    && result.table.readable
    && result.table.writable
    && result.env.projectRefsMatch
    && result.env.serviceRoleJwtRole === 'service_role'
    && !result.columns.missing.length
  );

  if (!result.ok && !result.recommendedFix && result.table.exists === false) {
    result.recommendedFix = 'Run supabase/schema.sql in Supabase SQL Editor for project ' + (supabaseProjectRef || 'your-project') + '.';
    result.sqlToRun = 'Run the full contents of supabase/schema.sql in Supabase project ' + (supabaseProjectRef || 'your-project') + '.';
  }

  return result;
}

export function formatSupabaseSetupError(err) {
  const classified = classifySupabaseError(err);
  if (classified) return classified.recommendedFix;
  const message = err && err.message ? err.message : String(err);
  return 'Unable to access Supabase profiles: ' + message;
}
