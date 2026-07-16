import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SubscriptionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const sendPushNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userIds: z.array(z.string().uuid()),
        title: z.string(),
        body: z.string(),
        url: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const webPush = await import("web-push");
    webPush.default.setVapidDetails(
      "mailto:admin@homesync.app",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );

    const { data: subs, error } = await context.supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", data.userIds);
    if (error) throw error;

    const results = [];
    for (const sub of subs ?? []) {
      try {
        await webPush.default.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: data.title, body: data.body, url: data.url || "/dashboard" }),
        );
        results.push({ ok: true });
      } catch (err) {
        console.error("Push failed", err);
        results.push({ ok: false });
      }
    }
    return { sent: results.length };
  });
