import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import webPush from "web-push";

const SubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY };
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
        url: z.string().regex(/^\/(?!\/)[^\r\n]*$/).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: recipients } = await context.supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .in("user_id", data.userIds);
    const allowedUserIds = (recipients ?? []).map((row: { user_id: string | null }) => row.user_id).filter(Boolean) as string[];
    webPush.setVapidDetails(
      "mailto:admin@homesync.app",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );

    const { data: subs, error } = await context.supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", allowedUserIds);
    if (error) throw error;

    const results = [];
    for (const sub of subs ?? []) {
      try {
        await webPush.sendNotification(
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
