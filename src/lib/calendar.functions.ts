import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EventInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional(),
  category: z.string().optional(),
  attendees: z.array(z.string().uuid()).default([]),
});

const UpdateEventInput = EventInput.partial().extend({ id: z.string().uuid() });
const DeleteEventInput = z.object({ id: z.string().uuid() });

export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("calendar_events")
      .select("*")
      .eq("household_id", householdId)
      .order("start_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EventInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: event, error } = await context.supabase
      .from("calendar_events")
      .insert({ ...data, household_id: householdId, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return event;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateEventInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: event, error } = await context.supabase
      .from("calendar_events")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return event;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteEventInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("calendar_events").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const RestoreEventInput = z.object({ row: z.record(z.string(), z.any()) });

export const restoreEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RestoreEventInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const payload: Record<string, any> = { ...data.row, household_id: householdId };
    delete payload.updated_at;
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });
