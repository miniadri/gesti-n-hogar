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

type SosEventInfo = {
  id: string | null;
  household_id: string;
  triggered_by?: string | null;
  triggered_by_name?: string | null;
  name?: string;
  userId?: string;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  note: string | null;
  created_at?: string;
  reminder_count?: number | null;
  sos_type?: string | null;
  battery_level?: number | null;
  battery_charging?: boolean | null;
  connection_type?: string | null;
  location_source?: string | null;
  last_known_location_used?: boolean | null;
  is_test?: boolean | null;
  medical_summary?: string | null;
};

function sosTypeLabel(type?: string | null) {
  switch (type) {
    case "medical":
      return "Médico";
    case "fall":
      return "Caída";
    case "unsafe":
      return "Inseguridad";
    case "other":
      return "Otro";
    case "urgency":
    default:
      return "Urgencia";
  }
}

export function buildSosMessage(event: SosEventInfo, reminderNumber: number): { title: string; body: string } {
  const who = event.triggered_by_name || event.name || "Un miembro";
  const isTest = Boolean(event.is_test);
  const mapsLink =
    event.latitude != null && event.longitude != null
      ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
      : null;
  const directionsLink =
    event.latitude != null && event.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`
      : null;
  const title = isTest
    ? "SIMULACRO SOS de HomeSync"
    : reminderNumber > 0
      ? `🚨 SOS SIN CONFIRMAR (aviso ${reminderNumber + 1})`
      : "🚨 SOS activado";
  const when = new Date(event.created_at ?? Date.now()).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
  });
  const body = [
    isTest
      ? `${who} ha enviado un simulacro SOS. No es una emergencia real.`
      : `${who} ha pulsado el botón SOS.`,
    `Tipo: ${sosTypeLabel(event.sos_type)}`,
    event.note ? `Nota: ${event.note}` : null,
    mapsLink ? `Ubicación: ${mapsLink}` : "Ubicación: no disponible",
    event.last_known_location_used ? "Ubicación: última ubicación conocida (no ubicación actual)." : null,
    directionsLink ? `Cómo llegar: ${directionsLink}` : null,
    event.location_accuracy != null
      ? `Precisión aproximada: ${Math.round(event.location_accuracy)} m`
      : null,
    event.battery_level != null
      ? `Batería: ${Math.round(event.battery_level)}%${event.battery_charging ? " (cargando)" : ""}`
      : null,
    event.connection_type ? `Conexión: ${event.connection_type}` : null,
    event.medical_summary ? `Resumen médico:\n${event.medical_summary}` : null,
    `Hora: ${when}`,
    isTest
      ? "Confirma si quieres probar el acuse de recibo. Este simulacro no genera recordatorios automáticos."
      : "⚠️ Confirma que has recibido el aviso. Si nadie confirma, se reenviará cada 2 minutos.",
  ]
    .filter(Boolean)
    .join("\n");
  return { title, body };
}

/**
 * Sends the SOS alert to every recipient that has NOT acknowledged yet.
 * Returns delivery counters.
 */
export async function dispatchSosNotifications(
  supabase: any,
  event: SosEventInfo,
  reminderNumber = 0,
): Promise<SosNotificationStatus> {
  const medicalSummary =
    event.medical_summary ??
    (event.triggered_by
      ? await getSosMedicalSummary(supabase, event.household_id, event.triggered_by)
      : null);
  const { title, body } = buildSosMessage({ ...event, medical_summary: medicalSummary }, reminderNumber);
  const ackUrl = "/settings/emergency";

  let userIds: string[] = [];
  let chatIds: string[] = [];

  if (event.id) {
    const { data: pending } = await supabase
      .from("sos_acknowledgements")
      .select("user_id, telegram_chat_id")
      .eq("sos_event_id", event.id)
      .is("acknowledged_at", null);
    for (const row of (pending ?? []) as any[]) {
      if (row.user_id) userIds.push(row.user_id);
      else if (row.telegram_chat_id) chatIds.push(row.telegram_chat_id);
    }
  } else {
    // Fallback (event could not be persisted): notify escalation contacts directly.
    userIds = await resolveHouseholdEscalationUserIds(supabase, event.household_id);
    const { data: externals } = await supabase
      .from("emergency_contacts")
      .select("telegram_chat_id")
      .eq("household_id", event.household_id)
      .not("telegram_chat_id", "is", null);
    chatIds = (externals ?? []).map((e: any) => e.telegram_chat_id).filter(Boolean);
  }

  if (userIds.length === 0 && chatIds.length === 0) {
    return { pushSent: false, telegramSent: 0, ok: false, reason: "no_pending_recipients" };
  }

  const replyMarkup = event.id
    ? {
        inline_keyboard: [[{ text: "✅ Confirmar recepción", callback_data: `sos:ack:${event.id}` }]],
      }
    : undefined;

  let pushSent = false;
  try {
    pushSent = await sendPushToUsers(supabase, userIds, { title, body, url: ackUrl });
  } catch (err) {
    console.error("SOS push send failed", err);
  }

  let telegramSent = 0;
  try {
    telegramSent += await sendTelegramToUsers(
      supabase,
      userIds,
      `${title}\n${body}`,
      replyMarkup,
      null,
    );
  } catch (err) {
    console.error("SOS Telegram profile send failed", err);
  }
  try {
    telegramSent += await sendTelegramToChatIds(chatIds, `${title}\n${body}`, replyMarkup, null);
  } catch (err) {
    console.error("SOS Telegram external send failed", err);
  }

  const ok = pushSent || telegramSent > 0;
  return { pushSent, telegramSent, ok, reason: ok ? null : "no_recipients_or_delivery_failed" };
}

export async function dispatchSosCancellation(
  supabase: any,
  event: {
    id: string;
    household_id: string;
    triggered_by_name?: string | null;
    created_at?: string | null;
    note?: string | null;
  },
): Promise<SosNotificationStatus> {
  const { data: pending } = await supabase
    .from("sos_acknowledgements")
    .select("user_id, telegram_chat_id")
    .eq("sos_event_id", event.id)
    .is("acknowledged_at", null);

  const userIds: string[] = [];
  const chatIds: string[] = [];
  for (const row of (pending ?? []) as any[]) {
    if (row.user_id) userIds.push(row.user_id);
    else if (row.telegram_chat_id) chatIds.push(row.telegram_chat_id);
  }

  if (userIds.length === 0 && chatIds.length === 0) {
    return { pushSent: false, telegramSent: 0, ok: false, reason: "no_pending_recipients" };
  }

  const who = event.triggered_by_name || "Un miembro";
  const title = "SOS cancelado";
  const body = [
    `${who} ha cancelado el aviso SOS.`,
    event.note ? `Motivo: ${event.note}` : null,
    "Ya no se enviarán recordatorios automáticos de este aviso.",
  ].filter(Boolean).join("\n");

  let pushSent = false;
  try {
    pushSent = await sendPushToUsers(supabase, userIds, { title, body, url: "/settings/emergency" });
  } catch (err) {
    console.error("SOS cancellation push send failed", err);
  }

  let telegramSent = 0;
  try {
    telegramSent += await sendTelegramToUsers(supabase, userIds, `${title}\n${body}`, undefined, null);
    telegramSent += await sendTelegramToChatIds(chatIds, `${title}\n${body}`, undefined, null);
  } catch (err) {
    console.error("SOS cancellation Telegram send failed", err);
  }

  const ok = pushSent || telegramSent > 0;
  return { pushSent, telegramSent, ok, reason: ok ? null : "delivery_failed" };
}

export async function sendSosAlert(
  supabase: any,
  householdId: string,
  info: {
    id?: string | null;
    name: string;
    userId: string;
    latitude: number | null;
    longitude: number | null;
    location_accuracy: number | null;
    note: string | null;
    created_at?: string;
    is_test?: boolean | null;
    sos_type?: string | null;
    battery_level?: number | null;
    battery_charging?: boolean | null;
    connection_type?: string | null;
    location_source?: string | null;
    last_known_location_used?: boolean | null;
  },
): Promise<SosNotificationStatus> {
  const eventId = info.id ?? null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const serviceSupabase = supabaseAdmin;

  if (eventId) {
    // Register the recipients that must acknowledge this SOS.
    // This is a trusted server-side step after triggerSos has authenticated the
    // caller and resolved their household. It needs service role because normal
    // users cannot insert acknowledgements for other household members.
    const { data: externals } = await serviceSupabase
      .from("emergency_contacts")
      .select("name, telegram_chat_id")
      .eq("household_id", householdId)
      .not("telegram_chat_id", "is", null);

    const adults = await resolveHouseholdEscalationUserIds(serviceSupabase, householdId);
    const adultUserIds = Array.from(new Set(adults.filter(Boolean)));
    const externalChatIds = ((externals ?? []) as any[])
      .map((e) => e.telegram_chat_id)
      .filter(Boolean);
    let recipientUserIds = adultUserIds.filter((id) => info.is_test || id !== info.userId);

    if (!info.is_test && recipientUserIds.length === 0 && externalChatIds.length === 0 && info.userId) {
      // Prefer notifying someone else for a real emergency. If the household
      // only has the triggering user configured, still send the alert to them
      // so the SOS delivery path is visible and testable instead of silently
      // reporting no notification delivery.
      recipientUserIds = [info.userId];
    }

    const { data: members } = await serviceSupabase
      .from("household_members")
      .select("user_id, display_name")
      .eq("household_id", householdId)
      .in("user_id", recipientUserIds.length ? recipientUserIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameByUser = new Map(
      ((members ?? []) as any[]).map((m) => [m.user_id, m.display_name as string]),
    );

    const rows = [
      ...recipientUserIds.map((uid) => ({
        sos_event_id: eventId,
        household_id: householdId,
        user_id: uid,
        telegram_chat_id: null,
        recipient_name: nameByUser.get(uid) ?? "Miembro",
      })),
      ...((externals ?? []) as any[])
        .filter((e) => e.telegram_chat_id)
        .map((e) => ({
          sos_event_id: eventId,
          household_id: householdId,
          user_id: null,
          telegram_chat_id: String(e.telegram_chat_id),
          recipient_name: e.name ?? "Contacto externo",
        })),
    ];

    if (rows.length > 0) {
      const { error } = await serviceSupabase.from("sos_acknowledgements").insert(rows);
      if (error) console.error("SOS ack rows insert failed", error);
    } else {
      // Nobody to acknowledge -> mark as acknowledged so no reminders are queued.
      await serviceSupabase
        .from("sos_events")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("id", eventId);
    }
  }

  const status = await dispatchSosNotifications(
    serviceSupabase,
    {
      id: eventId,
      household_id: householdId,
      triggered_by: info.userId,
      triggered_by_name: info.name,
      latitude: info.latitude,
      longitude: info.longitude,
      location_accuracy: info.location_accuracy,
      note: info.note,
      created_at: info.created_at,
      sos_type: info.sos_type ?? "urgency",
      battery_level: info.battery_level ?? null,
      battery_charging: info.battery_charging ?? null,
      connection_type: info.connection_type ?? null,
      location_source: info.location_source ?? null,
      last_known_location_used: info.last_known_location_used ?? false,
      is_test: info.is_test ?? false,
    },
    0,
  );

  if (eventId) {
    const patch: { last_reminder_sent_at: string; acknowledged_at?: string } = {
      last_reminder_sent_at: new Date().toISOString(),
    };
    if (info.is_test) {
      // Simulations send one visible test alert but do not enter the automatic
      // reminder loop.
      patch.acknowledged_at = new Date().toISOString();
    }
    await serviceSupabase.from("sos_events").update(patch).eq("id", eventId);
  }

  return status;
}

async function getSosMedicalSummary(
  supabase: any,
  householdId: string,
  userId: string,
): Promise<string | null> {
  const { data: member } = await supabase
    .from("household_members")
    .select("id, display_name")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member?.id) return null;

  const [{ data: profile }, { data: records }] = await Promise.all([
    supabase
      .from("medical_profiles")
      .select("blood_type, emergency_notes, show_in_sos")
      .eq("household_id", householdId)
      .eq("member_id", member.id)
      .maybeSingle(),
    supabase
      .from("medical_records")
      .select("record_type, title, severity, notes, show_in_sos")
      .eq("household_id", householdId)
      .eq("member_id", member.id)
      .in("record_type", ["condition", "allergy"])
      .or("show_in_sos.eq.true,severity.in.(high,critical)")
      .order("record_type")
      .limit(8),
  ]);

  const lines: string[] = [];
  if (profile?.show_in_sos && profile.blood_type) lines.push(`Grupo sanguíneo: ${profile.blood_type}`);
  if (profile?.show_in_sos && profile.emergency_notes) lines.push(`Notas: ${profile.emergency_notes}`);
  for (const record of records ?? []) {
    const kind = record.record_type === "allergy" ? "Alergia" : "Condición";
    const severity = record.severity ? ` (${record.severity})` : "";
    lines.push(`${kind}: ${record.title}${severity}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
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
