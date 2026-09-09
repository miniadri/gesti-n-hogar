import { createServerFn } from "@tanstack/react-start";

/**
 * Acceso libre: el login/registro está desactivado.
 * Devuelve un token de un solo uso para iniciar sesión automáticamente
 * con la cuenta principal del hogar (la más antigua, o OPEN_ACCESS_EMAIL).
 */
export const getOpenAccessToken = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let email = process.env["OPEN_ACCESS_EMAIL"];

  if (!email) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const users = [...(data?.users ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    email = users.find((u) => u.email)?.email ?? undefined;
  }

  if (!email) throw new Error("No hay ninguna cuenta disponible para el acceso libre");

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw linkError;

  const tokenHash = link?.properties?.hashed_token;
  if (!tokenHash) throw new Error("No se pudo generar el acceso automático");

  return { email, tokenHash };
});
