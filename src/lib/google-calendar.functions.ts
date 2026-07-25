import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  authorizeAppUserOAuth,
  disconnectAppUser,
} from "@/integrations/lovable/appUserConnector";
import {
  saveConnectionKeyForUser,
  getConnectionKeyForUser,
  deleteConnectionKeyForUser,
  hasConnection,
} from "@/server/appUserConnections.server";
import {
  GATEWAY_BASE_URL,
  GOOGLE_CALENDAR_CONNECTOR,
  GOOGLE_CALENDAR_SCOPES,
  listPrimaryEvents,
  extractStartISO,
  extractEndISO,
} from "./google-calendar.server";

// -------- OAuth start --------
export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((targetOrigin: string) => z.string().url().parse(targetOrigin))
  .handler(async ({ data: targetOrigin, context }) => {
    const clientKey = process.env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientKey) throw new Error("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY not set");

    const existing = await getConnectionKeyForUser(context.userId, GOOGLE_CALENDAR_CONNECTOR);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: GOOGLE_CALENDAR_CONNECTOR,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl: `${targetOrigin}/settings/google-calendar`,
      responseMode: "web_message",
      webMessageTargetOrigin: targetOrigin,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_CALENDAR_SCOPES },
    });
    return { authorizationUrl };
  });

// -------- Save key after popup --------
export const saveGoogleCalendarConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionAPIKey: string }) =>
    z.object({ connectionAPIKey: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await saveConnectionKeyForUser(
      context.userId,
      GOOGLE_CALENDAR_CONNECTOR,
      data.connectionAPIKey,
    );
    return { ok: true };
  });

// -------- Status --------
export const getGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const connected = await hasConnection(context.userId, GOOGLE_CALENDAR_CONNECTOR);
    return { connected };
  });

// -------- Disconnect --------
export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await getConnectionKeyForUser(context.userId, GOOGLE_CALENDAR_CONNECTOR);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: GOOGLE_CALENDAR_CONNECTOR,
        });
      } catch (e) {
        console.error("Gateway disconnect failed:", e);
      }
    }
    await deleteConnectionKeyForUser(context.userId, GOOGLE_CALENDAR_CONNECTOR);
    return { ok: true };
  });

// -------- Import: pull events from Google into calendar_events --------
export const syncGoogleCalendarImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const now = new Date();
    const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const future = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

    const events = await listPrimaryEvents(context.userId, {
      timeMinISO: past.toISOString(),
      timeMaxISO: future.toISOString(),
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const ev of events) {
      if (ev.status === "cancelled") continue;
      const startISO = extractStartISO(ev);
      if (!startISO) {
        skipped++;
        continue;
      }
      const endISO = extractEndISO(ev);

      const { data: existing } = await context.supabase
        .from("calendar_events")
        .select("id, google_event_etag")
        .eq("created_by", context.userId)
        .eq("source", "google_calendar")
        .eq("external_id", ev.id)
        .maybeSingle();

      if (existing) {
        if (existing.google_event_etag === ev.etag) {
          skipped++;
          continue;
        }
        await context.supabase
          .from("calendar_events")
          .update({
            title: ev.summary ?? "(sin título)",
            description: ev.description ?? null,
            start_at: startISO,
            end_at: endISO,
            google_event_etag: ev.etag ?? null,
          })
          .eq("id", existing.id);
        updated++;
      } else {
        await context.supabase.from("calendar_events").insert({
          household_id: householdId,
          created_by: context.userId,
          title: ev.summary ?? "(sin título)",
          description: ev.description ?? null,
          start_at: startISO,
          end_at: endISO,
          category: "google",
          source: "google_calendar",
          external_id: ev.id,
          google_calendar_id: "primary",
          google_event_etag: ev.etag ?? null,
          is_public: false,
        });
        inserted++;
      }
    }

    return { inserted, updated, skipped, total: events.length };
  });
