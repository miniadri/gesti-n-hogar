import { describe, expect, it } from "vitest";
import { isLowStock, stockAfterIntake, stockAfterUndo } from "@/lib/medication-calc";

describe("stockAfterIntake", () => {
  it("subtracts the dose", () => {
    expect(stockAfterIntake(20, 1)).toBe(19);
  });
  it("supports fractional doses", () => {
    expect(stockAfterIntake(10, 0.5)).toBe(9.5);
  });
  it("never goes below zero", () => {
    expect(stockAfterIntake(0.5, 1)).toBe(0);
  });
  it("treats unknown stock as zero", () => {
    expect(stockAfterIntake(null, 1)).toBe(0);
  });
});

describe("stockAfterUndo", () => {
  it("gives the dose back", () => {
    expect(stockAfterUndo(19, 1)).toBe(20);
  });
  it("never exceeds the total quantity of the box", () => {
    expect(stockAfterUndo(20, 1, 20)).toBe(20);
  });
});

describe("isLowStock", () => {
  it("triggers when the stock reaches the threshold", () => {
    expect(isLowStock(5, 5)).toBe(true);
  });
  it("does not trigger above the threshold", () => {
    expect(isLowStock(6, 5)).toBe(false);
  });
  it("does nothing when no threshold is configured", () => {
    expect(isLowStock(0, null)).toBe(false);
  });
});
