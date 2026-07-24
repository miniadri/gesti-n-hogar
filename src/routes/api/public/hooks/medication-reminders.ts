import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

export const Route = createFileRoute("/api/public/hooks/medication-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const authHeader = request.headers.get("authorization") ?? "";
        const bearer = authHeader.replace(/^Bearer\s+/i, "");
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        const cronSecret = process.env.CRON_SECRET ?? "";
        const ok =
          (publishable && apikey === publishable) ||
          (cronSecret && bearer === cronSecret);
        if (!ok) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const now = new Date().toISOString();
        const { data: intakes, error } = await supabase
          .from("medication_intakes")
          .select("*, medications(*, household_members(display_name, household_id))")
          .eq("status", "pending")
          .lte("scheduled_for", now)
          .order("scheduled_for", { ascending: true });
        if (error) {
          console.error("Error fetching due intakes", error);
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }

        const results = [];
        for (const intake of intakes ?? []) {
          const med = intake.medications;
          if (!med?.reminders_enabled) continue;

          const lastSent = intake.last_reminder_sent_at ? new Date(intake.last_reminder_sent_at).getTime() : 0;
          const minutesSinceLast = (Date.now() - lastSent) / 60000;
          const reminderInterval = 5;

          if (intake.reminder_count > 0 && minutesSinceLast < reminderInterval) continue;

          const memberName = med?.household_members?.display_name || "familiar";
          const title = `💊 Toca medicación: ${med?.name}`;
          const body = `${memberName} debe tomar ${med?.dose_amount} ${med?.unit} de ${med?.name}.`;
          const householdId = med?.household_members?.household_id;
          const baseUrl = process.env.PUBLIC_APP_URL || "https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app";
          const openUrl = `${baseUrl}/medications`;

          const { data: members } = await supabase
            .from("household_members")
            .select("user_id")
            .eq("household_id", householdId);
          const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);

          await sendPushToUsers(supabase, userIds, title, body, "/medications");

          const { data: profiles } = await supabase
            .from("telegram_profiles")
            .select("chat_id")
            .in("user_id", userIds);

          for (const profile of profiles ?? []) {
            if (profile.chat_id) {
              await sendTelegramMessage(
                profile.chat_id,
                `${title}\n${body}`,
                {
                  inline_keyboard: [
                    [
                      { text: "✅ Tomada", callback_data: `intake:taken:${intake.id}` },
                      { text: "⏰ +10 min", callback_data: `intake:snooze:${intake.id}` },
                      { text: "⏭️ Omitir", callback_data: `intake:skipped:${intake.id}` },
                    ],
                    [{ text: "📱 Abrir HomeSync", url: openUrl }],
                  ],
                },
              );
            }
          }

          await supabase
            .from("medication_intakes")
            .update({
              reminder_count: (intake.reminder_count ?? 0) + 1,
              last_reminder_sent_at: new Date().toISOString(),
            })
            .eq("id", intake.id);

          results.push(intake.id);
        }

        return Response.json({ success: true, reminded: results.length });
      },
    },
  },
});

async function sendPushToUsers(supabase: any, userIds: string[], title: string, body: string, url: string) {
  webPush.setVapidDetails(
    "mailto:admin@homesync.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const { data: subs } = await supabase.from("push_subscriptions").select("*").in("user_id", userIds);
  for (const sub of subs ?? []) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url }),
      );
    } catch (err) {
      console.error("Push failed", err);
    }
  }
}

async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: unknown) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;

  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error("Telegram send failed", await res.text());
  } catch (err) {
    console.error("Telegram send error", err);
  }
}
