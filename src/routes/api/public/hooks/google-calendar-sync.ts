import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  listPrimaryEvents,
  extractStartISO,
  extractEndISO,
} from "@/lib/google-calendar.server";

function getLocalHour(tz: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  return hourPart ? parseInt(hourPart.value, 10) : now.getUTCHours();
}

// Runs hourly via pg_cron. For every user whose profile.google_sync_hours
// contains the current LOCAL hour (in their stored timezone), import Google
// Calendar events into HomeSync.
export const Route = createFileRoute("/api/public/hooks/google-calendar-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const bearer = authHeader.replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_BEARER ?? "";
        if (!expected || bearer !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("id, google_sync_hours, timezone");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const targets = (profiles ?? []).filter((p: any) => {
          if (!Array.isArray(p.google_sync_hours) || p.google_sync_hours.length === 0) {
            return false;
          }
          const tz = p.timezone || "UTC";
          const localHour = getLocalHour(tz);
          return p.google_sync_hours.includes(localHour);
        });

        let usersProcessed = 0;
        let usersSkipped = 0;
        let totalInserted = 0;
        let totalUpdated = 0;

        for (const p of targets) {
          const userId = p.id as string;

          // Find household of this user
          const { data: member } = await supabase
            .from("household_members")
            .select("household_id")
            .eq("user_id", userId)
            .maybeSingle();
          if (!member?.household_id) {
            usersSkipped++;
            continue;
          }

          try {
            const now = new Date();
            const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
            const future = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

            const events = await listPrimaryEvents(userId, {
              timeMinISO: past.toISOString(),
              timeMaxISO: future.toISOString(),
            });

            for (const ev of events) {
              if (ev.status === "cancelled") continue;
              const startISO = extractStartISO(ev);
              if (!startISO) continue;
              const endISO = extractEndISO(ev);

              const { data: existing } = await supabase
                .from("calendar_events")
                .select("id, google_event_etag")
                .eq("created_by", userId)
                .eq("source", "google_calendar")
                .eq("external_id", ev.id)
                .maybeSingle();

              if (existing) {
                if (existing.google_event_etag === ev.etag) continue;
                await supabase
                  .from("calendar_events")
                  .update({
                    title: ev.summary ?? "(sin título)",
                    description: ev.description ?? null,
                    start_at: startISO,
                    end_at: endISO,
                    google_event_etag: ev.etag ?? null,
                  })
                  .eq("id", existing.id);
                totalUpdated++;
              } else {
                await supabase.from("calendar_events").insert({
                  household_id: member.household_id,
                  created_by: userId,
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
                totalInserted++;
              }
            }
            usersProcessed++;
          } catch (e: any) {
            console.error("gcal auto-sync failed for", userId, e?.message);
            usersSkipped++;
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            hour: getLocalHour("UTC"),
            usersProcessed,
            usersSkipped,
            totalInserted,
            totalUpdated,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
