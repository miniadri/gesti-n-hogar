import webPush from "web-push";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

type SosNotificationStatus = {
  pushSent: boolean;
  telegramSent: number;
  ok: boolean;
  reason: string | null;
};

export async function sendTelegramToUsers(
  supabase: any,
  userIds: string[],
  text: string,
  replyMarkup?: unknown,
  parseMode: "HTML" | null = "HTML",
): Promise<number> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || uniqueUserIds.length === 0) return 0;
  const { data: profiles } = await supabase
    .from("telegram_profiles")
    .select("chat_id")
    .in("user_id", uniqueUserIds);
  let sent = 0;
  for (const p of profiles ?? []) {
    if (!p?.chat_id) continue;
    const body: Record<string, unknown> = { chat_id: p.chat_id, text };
    if (parseMode) body.parse_mode = parseMode;
    if (replyMarkup) body.reply_markup = replyMarkup;
    try {
      const res = await fetch(`${GATEWAY}/sendMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        sent += 1;
      } else {
        console.error("Telegram send failed", await res.text());
      }
    } catch (err) {
      console.error("Telegram send error", err);
    }
  }
  return sent;
}

export async function sendPushToUsers(
  supabase: any,
  userIds: string[],
  payload: { title: string; body: string; url: string },
): Promise<boolean> {
  if (userIds.length === 0) return false;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    webPush.setVapidDetails("mailto:admin@homesync.app", pub, priv);
  } catch (err) {
    console.error("push configuration failed", err);
    return false;
  }
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

export async function resolveHouseholdUserIds(
  supabase: any,
  householdId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .not("user_id", "is", null);
  return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
}

/**
 * Adults in the household (excludes child profiles). If `emergencyOnly` is
 * true, further restricts to members flagged as emergency contacts; when no
 * member is flagged, falls back to all adults so escalations still reach someone.
 */
export async function resolveHouseholdEscalationUserIds(
  supabase: any,
  householdId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("user_id, is_child, is_emergency_contact")
    .eq("household_id", householdId)
    .eq("is_child", false)
    .not("user_id", "is", null);
  if (error) {
    console.error("Emergency member lookup failed, falling back to all household users", error);
    return resolveHouseholdUserIds(supabase, householdId);
  }
  const rows = (data ?? []) as any[];
  const flagged = rows.filter((r) => r.is_emergency_contact).map((r) => r.user_id);
  const all = rows.map((r) => r.user_id);
  return (flagged.length ? flagged : all).filter(Boolean);
}

export async function sendTelegramToChatIds(
  chatIds: string[],
  text: string,
  replyMarkup?: unknown,
  parseMode: "HTML" | null = "HTML",
): Promise<number> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  const uniqueChatIds = Array.from(new Set(chatIds.filter(Boolean)));
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || uniqueChatIds.length === 0) return 0;
  let sent = 0;
  for (const chat_id of uniqueChatIds) {
    if (!chat_id) continue;
    const body: Record<string, unknown> = { chat_id, text };
    if (parseMode) body.parse_mode = parseMode;
    if (replyMarkup) body.reply_markup = replyMarkup;
    try {
      const res = await fetch(`${GATEWAY}/sendMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        sent += 1;
      } else {
        console.error("Telegram send failed", await res.text());
      }
    } catch (err) {
      console.error("Telegram send error", err);
    }
  }
  return sent;
}

export async function sendSosAlert(
  supabase: any,
  householdId: string,
  info: {
    name: string;
    userId: string;
    latitude: number | null;
    longitude: number | null;
    location_accuracy: number | null;
    note: string | null;
  },
): Promise<SosNotificationStatus> {
  const userIds = Array.from(
    new Set([info.userId, ...(await resolveHouseholdEscalationUserIds(supabase, householdId))]),
  ).filter(Boolean);
  const mapsLink =
    info.latitude != null && info.longitude != null
      ? `https://maps.google.com/?q=${info.latitude},${info.longitude}`
      : null;
  const directionsLink =
    info.latitude != null && info.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${info.latitude},${info.longitude}`
      : null;
  const title = "🚨 SOS activado";
  const details = [
    `${info.name} ha pulsado el botón SOS.`,
    info.note ? `Nota: ${info.note}` : null,
    mapsLink ? `Ubicación: ${mapsLink}` : "Ubicación: no disponible",
    directionsLink ? `Cómo llegar: ${directionsLink}` : null,
    info.location_accuracy != null
      ? `Precisión aproximada: ${Math.round(info.location_accuracy)} m`
      : null,
    `Hora: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
  ].filter(Boolean) as string[];
  const body = details.join("\n");
  const telegramBody = [
    title,
    `${info.name} ha pulsado el botón SOS.`,
    info.note ? `Nota: ${info.note}` : null,
    mapsLink ? `Ubicación: ${mapsLink}` : "Ubicación: no disponible",
    directionsLink ? `Cómo llegar: ${directionsLink}` : null,
    info.location_accuracy != null
      ? `Precisión aproximada: ${Math.round(info.location_accuracy)} m`
      : null,
    `Hora: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
  ]
    .filter(Boolean)
    .join("\n");
  let pushSent = false;
  try {
    pushSent = await sendPushToUsers(supabase, userIds, { title, body, url: "/dashboard" });
  } catch (err) {
    console.error("SOS push send failed", err);
  }

  let telegramProfileCount = 0;
  try {
    telegramProfileCount = await sendTelegramToUsers(supabase, userIds, telegramBody, undefined, null);
  } catch (err) {
    console.error("SOS Telegram profile send failed", err);
  }

  const { data: externals, error: externalError } = await supabase
    .from("emergency_contacts")
    .select("telegram_chat_id")
    .eq("household_id", householdId)
    .not("telegram_chat_id", "is", null);
  if (externalError) {
    console.error("External emergency contact lookup failed", externalError);
    return {
      pushSent,
      telegramSent: telegramProfileCount,
      ok: pushSent || telegramProfileCount > 0,
      reason: pushSent || telegramProfileCount > 0 ? null : "external_contacts_lookup_failed",
    };
  }
  const chatIds = (externals ?? []).map((e: any) => e.telegram_chat_id).filter(Boolean);
  let telegramExternalCount = 0;
  try {
    telegramExternalCount = await sendTelegramToChatIds(chatIds, telegramBody, undefined, null);
  } catch (err) {
    console.error("SOS Telegram external send failed", err);
  }
  const telegramSent = telegramProfileCount + telegramExternalCount;
  const ok = pushSent || telegramSent > 0;
  return {
    pushSent,
    telegramSent,
    ok,
    reason: ok ? null : "no_recipients_or_delivery_failed",
  };
}

export async function addMedicationToShoppingList(
  supabase: any,
  householdId: string,
  medicationName: string,
): Promise<boolean> {
  // Medications go to the "Farmacia" section, backed by the `medicines` table
  // with needs_purchase=true (rendered by PharmacySection on the shopping page).
  const { data: existing } = await supabase
    .from("medicines")
    .select("id, needs_purchase")
    .eq("household_id", householdId)
    .ilike("name", medicationName)
    .maybeSingle();

  if (existing) {
    if (existing.needs_purchase) return false;
    const { error } = await supabase
      .from("medicines")
      .update({ needs_purchase: true })
      .eq("id", existing.id);
    return !error;
  }

  const { error } = await supabase
    .from("medicines")
    .insert({ household_id: householdId, name: medicationName, needs_purchase: true });
  return !error;
}
