/**
 * Pure schedule (cuadrante) calculations.
 * Kept free of React/date-fns so they can be unit tested in isolation.
 */

export type TimeSlot = { start_time: string; end_time: string };

export const COUNTED_SLOT_KINDS = ["work", "subject", "extracurricular"] as const;
export type CountedSlotKind = (typeof COUNTED_SLOT_KINDS)[number];

export function isCountedSlot(slot: { slot_kind: string }): boolean {
  return (COUNTED_SLOT_KINDS as readonly string[]).includes(slot.slot_kind);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Duration of a slot in hours; shifts crossing midnight roll over to the next day. */
export function slotHours(s: TimeSlot): number {
  const start = timeToMinutes(s.start_time);
  let end = timeToMinutes(s.end_time);
  if (end <= start) end += 24 * 60;
  return Math.max(0, (end - start) / 60);
}

/** Real end instant of a slot on a given date (handles shifts crossing midnight). */
export function slotEndDate(date: Date, s: TimeSlot): Date {
  const end = new Date(date);
  end.setHours(0, 0, 0, 0);
  end.setMinutes(timeToMinutes(s.start_time) + slotHours(s) * 60);
  return end;
}

/** A shift that ends exactly at 00:00 closes the same day: it does not spill over. */
export function crossesMidnight(s: TimeSlot): boolean {
  const end = timeToMinutes(s.end_time);
  if (end === 0) return false;
  return end <= timeToMinutes(s.start_time);
}

/** Planned hours plus the manual adjustment, never negative. */
export function adjustedHours(plannedHours: number, adjustment: number): number {
  return Math.max(0, plannedHours + adjustment);
}

/**
 * Overtime contribution for a day.
 *
 * Positive manual adjustments add extra time. Negative manual adjustments are
 * allowed to compensate overtime accumulated on other days in the same period.
 */
export function dayOvertime(plannedHours: number, adjustment: number, targetHours: number): number {
  return Math.max(0, plannedHours - targetHours) + adjustment;
}

/** Sum of the hours of the slots that count towards the worked/attended total. */
export function sumCountedHours(slots: Array<TimeSlot & { slot_kind: string }>): number {
  return slots.filter(isCountedSlot).reduce((total, s) => total + slotHours(s), 0);
}

/** Accrued vacation balance = earned by elapsed months + manual adjustment - days used. */
export function vacationBalance(input: {
  earnedMonths: number;
  daysPerMonth: number;
  adjustment: number;
  usedDays: number;
}): { earned: number; used: number; adjustment: number; balance: number } {
  const earned = Math.max(0, input.earnedMonths) * input.daysPerMonth;
  return {
    earned,
    used: input.usedDays,
    adjustment: input.adjustment,
    balance: earned + input.adjustment - input.usedDays,
  };
}
