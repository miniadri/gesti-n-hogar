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

    const { data: sos, error } = await context.supabase
      .from("sos_events")
      .insert({
        household_id: householdId,
        triggered_by: context.userId,
        triggered_by_name: triggeredByName,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        location_accuracy: data.location_accuracy ?? null,
        note: data.note ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Fire notifications (adults + emergency contacts). Best-effort.
    try {
      const { sendSosAlert } = await import("@/lib/notify.server");
      await sendSosAlert(context.supabase, householdId, {
        name: triggeredByName,
        userId: context.userId,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        note: data.note ?? null,
      });
    } catch (err) {
      console.error("SOS notify error", err);
    }

    return sos;
  });

export const listSosEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) return [];
    const { data, error } = await context.supabase
      .from("sos_events")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });
