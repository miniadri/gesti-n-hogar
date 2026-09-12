import { describe, expect, it } from "vitest";
import { canRecordMedicationIntake } from "../medication-intake-window";

describe("medication intake action window", () => {
  const dueAt = new Date("2026-09-12T12:00:00.000Z");

  it("keeps taken and skipped actions hidden more than one hour before the dose", () => {
    expect(canRecordMedicationIntake(dueAt, new Date("2026-09-12T10:59:59.999Z"))).toBe(false);
  });

  it("opens the actions exactly one hour before the dose and keeps them available afterwards", () => {
    expect(canRecordMedicationIntake(dueAt, new Date("2026-09-12T11:00:00.000Z"))).toBe(true);
    expect(canRecordMedicationIntake(dueAt, new Date("2026-09-12T12:10:00.000Z"))).toBe(true);
  });

  it("rejects invalid scheduled times", () => {
    expect(canRecordMedicationIntake("not-a-date", dueAt)).toBe(false);
  });
});
