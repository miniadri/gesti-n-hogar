import { describe, expect, it } from "vitest";
import { medicationIntakeDisplayGroups } from "@/lib/medication-intake-display";

describe("medicationIntakeDisplayGroups", () => {
  const now = new Date("2026-09-20T12:00:00");

  it("keeps overdue pending doses, today, and tomorrow while hiding later plans", () => {
    const groups = medicationIntakeDisplayGroups([
      { id: "old-pending", status: "pending", scheduled_for: "2026-09-19T21:00:00" },
      { id: "old-taken", status: "taken", scheduled_for: "2026-09-19T21:00:00" },
      { id: "today", status: "pending", scheduled_for: "2026-09-20T23:00:00" },
      { id: "tomorrow", status: "pending", scheduled_for: "2026-09-21T23:00:00" },
      { id: "later", status: "pending", scheduled_for: "2026-09-22T23:00:00" },
    ], now);

    expect(groups.previousPending.map((intake) => intake.id)).toEqual(["old-pending"]);
    expect(groups.today.map((intake) => intake.id)).toEqual(["today"]);
    expect(groups.tomorrow.map((intake) => intake.id)).toEqual(["tomorrow"]);
  });

  it("uses the local calendar day rather than an ISO UTC prefix", () => {
    const groups = medicationIntakeDisplayGroups([
      { id: "today-local", status: "pending", scheduled_for: "2026-09-20T00:30:00" },
    ], new Date("2026-09-20T23:30:00"));

    expect(groups.today.map((intake) => intake.id)).toEqual(["today-local"]);
  });
});
