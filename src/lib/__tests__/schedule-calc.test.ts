import { describe, expect, it } from "vitest";
import {
  adjustedHours,
  crossesMidnight,
  dayOvertime,
  slotEndDate,
  slotHours,
  sumCountedHours,
  timeToMinutes,
  vacationBalance,
} from "@/lib/schedule-calc";

describe("slotHours", () => {
  it("counts a normal shift", () => {
    expect(slotHours({ start_time: "09:00", end_time: "17:00" })).toBe(8);
  });
  it("counts a shift crossing midnight", () => {
    expect(slotHours({ start_time: "22:00", end_time: "06:00" })).toBe(8);
  });
  it("counts a shift ending exactly at midnight", () => {
    expect(slotHours({ start_time: "16:00", end_time: "00:00" })).toBe(8);
  });
  it("supports half hours", () => {
    expect(slotHours({ start_time: "08:30", end_time: "15:00" })).toBe(6.5);
  });
});

describe("crossesMidnight", () => {
  it("is false when the shift ends at 00:00", () => {
    expect(crossesMidnight({ start_time: "16:00", end_time: "00:00" })).toBe(false);
  });
  it("is true for a real overnight shift", () => {
    expect(crossesMidnight({ start_time: "22:00", end_time: "06:00" })).toBe(true);
  });
  it("is false for a same-day shift", () => {
    expect(crossesMidnight({ start_time: "09:00", end_time: "17:00" })).toBe(false);
  });
});

describe("slotEndDate", () => {
  it("returns the same day for a normal shift", () => {
    const end = slotEndDate(new Date(2026, 7, 6), { start_time: "09:00", end_time: "17:00" });
    expect(end).toEqual(new Date(2026, 7, 6, 17, 0, 0, 0));
  });
  it("rolls into the next day for an overnight shift", () => {
    const end = slotEndDate(new Date(2026, 7, 6), { start_time: "22:00", end_time: "06:00" });
    expect(end).toEqual(new Date(2026, 7, 7, 6, 0, 0, 0));
  });
  it("closes at midnight of the following day for a shift ending at 00:00", () => {
    const end = slotEndDate(new Date(2026, 7, 6), { start_time: "16:00", end_time: "00:00" });
    expect(end).toEqual(new Date(2026, 7, 7, 0, 0, 0, 0));
  });
});

describe("dayOvertime", () => {
  it("always counts the manual adjustment", () => {
    expect(dayOvertime(8, 2, 8)).toBe(2);
  });
  it("counts the manual adjustment even on a short shift", () => {
    expect(dayOvertime(6, 1, 8)).toBe(1);
  });
  it("adds planned hours above the daily target", () => {
    expect(dayOvertime(10, 0, 8)).toBe(2);
  });
  it("adds up three days of manual extras (2h + 1h + 1h)", () => {
    const total = dayOvertime(8, 2, 8) + dayOvertime(8, 1, 8) + dayOvertime(8, 1, 8);
    expect(total).toBe(4);
  });
  it("never returns a negative value", () => {
    expect(dayOvertime(4, -2, 8)).toBe(0);
  });
});

describe("adjustedHours", () => {
  it("adds the adjustment to the planned hours", () => {
    expect(adjustedHours(8, 1.5)).toBe(9.5);
  });
  it("clamps at zero", () => {
    expect(adjustedHours(2, -5)).toBe(0);
  });
});

describe("sumCountedHours", () => {
  it("ignores breaks and days off", () => {
    const hours = sumCountedHours([
      { start_time: "09:00", end_time: "13:00", slot_kind: "work" },
      { start_time: "13:00", end_time: "14:00", slot_kind: "break" },
      { start_time: "14:00", end_time: "18:00", slot_kind: "work" },
      { start_time: "18:00", end_time: "20:00", slot_kind: "off" },
    ]);
    expect(hours).toBe(8);
  });
  it("counts school subjects and extracurricular activities", () => {
    const hours = sumCountedHours([
      { start_time: "09:00", end_time: "10:00", slot_kind: "subject" },
      { start_time: "17:00", end_time: "18:00", slot_kind: "extracurricular" },
    ]);
    expect(hours).toBe(2);
  });
});

describe("timeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(timeToMinutes("06:30")).toBe(390);
  });
  it("parses HH:MM:SS from the database", () => {
    expect(timeToMinutes("06:30:00")).toBe(390);
  });
});

describe("vacationBalance", () => {
  it("accrues 2.5 days per month and subtracts the days used", () => {
    const result = vacationBalance({ earnedMonths: 4, daysPerMonth: 2.5, adjustment: 0, usedDays: 3 });
    expect(result.earned).toBe(10);
    expect(result.balance).toBe(7);
  });
  it("applies a manual adjustment", () => {
    const result = vacationBalance({ earnedMonths: 2, daysPerMonth: 2.5, adjustment: -1, usedDays: 0 });
    expect(result.balance).toBe(4);
  });
});
