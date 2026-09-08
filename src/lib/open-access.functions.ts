import { createServerFn } from "@tanstack/react-start";

/**
 * Acceso libre: el login/registro está desactivado.
 * Devuelve un token de un solo uso para iniciar sesión automáticamente
 * con la cuenta principal del hogar (la más antigua, o OPEN_ACCESS_EMAIL).
 */
const UNAVAILABLE =
  "El servicio de datos no responde ahora mismo (puede estar en pausa). Inténtalo de nuevo en unos minutos.";

export const getOpenAccessToken = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let email = process.env["OPEN_ACCESS_EMAIL"];

    if (!email) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return { error: UNAVAILABLE } as const;
      const users = [...(data?.users ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      email = users.find((u) => u.email)?.email ?? undefined;
    }

    if (!email) {
      return { error: "No hay ninguna cuenta disponible para el acceso libre" } as const;
    }

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError) return { error: UNAVAILABLE } as const;

    const tokenHash = link?.properties?.hashed_token;
    if (!tokenHash) return { error: "No se pudo generar el acceso automático" } as const;

    return { email, tokenHash } as const;
  } catch {
    return { error: UNAVAILABLE } as const;
  }
});
