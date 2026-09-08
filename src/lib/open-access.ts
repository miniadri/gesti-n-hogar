import { supabase } from "@/integrations/supabase/client-app";
import { getOpenAccessToken } from "@/lib/open-access.functions";

/** Acceso libre: garantiza una sesión activa sin pedir usuario ni contraseña. */
export async function ensureOpenAccessSession() {
  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user;

  const { tokenHash } = await getOpenAccessToken({ data: undefined } as never);
  const { data: verified, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (error) throw error;
  return verified.user ?? null;
}
