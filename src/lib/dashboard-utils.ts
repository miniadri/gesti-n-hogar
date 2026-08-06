/**
 * Pure helpers used by the dashboard to group calendar events and schedule shifts
 * for "today / tomorrow". No React and no data access, so they are easy to test.
 */

export const WORK_SLOT_KINDS = new Set(["work", "subject", "extracurricular"]);

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localDayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function timeToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function slotCrossesMidnight(slot: { start_time: string; end_time: string }) {
  return timeToMinutes(slot.end_time) <= timeToMinutes(slot.start_time);
}

export function formatTime(value: string) {
  return value?.slice(0, 5) ?? "--:--";
}

export function eventDayLabel(date: Date) {
  return dateKey(date) === dateKey(new Date()) ? "Hoy" : "Mañana";
}

export function splitEventsUpcoming(events: any[]) {
  const now = new Date();
  const max = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const grouped = { today: [] as any[], tomorrow: [] as any[] };
  for (const event of events ?? []) {
    const start = new Date(event.start_at);
    if (start < now || start > max) continue;
    if (dateKey(start) === dateKey(now)) grouped.today.push(event);
    else grouped.tomorrow.push(event);
  }
  return grouped;
}

export function slotDateTime(date: Date, time: string, nextDay: boolean) {
  const base = nextDay ? addDays(date, 1) : date;
  const [hour, minute] = formatTime(time).split(":").map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}

export function resolveScheduleSlotsForDate(schedule: any, memberId: string, date: Date, settings: any) {
  const key = dateKey(date);
  const status = (schedule.status ?? []).find((row: any) => row.member_id === memberId && row.date === key);
  if (status && ["vacation", "holiday", "sick", "off"].includes(status.state)) return [];

  const daySlots = schedule.daySlots ?? [];
  const overrides = daySlots.filter((slot: any) => slot.member_id === memberId && slot.date === key);
  if (overrides.length > 0 || status?.use_day_override) return overrides;

  if (!settings.use_template) return [];
  return (schedule.template ?? []).filter(
    (slot: any) => slot.member_id === memberId && slot.day_of_week === localDayIndex(date),
  );
}

export function buildScheduleUpcoming(schedule: any) {
  if (!schedule?.members?.length) return [];
  const now = new Date();
  const max = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const today = startOfLocalDay(now);
  const dates = [addDays(today, -1), today, addDays(today, 1)];
  const settingsByMember = new Map<string, any>((schedule.settings ?? []).map((row: any) => [row.member_id, row]));
  const upcoming: any[] = [];

  for (const member of schedule.members ?? []) {
    const settings = settingsByMember.get(member.id) ?? { use_template: true, notify_household: false };
    const relevantForUser = member.user_id === schedule.currentUserId || member.is_child || settings.notify_household;
    if (!relevantForUser) continue;

    for (const day of dates) {
      const slots = resolveScheduleSlotsForDate(schedule, member.id, day, settings).filter((slot: any) =>
        WORK_SLOT_KINDS.has(slot.slot_kind),
      );
      for (const slot of slots) {
        const start = slotDateTime(day, slot.start_time, false);
        const end = slotDateTime(day, slot.end_time, slotCrossesMidnight(slot));
        if (end <= now || start > max) continue;
        upcoming.push({
          ...slot,
          memberName: member.display_name,
          isChild: member.is_child,
          displayDate: start < now ? now : start,
          startAt: start,
          endAt: end,
          carried: start < startOfLocalDay(now),
        });
      }
    }
  }

  const grouped = new Map<string, any>();
  for (const slot of upcoming.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    const key = dateKey(slot.displayDate);
    const existing = grouped.get(key) ?? {
      date: startOfLocalDay(slot.displayDate),
      label: eventDayLabel(slot.displayDate),
      slots: [],
    };
    existing.slots.push(slot);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values());
}
