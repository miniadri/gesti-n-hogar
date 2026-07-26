import webPush from "web-push";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export async function sendTelegramToUsers(
  supabase: any,
  userIds: string[],
  text: string,
  replyMarkup?: unknown,
) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || userIds.length === 0) return;
  const { data: profiles } = await supabase
    .from("telegram_profiles")
    .select("chat_id")
    .in("user_id", userIds);
  for (const p of profiles ?? []) {
    if (!p?.chat_id) continue;
    const body: Record<string, unknown> = { chat_id: p.chat_id, text, parse_mode: "HTML" };
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
      if (!res.ok) console.error("Telegram send failed", await res.text());
    } catch (err) {
      console.error("Telegram send error", err);
    }
  }
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
  webPush.setVapidDetails("mailto:admin@homesync.app", pub, priv);
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
  const { data } = await supabase
    .from("household_members")
    .select("user_id, is_child, is_emergency_contact")
    .eq("household_id", householdId)
    .eq("is_child", false)
    .not("user_id", "is", null);
  const rows = (data ?? []) as any[];
  const flagged = rows.filter((r) => r.is_emergency_contact).map((r) => r.user_id);
  const all = rows.map((r) => r.user_id);
  return (flagged.length ? flagged : all).filter(Boolean);
}

export async function sendTelegramToChatIds(
  chatIds: string[],
  text: string,
  replyMarkup?: unknown,
) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;
  for (const chat_id of chatIds) {
    if (!chat_id) continue;
    const body: Record<string, unknown> = { chat_id, text, parse_mode: "HTML" };
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
      if (!res.ok) console.error("Telegram send failed", await res.text());
    } catch (err) {
      console.error("Telegram send error", err);
    }
  }
}

export async function sendSosAlert(
  supabase: any,
  householdId: string,
  info: { name: string; userId: string; latitude: number | null; longitude: number | null; note: string | null },
) {
  const userIds = (await resolveHouseholdEscalationUserIds(supabase, householdId)).filter(
    (id) => id !== info.userId,
  );
  const mapsLink =
    info.latitude != null && info.longitude != null
      ? `https://maps.google.com/?q=${info.latitude},${info.longitude}`
      : null;
  const title = "🚨 SOS activado";
  const body = `${info.name} ha pulsado el botón SOS.${info.note ? `\nNota: ${info.note}` : ""}${
    mapsLink ? `\nUbicación: ${mapsLink}` : ""
  }`;
  await sendPushToUsers(supabase, userIds, { title, body, url: "/medications" });
  await sendTelegramToUsers(supabase, userIds, `<b>${title}</b>\n${body}`);
  const { data: externals } = await supabase
    .from("emergency_contacts")
    .select("telegram_chat_id")
    .eq("household_id", householdId)
    .not("telegram_chat_id", "is", null);
  const chatIds = (externals ?? []).map((e: any) => e.telegram_chat_id).filter(Boolean);
  await sendTelegramToChatIds(chatIds, `<b>${title}</b>\n${body}`);
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
