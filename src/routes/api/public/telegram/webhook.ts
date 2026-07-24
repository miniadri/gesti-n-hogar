import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual, randomBytes } from "crypto";

function deriveTelegramWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${telegramApiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function generateToken() {
  return randomBytes(16).toString("hex");
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
        if (!TELEGRAM_API_KEY) {
          return new Response("Telegram not configured", { status: 500 });
        }

        const expectedSecret = deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
        const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actualSecret, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();
        const message = update.message ?? update.edited_message;
        if (!message?.chat?.id || typeof update.update_id !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        const text = message.text ?? "";
        const chatId = String(message.chat.id);

        if (text.trim().startsWith("/start")) {
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );

          const { data: profile } = await supabase
            .from("telegram_profiles")
            .select("user_id")
            .eq("chat_id", chatId)
            .single();

          if (!profile) {
            const token = generateToken();
            await supabase.from("telegram_pending_links").insert({ chat_id: chatId, token });

            const baseUrl = process.env.PUBLIC_APP_URL || "https://id-preview--8f67b433-144a-485c-9cd2-9ae50733f9b1.lovable.app";
            const linkUrl = `${baseUrl}/settings/notifications?telegram_token=${token}`;

            await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
                "X-Connection-Api-Key": TELEGRAM_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                chat_id: chatId,
                text: "👋 ¡Hola! Pulsa el botón para vincular este chat a HomeSync y recibir recordatorios de medicación.",
                reply_markup: {
                  inline_keyboard: [[{ text: "🔗 Vincular con HomeSync", url: linkUrl }]],
                },
              }),
            });
          } else {
            await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
                "X-Connection-Api-Key": TELEGRAM_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                chat_id: chatId,
                text: "✅ Este chat ya está vinculado a HomeSync. Recibirás recordatorios aquí.",
              }),
            });
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
