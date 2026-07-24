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
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Handle inline button callbacks (Tomada / Snooze / Omitir)
        if (update.callback_query) {
          await handleCallbackQuery(supabase, update.callback_query, TELEGRAM_API_KEY);
          return Response.json({ ok: true });
        }

        const message = update.message ?? update.edited_message;
        if (!message?.chat?.id || typeof update.update_id !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        const text = message.text ?? "";
        const chatId = String(message.chat.id);

        if (text.trim().startsWith("/start")) {
          const { data: profile } = await supabase
            .from("telegram_profiles")
            .select("user_id")
            .eq("chat_id", chatId)
            .single();

          if (!profile) {
            const token = generateToken();
            await supabase.from("telegram_pending_links").insert({ chat_id: chatId, token });

            const baseUrl = process.env.PUBLIC_APP_URL || "https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app";
            const linkUrl = `${baseUrl}/settings/notifications?telegram_token=${token}`;

            await sendTelegram(TELEGRAM_API_KEY, {
              chat_id: chatId,
              text: "👋 ¡Hola! Pulsa el botón para vincular este chat a HomeSync y recibir recordatorios de medicación.",
              reply_markup: { inline_keyboard: [[{ text: "🔗 Vincular con HomeSync", url: linkUrl }]] },
            });
          } else {
            await sendTelegram(TELEGRAM_API_KEY, {
              chat_id: chatId,
              text: "✅ Este chat ya está vinculado a HomeSync. Recibirás recordatorios aquí.",
            });
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});

async function sendTelegram(telegramApiKey: string, payload: Record<string, unknown>) {
  await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
      "X-Connection-Api-Key": telegramApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function answerCallback(telegramApiKey: string, callbackId: string, text?: string) {
  await fetch("https://connector-gateway.lovable.dev/telegram/answerCallbackQuery", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
      "X-Connection-Api-Key": telegramApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ callback_query_id: callbackId, text: text ?? "" }),
  });
}

async function editMessage(
  telegramApiKey: string,
  chatId: string | number,
  messageId: number,
  text: string,
) {
  await fetch("https://connector-gateway.lovable.dev/telegram/editMessageText", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
      "X-Connection-Api-Key": telegramApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
  });
}

async function handleCallbackQuery(
  supabase: any,
  cq: any,
  telegramApiKey: string,
) {
  const callbackId = cq.id as string;
  const data = (cq.data as string) ?? "";
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id as number | undefined;

  const [prefix, action, intakeId] = data.split(":");
  if (prefix !== "intake" || !intakeId || !chatId || !messageId) {
    await answerCallback(telegramApiKey, callbackId, "Acción no válida");
    return;
  }

  // Authorize: the Telegram user must be linked and belong to the household of the intake
  const { data: profile } = await supabase
    .from("telegram_profiles")
    .select("user_id")
    .eq("chat_id", String(chatId))
    .single();
  if (!profile?.user_id) {
    await answerCallback(telegramApiKey, callbackId, "Chat no vinculado. Envía /start.");
    return;
  }

  const { data: intake } = await supabase
    .from("medication_intakes")
    .select("id, scheduled_for, status, medication_id, medications(household_id, name, dose_amount, current_quantity, low_stock_threshold)")
    .eq("id", intakeId)
    .single();
  if (!intake) {
    await answerCallback(telegramApiKey, callbackId, "Toma no encontrada");
    return;
  }
  const med: any = (intake as any).medications;

  const { data: membership } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", med?.household_id)
    .eq("user_id", profile.user_id)
    .maybeSingle();
  if (!membership) {
    await answerCallback(telegramApiKey, callbackId, "Sin permiso");
    return;
  }

  if (action === "snooze") {
    const base = new Date((intake as any).scheduled_for);
    const now = new Date();
    const from = base > now ? base : now;
    const next = new Date(from.getTime() + 10 * 60 * 1000).toISOString();
    await supabase
      .from("medication_intakes")
      .update({ scheduled_for: next, status: "pending", last_reminder_sent_at: null, reminder_count: 0 })
      .eq("id", intakeId);
    await answerCallback(telegramApiKey, callbackId, "✅ Opción registrada: pospuesto 10 min");
    await editMessage(
      telegramApiKey,
      chatId,
      messageId,
      `⏰ Opción registrada — Pospuesto 10 minutos — ${med?.name ?? ""}`,
    );
    return;
  }

  if (action === "taken" || action === "skipped") {
    await supabase
      .from("medication_intakes")
      .update({
        status: action,
        taken_at: new Date().toISOString(),
        confirmed_by: profile.user_id,
      })
      .eq("id", intakeId);

    if (action === "taken" && med?.dose_amount) {
      const prevQty = med.current_quantity ?? 0;
      const newQty = Math.max(0, prevQty - med.dose_amount);
      await supabase.from("medications").update({ current_quantity: newQty }).eq("id", (intake as any).medication_id);

      const threshold = med.low_stock_threshold;
      if (threshold != null && newQty <= threshold && prevQty > threshold) {
        const { addMedicationToShoppingList, sendPushToUsers, sendTelegramToUsers, resolveHouseholdUserIds } =
          await import("@/lib/notify.server");
        const added = await addMedicationToShoppingList(supabase, med.household_id, med.name);
        if (added) {
          const users = await resolveHouseholdUserIds(supabase, med.household_id);
          const title = "💊 Stock bajo de medicación";
          const body = `${med.name}: quedan ${newQty} (umbral ${threshold}). Añadido a la lista de la compra.`;
          await sendPushToUsers(supabase, users, { title, body, url: "/shopping" });
          await sendTelegramToUsers(supabase, users, `${title}\n${body}`);
        }
      }
    }

    await answerCallback(
      telegramApiKey,
      callbackId,
      action === "taken" ? "✅ Opción registrada: marcada como tomada" : "✅ Opción registrada: omitida",
    );
    await editMessage(
      telegramApiKey,
      chatId,
      messageId,
      action === "taken"
        ? `✅ Opción registrada — Tomada — ${med?.name ?? ""}`
        : `⏭️ Opción registrada — Omitida — ${med?.name ?? ""}`,
    );
    return;
  }

  await answerCallback(telegramApiKey, callbackId, "Acción desconocida");
}
