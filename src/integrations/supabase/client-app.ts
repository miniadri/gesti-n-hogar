// App-level Supabase client with an override layer.
// Priority:
//   1. VITE_OWN_SUPABASE_URL + VITE_OWN_SUPABASE_ANON_KEY (your own Supabase project)
//   2. Lovable Cloud managed VITE_SUPABASE_* / SUPABASE_* variables
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { supabase as cloudSupabase } from './client';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }
    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function getOverrideConfig(): { url: string; key: string } | null {
  const url =
    import.meta.env.VITE_OWN_SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.APP_SUPABASE_URL : undefined);
  const key =
    import.meta.env.VITE_OWN_SUPABASE_ANON_KEY ||
    (typeof process !== 'undefined'
      ? process.env?.APP_SUPABASE_PUBLISHABLE_KEY || process.env?.APP_SUPABASE_ANON_KEY
      : undefined);
  if (url && key) return { url, key };
  return null;
}

function createOverrideClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createOverrideClient> | undefined;

export const isUsingOwnSupabase = getOverrideConfig() !== null;

export const supabase = new Proxy({} as ReturnType<typeof createOverrideClient>, {
  get(_, prop, receiver) {
    const override = getOverrideConfig();
    if (!override) return Reflect.get(cloudSupabase as never, prop, receiver);
    if (!_client) _client = createOverrideClient(override.url, override.key);
    return Reflect.get(_client, prop, receiver);
  },
});
