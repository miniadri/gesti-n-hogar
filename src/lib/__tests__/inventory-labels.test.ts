import { describe, expect, it } from "vitest";
import { normalizeInventoryLabelCode } from "@/lib/inventory-labels";

describe("normalizeInventoryLabelCode", () => {
  it("accepts the readable label code", () => {
    expect(normalizeInventoryLabelCode("hs-pan-0001")).toBe("HS-PAN-0001");
  });

  it("extracts the code from the QR/NFC scan URL", () => {
    expect(normalizeInventoryLabelCode("https://gestion-hogar.pages.dev/inventory/labels/scan?code=HS-PAN-0001"))
      .toBe("HS-PAN-0001");
  });

  it("rejects values that do not belong to HomeSync", () => {
    expect(normalizeInventoryLabelCode("https://example.com/other")).toBeNull();
  });
});
