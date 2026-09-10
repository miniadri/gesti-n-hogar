import { describe, expect, it } from "vitest";
import { normalizeMedicationTime } from "@/lib/medication-time";

describe("normalizeMedicationTime", () => {
  it("keeps browser time input values unchanged", () => {
    expect(normalizeMedicationTime("09:00")).toBe("09:00");
  });

  it("removes seconds returned by database time columns", () => {
    expect(normalizeMedicationTime("09:00:00")).toBe("09:00");
  });

  it("removes fractional seconds when present", () => {
    expect(normalizeMedicationTime("09:00:00.000")).toBe("09:00");
  });

  it("leaves invalid values untouched so validation can reject them", () => {
    expect(normalizeMedicationTime("9:00")).toBe("9:00");
  });
});

