import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { dispatchSosNotifications } from "@/lib/notify.server";

const REMINDER_INTERVAL_MS = 2 * 60 * 1000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // stop retrying after 6h

// Runs every ~1-2 minutes via pg_cron. Re-sends SOS alerts only while nobody
// has acknowledged reception yet. Once one recipient confirms, reminders stop
// for the event, but the remaining recipients can still acknowledge from the
// original message/banner.
export const Route = createFileRoute("/api/public/hooks/sos-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_BEARER ?? "";
        if (!expected || bearer !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const now = Date.now();
        const { data: events, error } = await supabase
          .from("sos_events")
          .select(
            "id, household_id, triggered_by_name, latitude, longitude, location_accuracy, note, created_at, acknowledged_at, last_reminder_sent_at, reminder_count, is_test",
          )
          .is("acknowledged_at", null)
          .eq("is_test", false)
          .gte("created_at", new Date(now - MAX_AGE_MS).toISOString())
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) {
          console.error("SOS reminder query failed", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        let resent = 0;
        for (const ev of (events ?? []) as any[]) {
          const [{ count: acknowledged }, { count: pending }] = await Promise.all([
            supabase
              .from("sos_acknowledgements")
              .select("id", { count: "exact", head: true })
              .eq("sos_event_id", ev.id)
              .not("acknowledged_at", "is", null),
            supabase
              .from("sos_acknowledgements")
              .select("id", { count: "exact", head: true })
              .eq("sos_event_id", ev.id)
              .is("acknowledged_at", null),
          ]);

          if ((acknowledged ?? 0) > 0 || !pending) {
            await supabase
              .from("sos_events")
              .update({ acknowledged_at: new Date().toISOString() })
              .eq("id", ev.id)
              .is("acknowledged_at", null);
            continue;
          }

          const last = new Date(ev.last_reminder_sent_at ?? ev.created_at).getTime();
          if (now - last < REMINDER_INTERVAL_MS) continue;

          const reminderNumber = (ev.reminder_count ?? 0) + 1;
          try {
            await dispatchSosNotifications(supabase, ev, reminderNumber);
            resent++;
          } catch (err) {
            console.error("SOS reminder dispatch failed", err);
          }

          await supabase
            .from("sos_events")
            .update({
              last_reminder_sent_at: new Date().toISOString(),
              reminder_count: reminderNumber,
            })
            .eq("id", ev.id);
        }

        return new Response(JSON.stringify({ ok: true, resent }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
