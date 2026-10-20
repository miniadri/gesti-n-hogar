import { describe, expect, it } from "vitest";
import { csvSafeCell } from "../security-input";
import { scheduleReportToCsv, type ScheduleExportReport } from "../schedule-export";

describe("CSV security", () => {
  it("neutralizes spreadsheet formula prefixes without changing numbers", () => {
    expect(csvSafeCell("=HYPERLINK(\"https://evil.example\")")).toBe("'=HYPERLINK(\"https://evil.example\")");
    expect(csvSafeCell(" +SUM(A1:A2)")).toBe("' +SUM(A1:A2)");
    expect(csvSafeCell("normal text")).toBe("normal text");
    expect(csvSafeCell(-4.5)).toBe(-4.5);
  });

  it("neutralizes formulas in schedule member names and notes", () => {
    const report: ScheduleExportReport = {
      generatedAt: "2026-10-04T00:00:00.000Z",
      from: "2026-10-04",
      to: "2026-10-04",
      options: {
        from: "2026-10-04",
        to: "2026-10-04",
        includeSlots: true,
        includeStatuses: true,
        includeNotes: true,
        includeBreaks: true,
        onlyOvertime: false,
      },
      summaries: [],
      days: [{
        memberName: "=CMD()",
        date: "2026-10-04",
        weekday: "Domingo",
        status: "",
        plannedHours: 0,
        adjustmentHours: 0,
        workedHours: 0,
        overtimeHours: 0,
        slots: "",
        notes: "@danger",
      }],
    };
    const csv = scheduleReportToCsv(report);
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain("'@danger");
  });
});
