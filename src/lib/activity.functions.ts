import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ActivityInput = {
  domain:
    | "inventory"
    | "shopping"
    | "receipt"
    | "notification"
    | "sos"
    | "schedule"
    | "calendar"
    | "medication"
    | "health"
    | "finance";
  action: string;
  title: string;
  details?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  channel?: string | null;
  status?: string | null;
  metadata?: Record<string, any>;
};

export async function logHouseholdActivity(
  supabase: any,
  householdId: string,
  actorUserId: string,
  activity: ActivityInput,
) {
  try {
    await supabase.from("household_activity").insert({
      household_id: householdId,
      actor_user_id: actorUserId,
      domain: activity.domain,
      action: activity.action,
      title: activity.title,
      details: activity.details ?? null,
      entity_type: activity.entityType ?? null,
      entity_id: activity.entityId ?? null,
      channel: activity.channel ?? null,
      status: activity.status ?? null,
      metadata: activity.metadata ?? {},
    });
  } catch (err) {
    console.warn("[activity] Could not log household activity", err);
  }
}

const ListActivityInput = z.object({
  domain: z
    .enum(["inventory", "shopping", "receipt", "notification", "sos", "schedule", "calendar", "medication", "health", "finance"])
    .optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const listHouseholdActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListActivityInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    let query = (context.supabase as any)
      .from("household_activity")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.domain) query = query.eq("domain", data.domain);

    const { data: rows, error } = await query;
    if (error) throw error;

    const actorIds = Array.from(
      new Set<string>((rows ?? []).map((row: any) => row.actor_user_id).filter(Boolean)),
    );

    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: members } = await context.supabase
        .from("household_members")
        .select("user_id, display_name")
        .eq("household_id", householdId)
        .in("user_id", actorIds);

      for (const member of members ?? []) {
        if (member.user_id) actorNames.set(member.user_id, member.display_name);
      }
    }

    return (rows ?? []).map((row: any) => ({
      ...row,
      actor_name: actorNames.get(row.actor_user_id) ?? "Usuario",
    }));
  });

const ActivityCenterInput = z.object({
  domain: z
    .enum(["all", "inventory", "shopping", "receipt", "notification", "sos", "schedule", "calendar", "medication", "health", "finance"])
    .default("all"),
  limit: z.number().int().min(10).max(150).default(60),
});

type CenterItem = {
  id: string;
  source: string;
  domain: string;
  action: string;
  title: string;
  details: string | null;
  actor_name: string | null;
  channel: string | null;
  status: "ok" | "pending" | "warning" | "error" | "info";
  created_at: string;
  href?: string;
};

export const listActivityCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ActivityCenterInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const [membersRes, activityRes, sosRes, scheduleLogRes, calendarRes, medicationRes] =
      await Promise.allSettled([
        context.supabase
          .from("household_members")
          .select("id, user_id, display_name")
          .eq("household_id", householdId),
        (context.supabase as any)
          .from("household_activity")
          .select("*")
          .eq("household_id", householdId)
          .order("created_at", { ascending: false })
          .limit(data.limit),
        context.supabase
          .from("sos_events")
          .select("id, triggered_by, triggered_by_name, is_test, sos_type, note, acknowledged_at, cancelled_at, ended_at, reminder_count, created_at")
          .eq("household_id", householdId)
          .order("created_at", { ascending: false })
          .limit(25),
        context.supabase
          .from("schedule_notification_log")
          .select("id, member_id, user_id, notice_type, sent_at, created_at")
          .eq("household_id", householdId)
          .order("sent_at", { ascending: false })
          .limit(35),
        context.supabase
          .from("calendar_events")
          .select("id, title, start_at, notified_at, created_by")
          .eq("household_id", householdId)
          .not("notified_at", "is", null)
          .order("notified_at", { ascending: false })
          .limit(25),
        context.supabase
          .from("medications")
          .select("id, name, member_id, medication_intakes(id, status, scheduled_for, last_reminder_sent_at, reminder_count, taken_at, created_at)")
          .eq("household_id", householdId)
          .order("created_at", { ascending: false })
          .limit(80),
      ]);

    const members = membersRes.status === "fulfilled" ? ((membersRes.value.data ?? []) as any[]) : [];
    const memberById = new Map(members.map((m) => [m.id, m.display_name as string]));
    const memberByUserId = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id, m.display_name as string]));

    const items: CenterItem[] = [];

    if (activityRes.status === "fulfilled" && !activityRes.value.error) {
      for (const row of (activityRes.value.data ?? []) as any[]) {
        items.push({
          id: `activity:${row.id}`,
          source: "activity",
          domain: row.domain,
          action: row.action,
          title: row.title,
          details: row.details ?? null,
          actor_name: memberByUserId.get(row.actor_user_id) ?? "Usuario",
          channel: row.channel ?? null,
          status: normalizeActivityStatus(row.status),
          created_at: row.created_at,
          href: activityHref(row.domain),
        });
      }
    }

    if (sosRes.status === "fulfilled" && !sosRes.value.error) {
      for (const ev of (sosRes.value.data ?? []) as any[]) {
        const status = ev.ended_at
          ? "ok"
          : ev.cancelled_at
            ? "warning"
            : ev.acknowledged_at
              ? "pending"
              : "error";
        items.push({
          id: `sos:${ev.id}`,
          source: "sos_events",
          domain: "sos",
          action: ev.is_test ? "test" : "triggered",
          title: ev.is_test ? "Simulacro SOS" : "SOS activado",
          details: [
            ev.triggered_by_name ? `Por ${ev.triggered_by_name}` : null,
            ev.sos_type ? `Tipo ${sosTypeLabel(ev.sos_type)}` : null,
            Number(ev.reminder_count) > 0 ? `${ev.reminder_count} recordatorio(s)` : null,
            ev.note || null,
          ].filter(Boolean).join(" · ") || null,
          actor_name: ev.triggered_by_name ?? null,
          channel: "Telegram / push",
          status,
          created_at: ev.created_at,
          href: "/settings/emergency",
        });
      }
    }

    if (scheduleLogRes.status === "fulfilled" && !scheduleLogRes.value.error) {
      for (const row of (scheduleLogRes.value.data ?? []) as any[]) {
        items.push({
          id: `schedule:${row.id}`,
          source: "schedule_notification_log",
          domain: "schedule",
          action: row.notice_type,
          title: scheduleNoticeTitle(row.notice_type),
          details: memberById.get(row.member_id) ? `Miembro: ${memberById.get(row.member_id)}` : null,
          actor_name: memberByUserId.get(row.user_id) ?? null,
          channel: "Push / Telegram",
          status: "ok",
          created_at: row.sent_at ?? row.created_at,
          href: "/calendar/schedule",
        });
      }
    }

    if (calendarRes.status === "fulfilled" && !calendarRes.value.error) {
      for (const ev of (calendarRes.value.data ?? []) as any[]) {
        items.push({
          id: `calendar:${ev.id}`,
          source: "calendar_events",
          domain: "calendar",
          action: "notified",
          title: `Aviso de calendario: ${ev.title}`,
          details: ev.start_at ? `Evento: ${formatDateTime(ev.start_at)}` : null,
          actor_name: memberByUserId.get(ev.created_by) ?? null,
          channel: "Push / Telegram",
          status: "ok",
          created_at: ev.notified_at,
          href: "/calendar",
        });
      }
    }

    if (medicationRes.status === "fulfilled" && !medicationRes.value.error) {
      for (const med of (medicationRes.value.data ?? []) as any[]) {
        const memberName = memberById.get(med.member_id) ?? null;
        for (const intake of (med.medication_intakes ?? []) as any[]) {
          if (!intake.last_reminder_sent_at && Number(intake.reminder_count ?? 0) === 0 && intake.status === "pending") {
            continue;
          }
          items.push({
            id: `medication:${intake.id}`,
            source: "medication_intakes",
            domain: "medication",
            action: intake.status,
            title: `Medicación: ${med.name}`,
            details: [
              memberName ? `Para ${memberName}` : null,
              intake.scheduled_for ? `Toma ${formatDateTime(intake.scheduled_for)}` : null,
              Number(intake.reminder_count) > 0 ? `${intake.reminder_count} recordatorio(s)` : null,
            ].filter(Boolean).join(" · ") || null,
            actor_name: memberName,
            channel: intake.last_reminder_sent_at ? "Push / Telegram" : null,
            status: medicationStatus(intake.status),
            created_at: intake.last_reminder_sent_at ?? intake.taken_at ?? intake.created_at,
            href: "/medications",
          });
        }
      }
    }

    const filtered = data.domain === "all" ? items : items.filter((item) => item.domain === data.domain);
    const sorted = filtered
      .filter((item) => Boolean(item.created_at))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, data.limit);

    const summary = {
      total: sorted.length,
      errors: sorted.filter((item) => item.status === "error").length,
      warnings: sorted.filter((item) => item.status === "warning").length,
      pending: sorted.filter((item) => item.status === "pending").length,
      notifications: sorted.filter((item) => ["notification", "sos", "schedule", "calendar", "medication"].includes(item.domain)).length,
      latestAt: sorted[0]?.created_at ?? null,
    };

    return { items: sorted, summary };
  });

function normalizeActivityStatus(status: string | null | undefined): CenterItem["status"] {
  if (status === "error" || status === "failed") return "error";
  if (status === "warning") return "warning";
  if (status === "pending") return "pending";
  if (status === "sent" || status === "ok" || status === "success") return "ok";
  return "info";
}

function medicationStatus(status: string): CenterItem["status"] {
  if (status === "taken") return "ok";
  if (status === "missed" || status === "skipped") return "warning";
  if (status === "pending") return "pending";
  return "info";
}

function activityHref(domain: string) {
  switch (domain) {
    case "inventory":
      return "/inventory";
    case "shopping":
    case "receipt":
      return "/shopping";
    case "sos":
      return "/settings/emergency";
    case "schedule":
      return "/calendar/schedule";
    case "calendar":
      return "/calendar";
    case "medication":
    case "health":
      return "/medications";
    case "finance":
      return "/finances";
    default:
      return "/settings/activity";
  }
}

function scheduleNoticeTitle(type: string) {
  switch (type) {
    case "start_60":
      return "Aviso de turno: empieza en 1 hora";
    case "start_30":
      return "Aviso de turno: empieza en 30 minutos";
    case "ended":
      return "Aviso de fin de turno";
    default:
      return `Aviso de cuadrante: ${type}`;
  }
}

function sosTypeLabel(type: string) {
  switch (type) {
    case "medical":
      return "médico";
    case "fall":
      return "caída";
    case "unsafe":
      return "inseguridad";
    case "other":
      return "otro";
    default:
      return "urgencia";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
