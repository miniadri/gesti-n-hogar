import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TriggerInput = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  location_accuracy: z.number().nonnegative().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  sos_type: z.enum(["urgency", "medical", "fall", "unsafe", "other"]).optional(),
  battery_level: z.number().min(0).max(100).nullable().optional(),
  battery_charging: z.boolean().nullable().optional(),
  connection_type: z.string().max(40).nullable().optional(),
  location_source: z.enum(["precise", "fallback", "last_known", "none"]).nullable().optional(),
  last_known_location_used: z.boolean().optional(),
  is_test: z.boolean().optional(),
});

export const triggerSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => TriggerInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: member } = await context.supabase
      .from("household_members")
      .select("display_name")
      .eq("household_id", householdId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const triggeredByName = member?.display_name || "Un miembro";

    const payload = {
      household_id: householdId,
      triggered_by: context.userId,
      triggered_by_name: triggeredByName,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      location_accuracy: data.location_accuracy ?? null,
      note: data.note ?? null,
      sos_type: data.sos_type ?? "urgency",
      battery_level: data.battery_level ?? null,
      battery_charging: data.battery_charging ?? null,
      connection_type: data.connection_type ?? null,
      location_source: data.location_source ?? null,
      last_known_location_used: data.last_known_location_used ?? false,
      is_test: data.is_test ?? false,
    };

    const { data: sos, error } = await context.supabase
      .from("sos_events")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("SOS history insert error", error);
    }

    let notificationStatus: {
      pushSent: boolean;
      telegramSent: number;
      ok: boolean;
      reason: string | null;
    } = {
      pushSent: false,
      telegramSent: 0,
      ok: false,
      reason: "not_attempted",
    };


    try {
      const { sendSosAlert } = await import("@/lib/notify.server");
      notificationStatus = await sendSosAlert(context.supabase, householdId, {
        id: (sos as any)?.id ?? null,
        created_at: (sos as any)?.created_at,
        name: triggeredByName,
        userId: context.userId,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        location_accuracy: data.location_accuracy ?? null,
        note: data.note ?? null,
        sos_type: data.sos_type ?? "urgency",
        battery_level: data.battery_level ?? null,
        battery_charging: data.battery_charging ?? null,
        connection_type: data.connection_type ?? null,
        location_source: data.location_source ?? null,
        last_known_location_used: data.last_known_location_used ?? false,
        is_test: data.is_test ?? false,
      });

    } catch (err) {
      console.error("SOS notify error", err);
      notificationStatus = {
        pushSent: false,
        telegramSent: 0,
        ok: false,
        reason: err instanceof Error ? err.message : "notification_error",
      };
    }

    return {
      ...(sos ?? { ...payload, id: null, created_at: new Date().toISOString(), history_saved: false }),
      notification_status: notificationStatus,
    };
  });

export const triggerSosSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: member } = await context.supabase
      .from("household_members")
      .select("display_name")
      .eq("household_id", householdId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const triggeredByName = member?.display_name || "Un miembro";

    const payload = {
      household_id: householdId,
      triggered_by: context.userId,
      triggered_by_name: triggeredByName,
      latitude: null,
      longitude: null,
      location_accuracy: null,
      note: "Simulacro SOS desde Ajustes > Emergencia",
      sos_type: "urgency",
      battery_level: null,
      battery_charging: null,
      connection_type: null,
      location_source: "none",
      last_known_location_used: false,
      is_test: true,
    };

    const { data: sos, error } = await context.supabase
      .from("sos_events")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    let notificationStatus = {
      pushSent: false,
      telegramSent: 0,
      ok: false,
      reason: "not_attempted" as string | null,
    };

    try {
      const { sendSosAlert } = await import("@/lib/notify.server");
      notificationStatus = await sendSosAlert(context.supabase, householdId, {
        id: (sos as any)?.id ?? null,
        created_at: (sos as any)?.created_at,
        name: triggeredByName,
        userId: context.userId,
        latitude: null,
        longitude: null,
        location_accuracy: null,
        note: payload.note,
        sos_type: "urgency",
        battery_level: null,
        battery_charging: null,
        connection_type: null,
        location_source: "none",
        last_known_location_used: false,
        is_test: true,
      });
    } catch (err) {
      console.error("SOS simulation notify error", err);
      notificationStatus = {
        pushSent: false,
        telegramSent: 0,
        ok: false,
        reason: err instanceof Error ? err.message : "notification_error",
      };
    }

    return { ...sos, notification_status: notificationStatus };
  });

export const cancelSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ sosEventId: z.string().uuid(), reason: z.string().max(300).nullable().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: event, error: eventError } = await context.supabase
      .from("sos_events")
      .select("id, household_id, triggered_by, triggered_by_name, acknowledged_at, cancelled_at, created_at")
      .eq("id", data.sosEventId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) throw new Error("SOS no encontrado");
    if ((event as any).triggered_by !== context.userId) {
      throw new Error("Solo puede cancelar el SOS quien lo lanzó");
    }
    if ((event as any).cancelled_at) return { ok: true, alreadyCancelled: true };

    const now = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { dispatchSosCancellation } = await import("@/lib/notify.server");
    await dispatchSosCancellation(supabaseAdmin, {
      id: data.sosEventId,
      household_id: householdId,
      triggered_by_name: (event as any).triggered_by_name,
      created_at: (event as any).created_at,
      note: data.reason ?? null,
    });

    const { error } = await supabaseAdmin
      .from("sos_events")
      .update({
        cancelled_at: now,
        cancelled_by: context.userId,
        cancel_reason: data.reason ?? null,
        acknowledged_at: now,
      })
      .eq("id", data.sosEventId)
      .eq("triggered_by", context.userId);
    if (error) throw error;

    await supabaseAdmin
      .from("sos_acknowledgements")
      .update({ acknowledged_at: now, channel: "cancelled" })
      .eq("sos_event_id", data.sosEventId)
      .is("acknowledged_at", null);

    return { ok: true };
  });

export const listSosEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) return [];
    const { data, error } = await context.supabase
      .from("sos_events")
      .select("*, sos_acknowledgements(id, recipient_name, acknowledged_at, channel)")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      ...row,
      can_cancel: row.triggered_by === context.userId && !row.cancelled_at && !row.acknowledged_at && !row.is_test,
    }));
  });

/** SOS alerts addressed to the current user that still need acknowledgement. */
export const listPendingSosAcks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sos_acknowledgements")
      .select("id, sos_event_id, created_at, sos_events(id, triggered_by_name, latitude, longitude, note, created_at, cancelled_at)")
      .eq("user_id", context.userId)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data ?? [];
  });

/** Acknowledgement status of a SOS event (who has confirmed and who hasn't). */
export const listSosAckStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ sosEventId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sos_acknowledgements")
      .select("id, recipient_name, channel, acknowledged_at, user_id, telegram_chat_id")
      .eq("sos_event_id", data.sosEventId)
      .order("recipient_name");
    if (error) throw error;
    return rows ?? [];
  });

export const acknowledgeSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ sosEventId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sos_acknowledgements")
      .update({ acknowledged_at: new Date().toISOString(), channel: "app" })
      .eq("sos_event_id", data.sosEventId)
      .eq("user_id", context.userId)
      .is("acknowledged_at", null);
    if (error) throw error;

    await context.supabase
      .from("sos_events")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", data.sosEventId)
      .is("acknowledged_at", null);

    const { count } = await context.supabase
      .from("sos_acknowledgements")
      .select("id", { count: "exact", head: true })
      .eq("sos_event_id", data.sosEventId)
      .is("acknowledged_at", null);

    return { ok: true, pending: count ?? 0 };
  });
