// Override layer: APP_SUPABASE_* / VITE_OWN_SUPABASE_* take priority over the
// Lovable Cloud managed SUPABASE_* variables.
export function getSupabaseUrl() {
  return (
    process.env.APP_SUPABASE_URL ||
    process.env.VITE_OWN_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL
  );
}

export function getSupabasePublishableKey() {
  return (
    process.env.APP_SUPABASE_PUBLISHABLE_KEY ||
    process.env.APP_SUPABASE_ANON_KEY ||
    process.env.VITE_OWN_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  );
}

export function getSupabaseServiceRoleKey() {
  return process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function requireSupabasePublicEnv() {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  if (!url || !publishableKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL or VITE_SUPABASE_URL"] : []),
      ...(!publishableKey
        ? ["SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY"]
        : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return { url, publishableKey };
}

export function requireSupabaseAdminEnv() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL or VITE_SUPABASE_URL"] : []),
      ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY or APP_SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return { url, serviceRoleKey };
}
