const LOVABLE_TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

type TelegramPayload = Record<string, unknown>;

function telegramApiUrl(method: string, telegramApiKey: string) {
  return `https://api.telegram.org/bot${telegramApiKey}/${method}`;
}

async function sendViaTelegramBotApi(method: string, telegramApiKey: string, payload: TelegramPayload) {
  return fetch(telegramApiUrl(method, telegramApiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sendViaLovableGateway(method: string, telegramApiKey: string, payload: TelegramPayload) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return null;
  return fetch(`${LOVABLE_TELEGRAM_GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function callTelegram(method: string, payload: TelegramPayload) {
  const telegramApiKey = process.env.TELEGRAM_API_KEY;
  if (!telegramApiKey) {
    console.warn("Telegram not configured: missing TELEGRAM_API_KEY");
    return { ok: false, status: 0, text: "missing_telegram_api_key" };
  }

  const gatewayResponse = await sendViaLovableGateway(method, telegramApiKey, payload);
  const response = gatewayResponse ?? (await sendViaTelegramBotApi(method, telegramApiKey, payload));
  const text = await response.text();
  if (!response.ok) {
    console.error(`Telegram ${method} failed`, response.status, text);
  }
  return { ok: response.ok, status: response.status, text };
}

export async function sendTelegramMessage(payload: TelegramPayload) {
  return callTelegram("sendMessage", payload);
}

export async function answerTelegramCallback(payload: TelegramPayload) {
  return callTelegram("answerCallbackQuery", payload);
}

export async function editTelegramMessage(payload: TelegramPayload) {
  return callTelegram("editMessageText", payload);
}