import { describe, expect, it } from "vitest";
import {
  addDays,
  dayDistance,
  DayKey,
  CycleEntrySchema,
  CycleDataSchema,
  EMPTY_CYCLE,
  estimateCycle,
  validateCycleEntries,
  PreferenceSchema,
  normalizeTaskMembers,
  type CycleEntry,
} from "../family-features";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const entry = (start: string, end: string | null = null, id = owner): CycleEntry => ({
  id,
  start,
  end,
  flow: "unspecified",
  observations: "",
});

describe("fechas y previsión personal", () => {
  it("rechaza días inexistentes", () => {
    expect(DayKey.safeParse("2026-02-29").success).toBe(false);
    expect(DayKey.safeParse("2024-02-29").success).toBe(true);
    expect(DayKey.safeParse("2026-13-01").success).toBe(false);
  });
  it("suma días sin confundir mes siguiente con duración del ciclo", () => {
    expect(addDays("2026-01-31", 28)).toBe("2026-02-28");
    expect(addDays("2024-02-01", 28)).toBe("2024-02-29");
  });
  it("no pierde días en cambios de hora", () => {
    expect(dayDistance("2026-03-28", "2026-03-30")).toBe(2);
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
  it("no crea previsiones sin entradas o cuando se desactivan", () => {
    expect(estimateCycle(EMPTY_CYCLE)).toBeNull();
    expect(
      estimateCycle({ ...EMPTY_CYCLE, entries: [entry("2026-10-01")], estimateEnabled: false }),
    ).toBeNull();
  });
  it("utiliza la referencia configurable cuando solo hay un inicio", () => {
    expect(
      estimateCycle({ ...EMPTY_CYCLE, expectedDays: 30, entries: [entry("2026-10-01")] }),
    ).toMatchObject({ next: "2026-10-31", samples: 0, from: "2026-10-28" });
  });
  it("usa intervalos reales entre inicios, no duración del sangrado", () => {
    const result = estimateCycle({
      ...EMPTY_CYCLE,
      entries: [entry("2026-09-01", "2026-09-04"), entry("2026-09-30", null, other)],
    });
    expect(result).toMatchObject({ next: "2026-10-29", samples: 1, days: 29 });
  });
  it("no desplaza automáticamente una previsión vencida al siguiente mes", () => {
    expect(estimateCycle({ ...EMPTY_CYCLE, entries: [entry("2020-01-01")] })?.next).toBe(
      "2020-01-29",
    );
  });
  it("rechaza fin anterior al inicio y limita notas", () => {
    expect(CycleEntrySchema.safeParse(entry("2026-10-05", "2026-10-01")).success).toBe(false);
    expect(
      CycleEntrySchema.safeParse({ ...entry("2026-10-01"), observations: "x".repeat(2001) })
        .success,
    ).toBe(false);
  });
  it("rechaza intervalos solapados, inicios repetidos y dos registros abiertos", () => {
    expect(() =>
      validateCycleEntries([entry("2026-10-01", "2026-10-06"), entry("2026-10-05", null, other)]),
    ).toThrow();
    expect(() =>
      validateCycleEntries([entry("2026-10-01"), entry("2026-10-02", null, other)]),
    ).toThrow();
    expect(() =>
      validateCycleEntries([entry("2026-10-01", "2026-10-02"), entry("2026-10-01", null, other)]),
    ).toThrow();
  });
  it("rechaza identificadores repetidos aunque las fechas no se solapen", () => {
    expect(() =>
      validateCycleEntries([entry("2026-09-01", "2026-09-05"), entry("2026-10-01")]),
    ).toThrow();
  });
  it("limita los días previos a 1–14 y no acepta datos extra", () => {
    expect(CycleDataSchema.safeParse({ ...EMPTY_CYCLE, leadDays: 0 }).success).toBe(false);
    expect(CycleDataSchema.safeParse({ ...EMPTY_CYCLE, leadDays: 15 }).success).toBe(false);
    expect(
      CycleEntrySchema.safeParse({ ...entry("2026-10-01"), household_id: other }).success,
    ).toBe(false);
  });
});

describe("preferencias", () => {
  const input = {
    block: "food",
    details: "Arroz",
    visibility: "private",
    recipients: [],
    revision: 0,
  };
  it("admite bloques privados y texto plano", () =>
    expect(PreferenceSchema.parse(input).details).toBe("Arroz"));
  it("exige destinatarios para compartir selectivamente", () =>
    expect(PreferenceSchema.safeParse({ ...input, visibility: "selected" }).success).toBe(false));
  it("rechaza suplantación del titular y revisión negativa", () => {
    expect(PreferenceSchema.safeParse({ ...input, owner_user_id: other }).success).toBe(false);
    expect(PreferenceSchema.safeParse({ ...input, revision: -1 }).success).toBe(false);
  });
});

describe("responsables de tareas", () => {
  it("elimina duplicados", () =>
    expect(normalizeTaskMembers([owner, owner, other], [owner, other])).toEqual([owner, other]));
  it("no admite otros hogares ni niños no habilitados", () =>
    expect(() => normalizeTaskMembers([other], [owner])).toThrow());
  it("mantiene la tarea sin asignar", () => expect(normalizeTaskMembers([], [owner])).toEqual([]));
});
