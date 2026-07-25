import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getConnectionKeyForUser } from "@/server/appUserConnections.server";
import {
  GOOGLE_CALENDAR_CONNECTOR,
  insertPrimaryEvent,
  updatePrimaryEvent,
  deletePrimaryEvent,
} from "./google-calendar.server";

const EventInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional(),
  category: z.string().optional(),
  attendees: z.array(z.string().uuid()).default([]),
  is_public: z.boolean().optional(),
  push_to_google: z.boolean().optional(),
});

const UpdateEventInput = EventInput.partial().extend({ id: z.string().uuid() });
const DeleteEventInput = z.object({ id: z.string().uuid() });
const TogglePublicInput = z.object({ id: z.string().uuid(), is_public: z.boolean() });

async function userHasGoogle(userId: string): Promise<boolean> {
  const k = await getConnectionKeyForUser(userId, GOOGLE_CALENDAR_CONNECTOR);
  return !!k;
}

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

    const { push_to_google, ...eventData } = data;

    let googleId: string | null = null;
    let googleEtag: string | null = null;
    if (push_to_google && (await userHasGoogle(context.userId))) {
      try {
        const g = await insertPrimaryEvent(context.userId, {
          title: eventData.title,
          description: eventData.description ?? null,
          start_at: eventData.start_at,
          end_at: eventData.end_at ?? null,
        });
        googleId = g.id;
        googleEtag = g.etag ?? null;
      } catch (e) {
        console.error("Push to Google failed:", e);
      }
    }

    const { data: event, error } = await context.supabase
      .from("calendar_events")
      .insert({
        ...eventData,
        household_id: householdId,
        created_by: context.userId,
        source: googleId ? "google_calendar" : "manual",
        external_id: googleId,
        google_calendar_id: googleId ? "primary" : null,
        google_event_etag: googleEtag,
      })
      .select()
      .single();
    if (error) throw error;
    return event;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateEventInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, push_to_google, ...rest } = data;

    // Fetch existing to know if it's on Google
    const { data: current } = await context.supabase
      .from("calendar_events")
      .select("*")
      .eq("id", id)
      .single();

    if (current?.external_id && current.source === "google_calendar" && (await userHasGoogle(context.userId))) {
      try {
        const g = await updatePrimaryEvent(context.userId, current.external_id, {
          title: rest.title ?? current.title,
          description: (rest.description ?? current.description) as string | null,
          start_at: rest.start_at ?? current.start_at,
          end_at: (rest.end_at ?? current.end_at) as string | null,
        });
        (rest as any).google_event_etag = g.etag ?? null;
      } catch (e) {
        console.error("Update on Google failed:", e);
      }
    }

    const { data: event, error } = await context.supabase
      .from("calendar_events")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return event;
  });

export const togglePublicEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TogglePublicInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: event, error } = await context.supabase
      .from("calendar_events")
      .update({ is_public: data.is_public })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return event;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteEventInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("calendar_events")
      .select("external_id, source, created_by")
      .eq("id", data.id)
      .single();

    if (
      current?.external_id &&
      current.source === "google_calendar" &&
      current.created_by === context.userId &&
      (await userHasGoogle(context.userId))
    ) {
      try {
        await deletePrimaryEvent(context.userId, current.external_id);
      } catch (e) {
        console.error("Delete on Google failed:", e);
      }
    }

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
