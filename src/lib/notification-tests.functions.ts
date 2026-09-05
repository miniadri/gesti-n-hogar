import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendTelegramToUsers } = await import("@/lib/notify.server");
    const sent = await sendTelegramToUsers(
      context.supabase,
      [context.userId],
      [
        "Prueba de Telegram de HomeSync",
        "Si recibes este mensaje, tu chat está vinculado correctamente.",
        `Hora: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
      ].join("\n"),
      undefined,
      null,
    );

    return {
      ok: sent > 0,
      sent,
      reason: sent > 0 ? null : "telegram_not_linked_or_delivery_failed",
    };
  });

export const sendPushTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPushToUsersDetailed } = await import("@/lib/notify.server");
    const result = await sendPushToUsersDetailed(context.supabase, [context.userId], {
      title: "Prueba de HomeSync",
      body: "Las notificaciones web están funcionando en este dispositivo.",
      url: "/settings/notifications",
    });

    return {
      ok: result.ok,
      sent: result.sent,
      attempted: result.attempted,
      subscriptions: result.subscriptions,
      reason: result.reason,
      details: result.details,
    };
  });
