import { describe, expect, it } from "vitest";
import { buildScheduleExportReport, type ScheduleExportData } from "@/lib/schedule-export";

const entry: ScheduleExportData = {
  member: { id: "member", display_name: "Test", is_child: false },
  settings: { kind: "work", target_hours_per_day: 8, use_template: true },
  template: [
    { id: "free", day_of_week: 0, start_time: "09:00", end_time: "17:00", slot_kind: "off", label: null, notes: null },
    { id: "work", day_of_week: 0, start_time: "09:00", end_time: "17:00", slot_kind: "work", label: null, notes: null },
  ],
  days: [],
  status: [],
};

const options = {
  from: "2026-10-05", to: "2026-10-05", includeSlots: true, includeStatuses: true,
  includeNotes: true, includeBreaks: true, onlyOvertime: false,
};

describe("exported template days off", () => {
  it("shows Libre with no scheduled hours even for legacy timed off slots", () => {
    const report = buildScheduleExportReport([entry], options);
    expect(report.days[0]).toMatchObject({ status: "Libre", plannedHours: 0, slots: "" });
    expect(report.summaries[0].offDays).toBe(1);
  });

  it("lets a day override replace the free template day", () => {
    const report = buildScheduleExportReport([{ ...entry, days: [{ ...entry.template[1], date: "2026-10-05" }] }], options);
    expect(report.days[0]).toMatchObject({ status: "", plannedHours: 8 });
  });
});
