import { describe, expect, it } from "vitest";
import { medicationDashboardDayLabel, nextUpcomingMedicationIntakesByMember } from "@/lib/dashboard-utils";

describe("nextUpcomingMedicationIntakesByMember", () => {
  const now = new Date("2026-09-12T10:00:00.000Z");

  it("does not surface a stale pending dose instead of tonight's dose", () => {
    const results = nextUpcomingMedicationIntakesByMember(
      [
        {
          member_id: "adri",
          name: "Nexium",
          medication_intakes: [
            { id: "old", status: "pending", scheduled_for: "2026-09-11T21:01:00.000Z" },
            { id: "tonight", status: "pending", scheduled_for: "2026-09-12T21:01:00.000Z" },
          ],
        },
      ],
      now,
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("tonight");
  });

  it("keeps only one upcoming pending dose per member", () => {
    const results = nextUpcomingMedicationIntakesByMember(
      [
        {
          member_id: "luz",
          medication_intakes: [
            { id: "later", status: "pending", scheduled_for: "2026-09-12T14:59:00.000Z" },
            { id: "first", status: "pending", scheduled_for: "2026-09-12T12:00:00.000Z" },
          ],
        },
      ],
      now,
    );

    expect(results.map((intake) => intake.id)).toEqual(["first"]);
  });
});

describe("medicationDashboardDayLabel", () => {
  it("identifies a next-day dose as tomorrow instead of leaving its time ambiguous", () => {
    const now = new Date("2026-09-12T12:00:00");
    expect(medicationDashboardDayLabel("2026-09-13T07:59:00", now)).toBe("Mañana");
  });

  it("identifies a same-day dose as today", () => {
    const now = new Date("2026-09-12T12:00:00");
    expect(medicationDashboardDayLabel("2026-09-12T23:01:00", now)).toBe("Hoy");
  });
});
