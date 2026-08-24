import {
  adjustedHours,
  dayOvertime,
  slotHours,
  sumCountedHours,
} from "@/lib/schedule-calc";

export type ScheduleExportMember = {
  id: string;
  display_name: string;
  is_child: boolean;
};

export type ScheduleExportSettings = {
  kind: "work" | "school";
  target_hours_per_day: number;
  vacation_days_per_month?: number;
  vacation_balance_adjustment?: number;
  vacation_start_date?: string | null;
  use_template: boolean;
  notes?: string | null;
};

export type ScheduleExportSlot = {
  id: string;
  day_of_week?: number;
  date?: string;
  start_time: string;
  end_time: string;
  slot_kind: "work" | "subject" | "extracurricular" | "break" | "off";
  label: string | null;
  notes: string | null;
};

export type ScheduleExportStatus = {
  date: string;
  state: "normal" | "vacation" | "holiday" | "sick" | "off";
  overtime_hours: number;
  use_day_override: boolean;
  notes: string | null;
};

export type ScheduleExportData = {
  member: ScheduleExportMember;
  settings: ScheduleExportSettings | null;
  template: ScheduleExportSlot[];
  days: ScheduleExportSlot[];
  status: ScheduleExportStatus[];
};

export type ScheduleExportOptions = {
  from: string;
  to: string;
  includeSlots: boolean;
  includeStatuses: boolean;
  includeNotes: boolean;
  includeBreaks: boolean;
  onlyOvertime: boolean;
};

export type ScheduleExportDay = {
  memberName: string;
  date: string;
  weekday: string;
  status: string;
  plannedHours: number;
  adjustmentHours: number;
  workedHours: number;
  overtimeHours: number;
  slots: string;
  notes: string;
};

export type ScheduleExportSummary = {
  memberName: string;
  from: string;
  to: string;
  days: number;
  workedDays: number;
  workedHours: number;
  normalHours: number;
  overtimeHours: number;
  adjustmentHours: number;
  vacationDays: number;
  holidayDays: number;
  sickDays: number;
  offDays: number;
  daysWithNotes: number;
};

export type ScheduleExportReport = {
  generatedAt: string;
  from: string;
  to: string;
  options: ScheduleExportOptions;
  summaries: ScheduleExportSummary[];
  days: ScheduleExportDay[];
};

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const STATUS_LABELS: Record<ScheduleExportStatus["state"], string> = {
  normal: "",
  vacation: "Vacaciones",
  holiday: "Festivo",
  sick: "Baja/enfermedad",
  off: "Libre",
};

export function buildScheduleExportReport(
  entries: ScheduleExportData[],
  options: ScheduleExportOptions,
): ScheduleExportReport {
  const allDays: ScheduleExportDay[] = [];
  const summaries: ScheduleExportSummary[] = [];

  for (const entry of entries) {
    const settings = entry.settings ?? defaultSettings(entry.member);
    const statuses = new Map(entry.status.map((s) => [s.date, s]));
    const memberDays: ScheduleExportDay[] = [];

    for (const date of datesInRange(options.from, options.to)) {
      const status = statuses.get(date);
      const slots = resolveSlots(date, entry.template, entry.days, status, settings.use_template)
        .filter((s) => options.includeBreaks || s.slot_kind !== "break");
      const countedSlots = slots.filter((s) =>
        ["work", "subject", "extracurricular"].includes(s.slot_kind),
      );
      const plannedHours = sumCountedHours(countedSlots);
      const adjustmentHours = entry.member.is_child ? 0 : Number(status?.overtime_hours ?? 0);
      const workedHours = adjustedHours(plannedHours, adjustmentHours);
      const overtimeContribution = entry.member.is_child
        ? 0
        : dayOvertime(plannedHours, adjustmentHours, settings.target_hours_per_day);
      const notes = collectNotes(status, slots, options.includeNotes);

      if (options.onlyOvertime && overtimeContribution <= 0 && adjustmentHours >= 0) continue;
      if (!options.includeStatuses && status?.state && status.state !== "normal" && plannedHours === 0) continue;

      memberDays.push({
        memberName: entry.member.display_name,
        date,
        weekday: WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()],
        status: status ? STATUS_LABELS[status.state] : "",
        plannedHours,
        adjustmentHours,
        workedHours,
        overtimeHours: overtimeContribution,
        slots: options.includeSlots ? formatSlots(slots) : "",
        notes,
      });
    }

    const rawOvertime = memberDays.reduce((sum, day) => sum + day.overtimeHours, 0);
    const overtimeHours = Math.max(0, rawOvertime);
    const workedHours = memberDays.reduce((sum, day) => sum + day.workedHours, 0);
    const statusCounts = countStatuses(entry.status, options.from, options.to);

    summaries.push({
      memberName: entry.member.display_name,
      from: options.from,
      to: options.to,
      days: datesInRange(options.from, options.to).length,
      workedDays: memberDays.filter((day) => day.workedHours > 0).length,
      workedHours,
      normalHours: Math.max(0, workedHours - overtimeHours),
      overtimeHours,
      adjustmentHours: memberDays.reduce((sum, day) => sum + day.adjustmentHours, 0),
      vacationDays: statusCounts.vacation,
      holidayDays: statusCounts.holiday,
      sickDays: statusCounts.sick,
      offDays: statusCounts.off,
      daysWithNotes: memberDays.filter((day) => day.notes.trim().length > 0).length,
    });

    allDays.push(...memberDays);
  }

  return {
    generatedAt: new Date().toISOString(),
    from: options.from,
    to: options.to,
    options,
    summaries,
    days: allDays,
  };
}

export function scheduleReportToCsv(report: ScheduleExportReport): string {
  const lines: string[] = [];
  lines.push("Resumen");
  lines.push(csvRow([
    "Miembro",
    "Desde",
    "Hasta",
    "Días",
    "Días trabajados",
    "Horas trabajadas",
    "Horas normales",
    "Horas extra",
    "Ajustes/compensación",
    "Vacaciones",
    "Festivos",
    "Baja/enfermedad",
    "Libres",
    "Días con notas",
  ]));
  for (const s of report.summaries) {
    lines.push(csvRow([
      s.memberName,
      s.from,
      s.to,
      s.days,
      s.workedDays,
      hours(s.workedHours),
      hours(s.normalHours),
      hours(s.overtimeHours),
      hours(s.adjustmentHours),
      s.vacationDays,
      s.holidayDays,
      s.sickDays,
      s.offDays,
      s.daysWithNotes,
    ]));
  }
  lines.push("");
  lines.push("Detalle diario");
  lines.push(csvRow([
    "Miembro",
    "Fecha",
    "Día",
    "Estado",
    "Horas planificadas",
    "Ajuste/compensación",
    "Horas reales",
    "Extra del día",
    "Franjas",
    "Notas",
  ]));
  for (const day of report.days) {
    lines.push(csvRow([
      day.memberName,
      day.date,
      day.weekday,
      day.status,
      hours(day.plannedHours),
      hours(day.adjustmentHours),
      hours(day.workedHours),
      hours(day.overtimeHours),
      day.slots,
      day.notes,
    ]));
  }
  return lines.join("\n");
}

export function scheduleReportToHtml(report: ScheduleExportReport): string {
  const title = `Informe de cuadrante ${report.from} - ${report.to}`;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; }
    p { color: #4b5563; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .num { text-align: right; white-space: nowrap; }
    @media print { body { margin: 12mm; } button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Imprimir / guardar PDF</button>
  <h1>${escapeHtml(title)}</h1>
  <p>Generado: ${escapeHtml(new Date(report.generatedAt).toLocaleString("es-ES"))}</p>
  <h2>Resumen</h2>
  <table>
    <thead><tr>
      <th>Miembro</th><th>Periodo</th><th>Días trabajados</th><th>Horas</th><th>Normales</th><th>Extra</th><th>Ajustes</th><th>Vacaciones</th><th>Festivos</th><th>Baja</th><th>Libres</th><th>Notas</th>
    </tr></thead>
    <tbody>
      ${report.summaries.map((s) => `<tr>
        <td>${escapeHtml(s.memberName)}</td>
        <td>${escapeHtml(s.from)} - ${escapeHtml(s.to)}</td>
        <td class="num">${s.workedDays}</td>
        <td class="num">${hours(s.workedHours)}</td>
        <td class="num">${hours(s.normalHours)}</td>
        <td class="num">${hours(s.overtimeHours)}</td>
        <td class="num">${hours(s.adjustmentHours)}</td>
        <td class="num">${s.vacationDays}</td>
        <td class="num">${s.holidayDays}</td>
        <td class="num">${s.sickDays}</td>
        <td class="num">${s.offDays}</td>
        <td class="num">${s.daysWithNotes}</td>
      </tr>`).join("")}
    </tbody>
  </table>
  <h2>Detalle diario</h2>
  <table>
    <thead><tr>
      <th>Miembro</th><th>Fecha</th><th>Día</th><th>Estado</th><th>Plan</th><th>Ajuste</th><th>Real</th><th>Extra</th><th>Franjas</th><th>Notas</th>
    </tr></thead>
    <tbody>
      ${report.days.map((day) => `<tr>
        <td>${escapeHtml(day.memberName)}</td>
        <td>${escapeHtml(day.date)}</td>
        <td>${escapeHtml(day.weekday)}</td>
        <td>${escapeHtml(day.status)}</td>
        <td class="num">${hours(day.plannedHours)}</td>
        <td class="num">${hours(day.adjustmentHours)}</td>
        <td class="num">${hours(day.workedHours)}</td>
        <td class="num">${hours(day.overtimeHours)}</td>
        <td>${escapeHtml(day.slots)}</td>
        <td>${escapeHtml(day.notes)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
}

function resolveSlots(
  date: string,
  template: ScheduleExportSlot[],
  daySlots: ScheduleExportSlot[],
  status: ScheduleExportStatus | undefined,
  useTemplate: boolean,
): ScheduleExportSlot[] {
  const overrides = daySlots.filter((s) => s.date === date);
  if (status && ["vacation", "holiday", "sick", "off"].includes(status.state)) return [];
  if (overrides.length > 0 || status?.use_day_override) return overrides;
  if (!useTemplate) return [];
  return template.filter((s) => s.day_of_week === dayOfWeek(date));
}

function defaultSettings(member: ScheduleExportMember): ScheduleExportSettings {
  return {
    kind: member.is_child ? "school" : "work",
    target_hours_per_day: 8,
    vacation_days_per_month: 0,
    vacation_balance_adjustment: 0,
    vacation_start_date: null,
    use_template: true,
    notes: null,
  };
}

function countStatuses(statuses: ScheduleExportStatus[], from: string, to: string) {
  const out = { vacation: 0, holiday: 0, sick: 0, off: 0 };
  for (const status of statuses) {
    if (status.date < from || status.date > to) continue;
    if (status.state in out) out[status.state as keyof typeof out] += 1;
  }
  return out;
}

function collectNotes(
  status: ScheduleExportStatus | undefined,
  slots: ScheduleExportSlot[],
  includeNotes: boolean,
) {
  if (!includeNotes) return "";
  return [
    status?.notes ? `Día: ${status.notes}` : "",
    ...slots.filter((s) => s.notes).map((s) => `${s.label || "Franja"}: ${s.notes}`),
  ].filter(Boolean).join(" | ");
}

function formatSlots(slots: ScheduleExportSlot[]) {
  return slots.map((s) => {
    const label = s.label ? ` ${s.label}` : "";
    return `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} ${slotKindLabel(s.slot_kind)}${label} (${hours(slotHours(s))})`;
  }).join(" | ");
}

function slotKindLabel(kind: ScheduleExportSlot["slot_kind"]) {
  return {
    work: "Trabajo",
    subject: "Clase",
    extracurricular: "Extraescolar",
    break: "Descanso",
    off: "Libre",
  }[kind];
}

function datesInRange(from: string, to: string) {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    out.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function dayOfWeek(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hours(value: number) {
  return `${Number(value || 0).toFixed(2)}h`;
}

function csvRow(values: Array<string | number>) {
  return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}