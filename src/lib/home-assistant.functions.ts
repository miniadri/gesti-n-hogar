import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public shape returned to the client — never includes the token or full URL.
export type HaConnectionPublic = {
  id: string;
  household_id: string;
  base_url_masked: string;
  status: string;
  last_error: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return "***";
  }
}

async function requireHouseholdId(supabase: any): Promise<string> {
  const { data } = await supabase.rpc("current_household");
  if (!data) throw new Error("No household");
  return data as string;
}

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Solo un administrador del hogar puede gestionar esta conexión");
}

async function loadConnectionInternal(householdId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("home_assistant_connections")
    .select("id, household_id, base_url, token_ciphertext, status, last_error, last_synced_at, updated_at")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const getHomeAssistantConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HaConnectionPublic | null> => {
    const householdId = await requireHouseholdId(context.supabase);
    const row = await loadConnectionInternal(householdId);
    if (!row) return null;
    return {
      id: row.id,
      household_id: row.household_id,
      base_url_masked: maskUrl(row.base_url),
      status: row.status,
      last_error: row.last_error,
      last_synced_at: row.last_synced_at,
      updated_at: row.updated_at,
    };
  });

const SaveInput = z.object({
  base_url: z.string().url().max(500),
  token: z.string().min(20).max(4000),
});

function assertReachableFromCloud(baseUrl: string) {
  try {
    const u = new URL(baseUrl);
    const h = u.hostname.toLowerCase();
    const isPrivate =
      h === "localhost" ||
      h.endsWith(".local") ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h);
    if (isPrivate) {
      throw new Error(
        "La URL apunta a una dirección privada o local. HomeSync se ejecuta en la nube, por lo que necesita una URL pública con HTTPS (Cloudflare Tunnel, DuckDNS + Let's Encrypt, etc.).",
      );
    }
    if (u.protocol !== "https:") {
      throw new Error(
        "La URL debe usar HTTPS. Las conexiones HTTP no están permitidas por seguridad.",
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("URL pública")) throw err;
    throw new Error("URL no válida");
  }
}

export const saveHomeAssistantConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await requireHouseholdId(context.supabase);
    await requireAdmin(context.supabase, context.userId);
    assertReachableFromCloud(data.base_url);

    const { haPing } = await import("./home-assistant.server");
    const { encryptToken } = await import("./ha-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let status = "connected";
    let last_error: string | null = null;
    try {
      await haPing(data.base_url, data.token);
    } catch (err: any) {
      status = "unreachable";
      const raw = err?.message ?? String(err);
      last_error = raw;
      let hint = raw;
      if (/aborted|timeout/i.test(raw)) {
        hint =
          "Tiempo de espera agotado. Comprueba que la URL sea accesible desde internet (pruébala en el móvil con datos móviles, no en WiFi), que el puerto 443 esté redirigido al 8123 de Home Assistant y que el certificado SSL sea válido.";
      } else if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/i.test(raw)) {
        hint =
          "No se pudo conectar al dominio. Verifica que DuckDNS apunta a tu IP pública actual y que el router redirige el puerto 443 externo al 8123 de Home Assistant. Prueba abrir la URL desde el móvil con datos móviles para confirmar que es accesible desde fuera de tu red.";
      } else if (/certificate|SSL|self.signed/i.test(raw)) {
        hint =
          "Problema con el certificado HTTPS. Asegúrate de tener un certificado válido de Let's Encrypt (el add-on DuckDNS de Home Assistant lo gestiona automáticamente).";
      } else if (/401|403/.test(raw)) {
        hint =
          "Token rechazado por Home Assistant. Genera un token nuevo desde tu perfil de HA e inténtalo de nuevo.";
      }
      throw new Error(`No se pudo conectar con Home Assistant: ${hint}`);
    }

    const { error } = await supabaseAdmin
      .from("home_assistant_connections")
      .upsert(
        {
          household_id: householdId,
          base_url: data.base_url,
          token_ciphertext: encryptToken(data.token),
          status,
          last_error,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "household_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const deleteHomeAssistantConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await requireHouseholdId(context.supabase);
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove HA-sourced devices too.
    await supabaseAdmin
      .from("devices")
      .delete()
      .eq("household_id", householdId)
      .eq("external_source", "home_assistant");
    const { error } = await supabaseAdmin
      .from("home_assistant_connections")
      .delete()
      .eq("household_id", householdId);
    if (error) throw error;
    return { ok: true };
  });

export const syncHomeAssistantEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await requireHouseholdId(context.supabase);
    const row = await loadConnectionInternal(householdId);
    if (!row) throw new Error("Home Assistant no está configurado");

    const { decryptToken } = await import("./ha-crypto.server");
    const { haListStates, HA_DOMAINS, domainOf, mapDomainToDeviceType } = await import(
      "./home-assistant.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const token = decryptToken(row.token_ciphertext);
    let states;
    try {
      states = await haListStates(row.base_url, token);
    } catch (err: any) {
      await supabaseAdmin
        .from("home_assistant_connections")
        .update({ status: "unreachable", last_error: err?.message ?? String(err) })
        .eq("id", row.id);
      throw new Error(`Sincronización fallida: ${err?.message ?? err}`);
    }

    const allowed = new Set<string>(HA_DOMAINS as readonly string[]);
    const filtered = states.filter((s) => allowed.has(domainOf(s.entity_id)));

    const nowIso = new Date().toISOString();
    let upserted = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (const s of filtered) {
      const domain = domainOf(s.entity_id);
      const friendly = (s.attributes?.friendly_name as string) ?? s.entity_id;
      const isOn = s.state === "on" || s.state === "open" || s.state === "playing";
      const isOff = s.state === "off" || s.state === "closed" || s.state === "idle";
      const status = isOn ? "on" : isOff ? "off" : "off";
      const { error } = await supabaseAdmin.from("devices").upsert(
        {
          household_id: householdId,
          name: friendly,
          type: mapDomainToDeviceType(domain),
          status,
          domain,
          external_source: "home_assistant",
          external_id: s.entity_id,
          attributes: JSON.parse(
            JSON.stringify({
              state: s.state,
              unit_of_measurement: s.attributes?.unit_of_measurement ?? null,
              brightness: s.attributes?.brightness ?? null,
              current_temperature: s.attributes?.current_temperature ?? null,
              temperature: s.attributes?.temperature ?? null,
              hvac_modes: s.attributes?.hvac_modes ?? null,
              device_class: s.attributes?.device_class ?? null,
              attribution: s.attributes?.attribution ?? null,
            }),
          ),
          last_state_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "household_id,external_source,external_id" },
      );
      if (error) {
        failed += 1;
        lastError = error.message;
      } else {
        upserted += 1;
      }
    }

    await supabaseAdmin
      .from("home_assistant_connections")
      .update({
        status: "connected",
        last_error: failed > 0 ? `${failed} fallos: ${lastError}` : null,
        last_synced_at: nowIso,
      })
      .eq("id", row.id);

    return { ok: true, count: upserted, failed, total: filtered.length };
  });

const ServiceInput = z.object({
  entity_id: z.string().min(1),
  service: z.string().min(1).max(60),
  data: z.record(z.string(), z.any()).optional(),
});

export const callHomeAssistantService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ServiceInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await requireHouseholdId(context.supabase);
    const row = await loadConnectionInternal(householdId);
    if (!row) throw new Error("Home Assistant no está configurado");

    // Confirm the entity belongs to this household (prevents arbitrary entity_id from client).
    const { data: device, error: devErr } = await context.supabase
      .from("devices")
      .select("id, domain, external_id")
      .eq("household_id", householdId)
      .eq("external_source", "home_assistant")
      .eq("external_id", data.entity_id)
      .maybeSingle();
    if (devErr) throw devErr;
    if (!device) throw new Error("Dispositivo no encontrado en este hogar");

    const domain = device.domain ?? data.entity_id.split(".")[0];
    const { decryptToken } = await import("./ha-crypto.server");
    const { haCallService, haGetState } = await import("./home-assistant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = decryptToken(row.token_ciphertext);

    try {
      await haCallService(row.base_url, token, domain, data.service, {
        entity_id: data.entity_id,
        ...(data.data ?? {}),
      });
    } catch (err: any) {
      const raw = err?.message ?? String(err);
      let hint = raw;
      if (/aborted|timeout/i.test(raw)) {
        hint = "Home Assistant no respondió a tiempo. Verifica que sea accesible desde internet.";
      } else if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/i.test(raw)) {
        hint = "No se pudo conectar con Home Assistant. Comprueba la URL pública y el reenvío de puertos.";
      } else if (/401|403/.test(raw)) {
        hint = "Token rechazado por Home Assistant. Genera uno nuevo desde tu perfil.";
      }
      await supabaseAdmin
        .from("home_assistant_connections")
        .update({ status: "unreachable", last_error: raw })
        .eq("id", row.id);
      throw new Error(hint);
    }

    // Refresh state from HA and update local mirror
    try {
      const s = await haGetState(row.base_url, token, data.entity_id);
      const isOn = s.state === "on" || s.state === "open" || s.state === "playing";
      const status = isOn ? "on" : "off";
      await supabaseAdmin
        .from("devices")
        .update({
          status,
          attributes: JSON.parse(
            JSON.stringify({
              state: s.state,
              brightness: s.attributes?.brightness ?? null,
              current_temperature: s.attributes?.current_temperature ?? null,
              temperature: s.attributes?.temperature ?? null,
            }),
          ),
          last_state_at: new Date().toISOString(),
        })
        .eq("id", device.id);
    } catch {
      // Ignore state refresh errors; next sync will reconcile.
    }

    return { ok: true };
  });
