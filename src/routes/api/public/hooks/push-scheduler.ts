import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
import { sendTelegramToUsers } from "@/lib/notify.server";

// Runs every few minutes via pg_cron. Sends push notifications for:
// - pending tasks with due_date within the next 15 minutes (not yet notified)
// - calendar events starting within the next 15 minutes (not yet notified)
export const Route = createFileRoute("/api/public/hooks/push-scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const bearer = authHeader.replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_BEARER ?? "";
        if (!expected || bearer !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        webPush.setVapidDetails(
          "mailto:admin@homesync.app",
          process.env.VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!,
        );

        const now = new Date();
        const windowEnd = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
        const windowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

        let sent = 0;

        // --- Tasks ---
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, household_id, assigned_to, due_date")
          .eq("status", "pending")
          .is("notified_at", null)
          .not("due_date", "is", null)
          .gte("due_date", windowStart)
          .lte("due_date", windowEnd);

        for (const task of tasks ?? []) {
          const userIds = await resolveUserIds(supabase, task.household_id, task.assigned_to);
          const ok = await sendTo(supabase, userIds, {
            title: "Tarea próxima",
            body: task.title,
            url: "/tasks",
          });
          if (ok) sent++;
          await supabase.from("tasks").update({ notified_at: new Date().toISOString() }).eq("id", task.id);
        }

        // --- Calendar events ---
        const { data: events } = await supabase
          .from("calendar_events")
          .select("id, title, household_id, start_at, attendees")
          .is("notified_at", null)
          .gte("start_at", windowStart)
          .lte("start_at", windowEnd);

        for (const ev of events ?? []) {
          const userIds = await resolveUserIds(supabase, ev.household_id, null);
          const ok = await sendTo(supabase, userIds, {
            title: "Evento próximo",
            body: ev.title,
            url: "/calendar",
          });
          if (ok) sent++;
          await supabase
            .from("calendar_events")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", ev.id);
        }

        // --- Inventory expiry (within 3 days or already expired) ---
        const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const todayStr = now.toISOString().slice(0, 10);
        const in3Str = in3Days.toISOString().slice(0, 10);
        const { data: expiringItems } = await supabase
          .from("inventory_items")
          .select("id, name, household_id, expiry_date, expiry_notified_at")
          .not("expiry_date", "is", null)
          .lte("expiry_date", in3Str)
          .is("expiry_notified_at", null);

        for (const item of expiringItems ?? []) {
          const userIds = await resolveUserIds(supabase, item.household_id, null);
          const expired = item.expiry_date < todayStr;
          const ok = await sendTo(supabase, userIds, {
            title: expired ? "Alimento caducado" : "Alimento por caducar",
            body: expired
              ? `${item.name} ha caducado (${item.expiry_date})`
              : `${item.name} caduca el ${item.expiry_date}`,
            url: "/inventory",
          });
          if (ok) sent++;
          await supabase
            .from("inventory_items")
            .update({ expiry_notified_at: new Date().toISOString() })
            .eq("id", item.id);
        }

        // --- Medicines expiry (this month or already expired) ---
        const curYear = now.getFullYear();
        const curMonth = now.getMonth() + 1;
        const { data: expiringMeds } = await supabase
          .from("medicines")
          .select("id, name, household_id, expiry_month, expiry_year, expiry_notified_at")
          .not("expiry_year", "is", null)
          .not("expiry_month", "is", null)
          .is("expiry_notified_at", null);

        for (const med of expiringMeds ?? []) {
          // Notify if expiring this month or in the past
          const isExpiringSoon =
            med.expiry_year < curYear ||
            (med.expiry_year === curYear && med.expiry_month <= curMonth);
          if (!isExpiringSoon) continue;
          const userIds = await resolveUserIds(supabase, med.household_id, null);
          const expired =
            med.expiry_year < curYear ||
            (med.expiry_year === curYear && med.expiry_month < curMonth);
          const mm = String(med.expiry_month).padStart(2, "0");
          const ok = await sendTo(supabase, userIds, {
            title: expired ? "Medicina caducada" : "Medicina por caducar",
            body: `${med.name} · ${mm}/${med.expiry_year}`,
            url: "/medications",
          });
          if (ok) sent++;
          await supabase
            .from("medicines")
            .update({ expiry_notified_at: new Date().toISOString() })
            .eq("id", med.id);
        }

        sent += await sendScheduleNotifications(supabase, now);

        return new Response(JSON.stringify({ ok: true, sent }), {
          headers: { "content-type": "application/json" },
        });

      },
    },
  },
});

async function resolveUserIds(
  supabase: any,
  householdId: string,
  memberId: string | null,
): Promise<string[]> {
  if (memberId) {
    const { data } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("id", memberId)
      .maybeSingle();
    if (data?.user_id) return [data.user_id as string];
  }
  const { data } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .not("user_id", "is", null);
  return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
}

async function sendTo(
  supabase: any,
  userIds: string[],
  payload: { title: string; body: string; url: string },
): Promise<boolean> {
  if (userIds.length === 0) return false;
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
  const telegramSent = await sendTelegramToUsers(supabase, userIds, `<b>${payload.title}</b>\n${payload.body}`);
  return any || telegramSent > 0;
}

const WORK_SLOT_KINDS = new Set(["work", "subject", "extracurricular"]);

async function sendScheduleNotifications(supabase: any, now: Date): Promise<number> {
  const rangeStart = new Date(now.getTime() - 20 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 70 * 60 * 1000);
  const fromDate = toDateKey(new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000));
  const toDate = toDateKey(new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000));

  const [{ data: members }, { data: profiles }, { data: daySlots }, { data: templateSlots }, { data: statuses }, { data: settings }] =
    await Promise.all([
      supabase.from("household_members").select("id, display_name, household_id, user_id").not("user_id", "is", null),
      supabase.from("profiles").select("id, timezone"),
      supabase
        .from("schedule_day_slots")
        .select("id, member_id, household_id, date, start_time, end_time, slot_kind, label")
        .gte("date", fromDate)
        .lte("date", toDate),
      supabase.from("schedule_template_slots").select("id, member_id, household_id, day_of_week, start_time, end_time, slot_kind, label"),
      supabase.from("schedule_day_status").select("member_id, date, state, use_day_override").gte("date", fromDate).lte("date", toDate),
      supabase.from("schedule_settings").select("member_id, use_template, target_hours_per_day"),
    ]);

  const settingsByMember = new Map<string, any>((settings ?? []).map((row: any) => [row.member_id, row]));
  const timezoneByUser = new Map<string, string>((profiles ?? []).map((row: any) => [row.id, row.timezone || "Europe/Madrid"]));
  let sent = 0;

  for (const member of members ?? []) {
    const memberSettings: any = settingsByMember.get(member.id) ?? { use_template: true, target_hours_per_day: 8 };
    const timezone = timezoneByUser.get(member.user_id) || "Europe/Madrid";
    const dates = datesBetween(fromDate, toDate);
    for (const date of dates) {
      const slots = resolveSlotsForMemberDate({
        memberId: member.id,
        date,
        daySlots: daySlots ?? [],
        templateSlots: templateSlots ?? [],
        statuses: statuses ?? [],
        useTemplate: memberSettings.use_template !== false,
      });
      for (const slot of slots) {
        const startAt = dateTimeForSlot(date, slot.start_time, false, timezone);
        const endAt = dateTimeForSlot(date, slot.end_time, slotCrossesMidnight(slot), timezone);
        const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60000;
        const minutesAfterEnd = (now.getTime() - endAt.getTime()) / 60000;
        const slotKey = `${slot.source}:${slot.id}:${date}`;

        if (minutesUntilStart > 35 && minutesUntilStart <= 60) {
          sent += await sendScheduleNoticeOnce(supabase, member, slotKey, "start_60", {
            title: "Turno en 1 hora",
            body: `${member.display_name}: ${formatTime(slot.start_time)}-${formatTime(slot.end_time)}${slot.label ? ` · ${slot.label}` : ""}`,
            url: "/calendar/schedule",
          });
        }
        if (minutesUntilStart > 0 && minutesUntilStart <= 30) {
          sent += await sendScheduleNoticeOnce(supabase, member, slotKey, "start_30", {
            title: "Turno en 30 minutos",
            body: `${member.display_name}: ${formatTime(slot.start_time)}-${formatTime(slot.end_time)}${slot.label ? ` · ${slot.label}` : ""}`,
            url: "/calendar/schedule",
          });
        }
        if (minutesAfterEnd >= 0 && minutesAfterEnd <= 120) {
          const plannedHours = slotHours(slot);
          const target = Number(memberSettings.target_hours_per_day ?? 8);
          const prompt =
            plannedHours > target
              ? "Confirma si hiciste todas las horas o si saliste antes."
              : "Confirma si hiciste horas extra.";
          sent += await sendScheduleNoticeOnce(supabase, member, slotKey, "ended", {
            title: "Turno finalizado",
            body: `${member.display_name}: ${formatTime(slot.start_time)}-${formatTime(slot.end_time)}. ${prompt}`,
            url: `/calendar/schedule?adjustMemberId=${encodeURIComponent(member.id)}&adjustDate=${encodeURIComponent(date)}`,
          });
        }
      }
    }
  }

  return sent;
}

async function sendScheduleNoticeOnce(
  supabase: any,
  member: any,
  slotKey: string,
  noticeType: string,
  payload: { title: string; body: string; url: string },
): Promise<number> {
  if (!member.user_id) return 0;
  const { error } = await supabase.from("schedule_notification_log").insert({
    household_id: member.household_id,
    member_id: member.id,
    user_id: member.user_id,
    slot_key: slotKey,
    notice_type: noticeType,
  });
  if (error) {
    if (String(error.code) === "23505") return 0;
    console.error("schedule notification log failed", error);
    return 0;
  }
  const ok = await sendTo(supabase, [member.user_id], {
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });
  return ok ? 1 : 0;
}

function resolveSlotsForMemberDate({
  memberId,
  date,
  daySlots,
  templateSlots,
  statuses,
  useTemplate,
}: {
  memberId: string;
  date: string;
  daySlots: any[];
  templateSlots: any[];
  statuses: any[];
  useTemplate: boolean;
}) {
  const status = statuses.find((row) => row.member_id === memberId && row.date === date);
  if (status && ["vacation", "holiday", "sick", "off"].includes(status.state)) return [];
  const overrides = daySlots.filter((slot) => slot.member_id === memberId && slot.date === date && WORK_SLOT_KINDS.has(slot.slot_kind));
  if (overrides.length > 0 || status?.use_day_override) {
    return overrides.map((slot) => ({ ...slot, source: "day" }));
  }
  if (!useTemplate) return [];
  return templateSlots
    .filter((slot) => slot.member_id === memberId && slot.day_of_week === dayOfWeek(date) && WORK_SLOT_KINDS.has(slot.slot_kind))
    .map((slot) => ({ ...slot, source: "template" }));
}

function datesBetween(from: string, to: string) {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    out.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayOfWeek(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

function dateTimeForSlot(date: string, time: string, nextDay: boolean, timezone: string) {
  const localDate = nextDay ? addDaysToDateKey(date, 1) : date;
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = formatTime(time).split(":").map(Number);
  return zonedTimeToUtc(year, month - 1, day, hour, minute, timezone);
}

function addDaysToDateKey(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const naive = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  try {
    const tzString = naive.toLocaleString("en-US", { timeZone: timezone });
    const utcString = naive.toLocaleString("en-US", { timeZone: "UTC" });
    const offset = new Date(tzString).getTime() - new Date(utcString).getTime();
    return new Date(naive.getTime() - offset);
  } catch {
    return naive;
  }
}

function slotCrossesMidnight(slot: { start_time: string; end_time: string }) {
  return timeToMinutes(slot.end_time) <= timeToMinutes(slot.start_time);
}

function slotHours(slot: { start_time: string; end_time: string }) {
  let start = timeToMinutes(slot.start_time);
  let end = timeToMinutes(slot.end_time);
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

function timeToMinutes(value: string) {
  const [h, m] = formatTime(value).split(":").map(Number);
  return h * 60 + m;
}

function formatTime(value: string) {
  return value?.slice(0, 5) ?? "--:--";
}
