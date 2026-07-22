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

export const saveHomeAssistantConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await requireHouseholdId(context.supabase);
    await requireAdmin(context.supabase, context.userId);

    const { haPing } = await import("./home-assistant.server");
    const { encryptToken } = await import("./ha-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let status = "connected";
    let last_error: string | null = null;
    try {
      await haPing(data.base_url, data.token);
    } catch (err: any) {
      status = "unreachable";
      last_error = err?.message ?? String(err);
      throw new Error(`No se pudo conectar con Home Assistant: ${last_error}`);
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
            }),
          ),
          last_state_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "household_id,external_source,external_id" },
      );
      if (!error) upserted += 1;
    }

    await supabaseAdmin
      .from("home_assistant_connections")
      .update({ status: "connected", last_error: null, last_synced_at: nowIso })
      .eq("id", row.id);

    return { ok: true, count: upserted };
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

    await haCallService(row.base_url, token, domain, data.service, {
      entity_id: data.entity_id,
      ...(data.data ?? {}),
    });

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
