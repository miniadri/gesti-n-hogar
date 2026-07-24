import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
import { sendTelegramToUsers } from "@/lib/notify.server";

// Runs every few minutes via pg_cron. Sends push notifications for:
// - pending tasks with due_date within the next 15 minutes (not yet notified)
// - calendar events starting within the next 15 minutes (not yet notified)
export const Route = createFileRoute("/api/public/hooks/push-scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        webPush.setVapidDetails(
          "mailto:admin@homesync.app",
          process.env.VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!,
        );

        const now = new Date();
        const windowEnd = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
        const windowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

        let sent = 0;

        // --- Tasks ---
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, household_id, assigned_to, due_date")
          .eq("status", "pending")
          .is("notified_at", null)
          .not("due_date", "is", null)
          .gte("due_date", windowStart)
          .lte("due_date", windowEnd);

        for (const task of tasks ?? []) {
          const userIds = await resolveUserIds(supabase, task.household_id, task.assigned_to);
          const ok = await sendTo(supabase, userIds, {
            title: "Tarea próxima",
            body: task.title,
            url: "/tasks",
          });
          if (ok) sent++;
          await supabase.from("tasks").update({ notified_at: new Date().toISOString() }).eq("id", task.id);
        }

        // --- Calendar events ---
        const { data: events } = await supabase
          .from("calendar_events")
          .select("id, title, household_id, start_at, attendees")
          .is("notified_at", null)
          .gte("start_at", windowStart)
          .lte("start_at", windowEnd);

        for (const ev of events ?? []) {
          const userIds = await resolveUserIds(supabase, ev.household_id, null);
          const ok = await sendTo(supabase, userIds, {
            title: "Evento próximo",
            body: ev.title,
            url: "/calendar",
          });
          if (ok) sent++;
          await supabase
            .from("calendar_events")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", ev.id);
        }

        return new Response(JSON.stringify({ ok: true, sent }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

async function resolveUserIds(
  supabase: any,
  householdId: string,
  memberId: string | null,
): Promise<string[]> {
  if (memberId) {
    const { data } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("id", memberId)
      .maybeSingle();
    if (data?.user_id) return [data.user_id as string];
  }
  const { data } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .not("user_id", "is", null);
  return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
}

async function sendTo(
  supabase: any,
  userIds: string[],
  payload: { title: string; body: string; url: string },
): Promise<boolean> {
  if (userIds.length === 0) return false;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  let any = false;
  for (const sub of (subs ?? []) as any[]) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      any = true;
    } catch (err: any) {
      console.error("push failed", err?.statusCode, err?.body);
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
  return any;
}
