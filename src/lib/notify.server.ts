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

export async function addMedicationToShoppingList(
  supabase: any,
  householdId: string,
  medicationName: string,
): Promise<boolean> {
  let storeId: string | null = null;
  const { data: defaultStore } = await supabase
    .from("stores")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_default", true)
    .maybeSingle();
  storeId = defaultStore?.id ?? null;
  if (!storeId) {
    const { data: created } = await supabase
      .from("stores")
      .insert({ household_id: householdId, name: "Sin tienda", is_default: true })
      .select("id")
      .single();
    storeId = created?.id ?? null;
  }
  if (!storeId) return false;

  let listId: string | null = null;
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("store_id", storeId)
    .eq("is_archived", false)
    .maybeSingle();
  if (list) listId = list.id;
  else {
    const { data: newList } = await supabase
      .from("shopping_lists")
      .insert({ household_id: householdId, store_id: storeId, name: "Sin tienda" })
      .select("id")
      .single();
    listId = newList?.id ?? null;
  }
  if (!listId) return false;

  const { data: dup } = await supabase
    .from("shopping_list_items")
    .select("id")
    .eq("shopping_list_id", listId)
    .eq("checked", false)
    .ilike("name", medicationName)
    .maybeSingle();
  if (dup) return false;

  await supabase.from("shopping_list_items").insert({
    shopping_list_id: listId,
    name: medicationName,
    quantity: 1,
    category: "Medicación",
  });
  return true;
}
