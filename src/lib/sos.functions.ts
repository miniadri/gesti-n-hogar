import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TriggerInput = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  location_accuracy: z.number().nonnegative().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
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
    return data ?? [];
  });

/** SOS alerts addressed to the current user that still need acknowledgement. */
export const listPendingSosAcks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sos_acknowledgements")
      .select("id, sos_event_id, created_at, sos_events(id, triggered_by_name, latitude, longitude, note, created_at)")
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

    const { count } = await context.supabase
      .from("sos_acknowledgements")
      .select("id", { count: "exact", head: true })
      .eq("sos_event_id", data.sosEventId)
      .is("acknowledged_at", null);

    return { ok: true, pending: count ?? 0 };
  });
