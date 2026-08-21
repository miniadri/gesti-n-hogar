// Reverted: this module now simply re-exports the built-in Lovable Cloud
// Supabase client. The custom VITE_OWN_* / APP_SUPABASE_* override layer was removed.
export { supabase } from './client';

export const isUsingOwnSupabase = false;
