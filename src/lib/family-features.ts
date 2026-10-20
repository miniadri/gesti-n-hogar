import { z } from "zod";

export const DayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Fecha no válida");

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(day: string, days: number) {
  const date = new Date(`${DayKey.parse(day)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayDistance(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000,
  );
}

export const CycleEntrySchema = z
  .object({
    id: z.string().uuid(),
    start: DayKey,
    end: DayKey.nullable(),
    flow: z.enum(["unspecified", "light", "medium", "heavy"]).default("unspecified"),
    observations: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine((entry) => !entry.end || entry.end >= entry.start, "El fin debe ser posterior al inicio");

export type CycleEntry = z.infer<typeof CycleEntrySchema>;

export const CycleDataSchema = z
  .object({
    entries: z.array(CycleEntrySchema).max(1000),
    expectedDays: z.number().int().min(10).max(120).default(28),
    leadDays: z.number().int().min(1).max(14).default(3),
    estimateEnabled: z.boolean().default(true),
  })
  .strict();

export type CycleData = z.infer<typeof CycleDataSchema>;
export const EMPTY_CYCLE: CycleData = {
  entries: [],
  expectedDays: 28,
  leadDays: 3,
  estimateEnabled: true,
};

export function validateCycleEntries(entries: CycleEntry[]) {
  const ordered = [...entries].sort((first, second) => first.start.localeCompare(second.start));
  if (new Set(ordered.map((entry) => entry.id)).size !== ordered.length)
    throw new Error("Identificador de registro repetido");
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1];
    if (!previous.end || previous.end >= ordered[index].start)
      throw new Error("Los registros se solapan; revisa el inicio y el fin");
  }
  return ordered;
}

export function estimateCycle(data: CycleData) {
  const entries = validateCycleEntries(data.entries);
  const latest = entries.at(-1);
  if (!latest || !data.estimateEnabled) return null;
  const recent = entries.slice(-7);
  const intervals = recent
    .slice(1)
    .map((entry, index) => dayDistance(recent[index].start, entry.start));
  const length = intervals.length
    ? Math.round(intervals.reduce((total, days) => total + days, 0) / intervals.length)
    : data.expectedDays;
  const next = addDays(latest.start, length);
  return {
    next,
    days: length,
    samples: intervals.length,
    from: addDays(next, -data.leadDays),
    to: addDays(next, data.leadDays),
  };
}

export const PreferenceBlocks = ["sizes", "food", "style", "hobbies"] as const;
export const preferenceLabels: Record<(typeof PreferenceBlocks)[number], string> = {
  sizes: "Tallas: ropa y calzado",
  food: "Comidas favoritas y cosas que no gustan",
  style: "Estilos y colores",
  hobbies: "Aficiones e ideas de regalo",
};

export const PreferenceSchema = z
  .object({
    block: z.enum(PreferenceBlocks),
    details: z.string().trim().max(2000),
    visibility: z.enum(["private", "selected", "household"]),
    recipients: z.array(z.string().uuid()).max(100).default([]),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (value) => value.visibility !== "selected" || value.recipients.length > 0,
    "Selecciona al menos un destinatario",
  );

export function normalizeTaskMembers(ids: string[], eligibleIds: string[]) {
  const unique = [...new Set(ids)];
  if (unique.some((member) => !eligibleIds.includes(member)))
    throw new Error("Responsable no autorizado para esta tarea");
  return unique;
}
