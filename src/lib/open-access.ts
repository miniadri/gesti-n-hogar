import { supabase } from "@/integrations/supabase/client-app";
import { getOpenAccessToken } from "@/lib/open-access.functions";

/** Acceso libre: garantiza una sesión activa sin pedir usuario ni contraseña. */
export async function ensureOpenAccessSession() {
  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user;

  let result: Awaited<ReturnType<typeof getOpenAccessToken>>;
  try {
    result = await getOpenAccessToken({ data: undefined } as never);
  } catch {
    throw new Error(
      "El servicio de datos no responde ahora mismo (puede estar en pausa). Inténtalo de nuevo en unos minutos.",
    );
  }

  if ("error" in result) throw new Error(result.error);

  const { data: verified, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: result.tokenHash,
  });
  if (error) throw error;
  return verified.user ?? null;
}
