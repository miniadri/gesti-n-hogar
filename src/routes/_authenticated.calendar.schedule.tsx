import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  addDays,
  addWeeks,
  differenceInCalendarMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  GraduationCap,
  Plus,
  Settings2,
  Trash2,
  Undo2,
  Briefcase,
  Lock,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  listScheduleMembers,
  upsertScheduleSettings,
  getMemberSchedule,
  upsertTemplateSlot,
  deleteTemplateSlot,
  upsertDaySlot,
  deleteDaySlot,
  upsertDayStatus,
  copyTemplateDay,
  createRangeSlots,
} from "@/lib/schedule.functions";

export const Route = createFileRoute("/_authenticated/calendar/schedule")({
  component: SchedulePage,
});

type Member = Awaited<ReturnType<typeof listScheduleMembers>>[number];
type Settings = {
  member_id: string;
  kind: "work" | "school";
  target_hours_per_day: number;
  vacation_days_per_month: number;
  vacation_balance_adjustment: number;
  vacation_start_date: string | null;
  use_template: boolean;
  is_shared: boolean;
  notify_household: boolean;
  notes: string | null;
};
type Slot = {
  id: string;
  day_of_week?: number;
  date?: string;
  start_time: string;
  end_time: string;
  slot_kind: "work" | "subject" | "extracurricular" | "break" | "off";
  label: string | null;
  notes: string | null;
};
type DayStatus = {
  id: string;
  date: string;
  state: "normal" | "vacation" | "holiday" | "sick" | "off";
  overtime_hours: number;
  use_day_override: boolean;
  notes: string | null;
};

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function slotHours(s: { start_time: string; end_time: string }): number {
  const start = timeToMinutes(s.start_time);
  let end = timeToMinutes(s.end_time);
  if (end <= start) end += 24 * 60; // overnight shift crossing midnight
  return Math.max(0, (end - start) / 60);
}
function adjustedHours(plannedHours: number, adjustment: number): number {
  return Math.max(0, plannedHours + adjustment);
}
function actualOvertime(actualHours: number, targetHours: number): number {
  return Math.max(0, actualHours - targetHours);
}
function crossesMidnight(s: { start_time: string; end_time: string }): boolean {
  const end = timeToMinutes(s.end_time);
  // Ending exactly at midnight closes the same day: it does not spill into the next one.
  if (end === 0) return false;
  return end <= timeToMinutes(s.start_time);
}
function fmtTime(t: string) {
  return t.slice(0, 5);
}
function kindColor(k: Slot["slot_kind"]): string {
  switch (k) {
    case "work":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "subject":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "extracurricular":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "break":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "off":
      return "bg-muted text-muted-foreground border-border";
  }
}
function stateLabel(s: DayStatus["state"]): string {
  return { normal: "", vacation: "Vacaciones", holiday: "Festivo", sick: "Baja", off: "Libre" }[s];
}

function SchedulePage() {
  const qc = useQueryClient();
  const membersFn = useServerFn(listScheduleMembers);
  const { data: members = [] } = useQuery({ queryKey: ["schedule", "members"], queryFn: () => membersFn() });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = members.find((m) => m.id === selectedId) ?? members[0];

  useEffect(() => {
    if (typeof window === "undefined" || selectedId || members.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const requestedMemberId = params.get("adjustMemberId");
    if (requestedMemberId && members.some((m) => m.id === requestedMemberId)) {
      setSelectedId(requestedMemberId);
    }
  }, [members, selectedId]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild title="Volver">
            <Link to="/calendar">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cuadrante</h1>
            <p className="text-sm text-muted-foreground">Horario laboral y escolar por miembro</p>
          </div>
        </div>
      </div>

      {/* Member chips */}
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedId(m.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
              (selected?.id === m.id) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {m.is_child ? <GraduationCap className="h-3.5 w-3.5" /> : <Briefcase className="h-3.5 w-3.5" />}
            {m.display_name}
            {m.settings && !m.settings.is_shared && <Lock className="h-3 w-3" />}
          </button>
        ))}
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">Añade miembros del hogar desde Ajustes → Familia.</p>
        )}
      </div>

      {selected && <MemberSchedule key={selected.id} member={selected} onChanged={() => qc.invalidateQueries({ queryKey: ["schedule"] })} />}
    </div>
  );
}

function MemberSchedule({ member, onChanged }: { member: Member; onChanged: () => void }) {
  const qc = useQueryClient();
  const getSchedule = useServerFn(getMemberSchedule);
  const delDaySlot = useServerFn(deleteDaySlot);
  const addDaySlot = useServerFn(upsertDaySlot);
  const setDayStatus = useServerFn(upsertDayStatus);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [mode, setMode] = useState<"template" | "week">("week");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slotDialog, setSlotDialog] = useState<{
    kind: "template" | "day";
    day_of_week?: number;
    date?: string;
    slot?: Slot;
  } | null>(null);
  const [statusDialog, setStatusDialog] = useState<{ date: string; status?: DayStatus } | null>(null);
  const handledAdjustLink = useRef<string | null>(null);

  // Load a wide range: week + surrounding month for month totals
  const monthStart = startOfMonth(weekStart);
  const monthEnd = endOfMonth(weekStart);
  const from = format(monthStart < weekStart ? monthStart : weekStart, "yyyy-MM-dd");
  const to = format(monthEnd > endOfWeek(weekStart, { weekStartsOn: 1 }) ? monthEnd : endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["schedule", member.id, from, to],
    queryFn: () => getSchedule({ data: { member_id: member.id, from, to } }),
  });

  const settings: Settings = (data?.settings as Settings) ?? {
    member_id: member.id,
    kind: member.is_child ? "school" : "work",
    target_hours_per_day: 8,
    vacation_days_per_month: 0,
    vacation_balance_adjustment: 0,
    vacation_start_date: null,
    use_template: true,
    is_shared: true,
    notify_household: member.is_child,
    notes: null,
  };

  const template: Slot[] = (data?.template as Slot[]) ?? [];
  const daySlots: Slot[] = (data?.days as Slot[]) ?? [];
  const statuses: DayStatus[] = (data?.status as DayStatus[]) ?? [];
  const statusByDate = new Map<string, DayStatus>(statuses.map((s) => [s.date, s]));

  useEffect(() => {
    if (typeof window === "undefined" || !data) return;
    const params = new URLSearchParams(window.location.search);
    const requestedMemberId = params.get("adjustMemberId");
    const requestedDate = params.get("adjustDate");
    if (!requestedMemberId || !requestedDate || requestedMemberId !== member.id) return;
    const key = `${requestedMemberId}:${requestedDate}`;
    if (handledAdjustLink.current === key) return;
    handledAdjustLink.current = key;
    setWeekStart(startOfWeek(parseISO(requestedDate), { weekStartsOn: 1 }));
    setMode("week");
    setStatusDialog({ date: requestedDate, status: statusByDate.get(requestedDate) });
  }, [data, member.id, statusByDate]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Resolve slots for a specific date (day override wins if present or if forced)
  function resolveDaySlots(date: Date): Slot[] {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayOfWeek = (date.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const overrides = daySlots.filter((s) => s.date === dateStr);
    const status = statusByDate.get(dateStr);
    if (status && ["vacation", "holiday", "sick", "off"].includes(status.state)) return [];
    if (overrides.length > 0 || status?.use_day_override) return overrides;
    if (!settings.use_template) return [];
    return template.filter((s) => s.day_of_week === dayOfWeek);
  }

  function isDaySlot(s: Slot) {
    return !!s.date;
  }

  /** Turn the template slots of a date into editable day slots (optionally skipping one). */
  async function materializeDay(date: Date, skipTemplateId?: string) {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayOfWeek = (date.getDay() + 6) % 7;
    const tpl = template.filter((s) => s.day_of_week === dayOfWeek && s.id !== skipTemplateId);
    for (const s of tpl) {
      await addDaySlot({
        data: {
          member_id: member.id,
          date: dateStr,
          start_time: s.start_time,
          end_time: s.end_time,
          slot_kind: s.slot_kind,
          label: s.label ?? null,
          notes: s.notes ?? null,
        },
      });
    }
    await setDayStatus({ data: { member_id: member.id, date: dateStr, use_day_override: true } });
    qc.invalidateQueries({ queryKey: ["schedule", member.id] });
  }

  async function removeSlotFromDay(date: Date, slot: Slot) {
    try {
      if (isDaySlot(slot)) {
        await delDaySlot({ data: { id: slot.id } });
        const dateStr = format(date, "yyyy-MM-dd");
        const remaining = daySlots.filter((s) => s.date === dateStr && s.id !== slot.id);
        if (remaining.length === 0) {
          await setDayStatus({ data: { member_id: member.id, date: dateStr, use_day_override: true } });
        }
        qc.invalidateQueries({ queryKey: ["schedule", member.id] });
      } else {
        await materializeDay(date, slot.id);
      }
      toast.success("Franja eliminada de este día");
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  /** Discard all day-specific changes so the date follows the template again. */
  async function resetDayToTemplate(date: Date) {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      for (const s of daySlots.filter((s) => s.date === dateStr)) {
        await delDaySlot({ data: { id: s.id } });
      }
      await setDayStatus({ data: { member_id: member.id, date: dateStr, use_day_override: false } });
      qc.invalidateQueries({ queryKey: ["schedule", member.id] });
      toast.success("Día restaurado a la plantilla");
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }



  // Totals — week
  const weekTotals = useMemo(() => {
    let worked = 0;
    let extra = 0;
    for (const d of weekDays) {
      const slots = resolveDaySlots(d);
      const dayHours = slots.filter((s) => s.slot_kind === "work" || s.slot_kind === "subject" || s.slot_kind === "extracurricular").reduce((a, s) => a + slotHours(s), 0);
      const status = statusByDate.get(format(d, "yyyy-MM-dd"));
      const adjustment = Number(status?.overtime_hours ?? 0);
      const actualHours = adjustedHours(dayHours, adjustment);
      worked += actualHours;
      extra += actualOvertime(actualHours, settings.target_hours_per_day);
    }
    return { worked, extra };
  }, [weekDays, template, daySlots, statuses, settings]);

  // Totals — month (only hours already worked: past days and finished shifts)
  const monthTotals = useMemo(() => {
    const start = startOfMonth(weekStart);
    const end = endOfMonth(weekStart);
    const now = new Date();
    let worked = 0;
    let extra = 0;
    let vacations = 0;
    const totalDays = differenceInCalendarDays(end, start) + 1;
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(start, i);
      const dateStr = format(d, "yyyy-MM-dd");
      const status = statusByDate.get(dateStr);
      if (status?.state === "vacation") vacations += 1;
      const slots = resolveDaySlots(d).filter(
        (s) => s.slot_kind === "work" || s.slot_kind === "subject" || s.slot_kind === "extracurricular",
      );
      if (slots.length === 0) continue;
      const finished = slots.filter((s) => slotEndDate(d, s) <= now);
      if (finished.length === 0) continue;
      const dayHours = finished.reduce((a, s) => a + slotHours(s), 0);
      const dayComplete = finished.length === slots.length;
      const adjustment = dayComplete ? Number(status?.overtime_hours ?? 0) : 0;
      const actualHours = adjustedHours(dayHours, adjustment);
      worked += actualHours;
      if (dayComplete) extra += actualOvertime(actualHours, settings.target_hours_per_day);
    }
    return { worked, extra, vacations };
  }, [weekStart, template, daySlots, statuses, settings]);


  // Accumulated vacation days: months since vacation_start_date * per-month allowance + manual adjustment - used
  const accruedVacation = useMemo(() => {
    const adjustment = Number(settings.vacation_balance_adjustment ?? 0);
    if (!settings.vacation_start_date || Number(settings.vacation_days_per_month ?? 0) <= 0) {
      return { earned: 0, used: 0, adjustment, balance: adjustment, active: false };
    }
    const monthsElapsed = Math.max(0, differenceInCalendarMonths(new Date(), parseISO(settings.vacation_start_date)) + (new Date().getDate() >= parseISO(settings.vacation_start_date).getDate() ? 1 : 0));
    const earned = monthsElapsed * settings.vacation_days_per_month;
    const used = statuses.filter((s) => s.state === "vacation" && s.date >= settings.vacation_start_date!).length;
    return { earned, used, adjustment, balance: earned + adjustment - used, active: true };
  }, [settings, statuses]);

  return (
    <>
      {/* Header row: settings + navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{member.display_name}</h2>
          {settings.kind === "school" ? (
            <Badge variant="secondary" className="gap-1"><GraduationCap className="h-3 w-3" /> Escolar</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><Briefcase className="h-3 w-3" /> Laboral</Badge>
          )}
          {settings.is_shared ? (
            <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> Compartido</Badge>
          ) : (
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Privado</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "week" ? "default" : "outline"} size="sm" onClick={() => setMode("week")}>Semana</Button>
          <Button variant={mode === "template" ? "default" : "outline"} size="sm" onClick={() => setMode("template")}>Plantilla</Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} title="Ajustes">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {mode === "week" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => subWeeks(d, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => addWeeks(d, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoy</Button>
            </div>
            <div className="text-sm text-muted-foreground">
              {format(weekStart, "d MMM", { locale: es })} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), "d MMM yyyy", { locale: es })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">

            {weekDays.map((day, idx) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const status = statusByDate.get(dateStr);
              const slots = resolveDaySlots(day);
              const prevSlots = resolveDaySlots(addDays(day, -1));
              const carry = prevSlots.filter(crossesMidnight);
              const items: Array<Slot & { __carry?: boolean; __crosses?: boolean }> = [
                ...carry.map((s) => ({ ...s, __carry: true as const })),
                ...slots.map((s) => ({ ...s, __carry: false as const, __crosses: crossesMidnight(s) })),
              ];
              const dayHours = slots.filter((s) => s.slot_kind === "work" || s.slot_kind === "subject" || s.slot_kind === "extracurricular").reduce((a, s) => a + slotHours(s), 0);
              const adjustment = Number(status?.overtime_hours ?? 0);
              const actualHours = adjustedHours(dayHours, adjustment);
              const overtime = actualOvertime(actualHours, settings.target_hours_per_day);
              const hasOverride = daySlots.some((s) => s.date === dateStr) || status?.use_day_override;
              const nextDay = addDays(day, 1);
              const statusBannerColor =
                status?.state === "off"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                  : status?.state === "vacation"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : status?.state === "sick"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                      : status?.state === "holiday"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                        : "";

              return (
                <Card key={dateStr} className="overflow-hidden">
                  <CardHeader className="pb-2 px-3 pt-3 sm:px-4 sm:pt-4">

                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {DAY_LABELS[idx]} <span className="text-muted-foreground">{format(day, "d MMM", { locale: es })}</span>
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 px-3 pb-3 sm:px-4">

                    {status?.state && status.state !== "normal" && (
                      <div className={`-mx-3 -mt-2 mb-2 w-[calc(100%+1.5rem)] px-3 py-2 text-center text-sm font-semibold sm:-mx-4 sm:w-[calc(100%+2rem)] sm:px-4 ${statusBannerColor}`}>
                        {stateLabel(status.state)}
                      </div>
                    )}
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin franjas</p>
                    ) : (
                      items.map((s, i) => (
                        <div key={(s.__carry ? "c-" : "o-") + s.id + i} className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${kindColor(s.slot_kind)} ${s.__carry ? "opacity-80 border-dashed" : ""}`}>
                          <div className="min-w-0">
                            {s.__carry ? (
                              <>
                                <div className="font-medium">00:00–{fmtTime(s.end_time)}</div>
                                <div className="opacity-80 italic">Viene del {format(addDays(day, -1), "d MMM", { locale: es })} ({fmtTime(s.start_time)})</div>
                                {s.label && <div className="opacity-80">{s.label}</div>}
                              </>
                            ) : s.__crosses ? (
                              <>
                                <div className="font-medium">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</div>
                                <div className="opacity-80 italic">{format(day, "d MMM", { locale: es })} → {format(nextDay, "d MMM", { locale: es })}</div>
                                {s.label && <div className="opacity-80">{s.label}</div>}
                              </>
                            ) : (
                              <>
                                <div className="font-medium">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</div>
                                {s.label && <div className="opacity-80">{s.label}</div>}
                              </>
                            )}
                          </div>
                          {!s.__carry && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                className="opacity-60 hover:opacity-100"
                                onClick={async () => {
                                  if (s.date) {
                                    setSlotDialog({ kind: "day", date: dateStr, slot: s });
                                  } else {
                                    await materializeDay(day);
                                    toast.info("Este día ya no sigue la plantilla: edítalo libremente");
                                  }
                                }}
                                title={s.date ? "Editar" : "Editar solo este día"}
                              >
                                <Settings2 className="h-3 w-3" />
                              </button>
                              <button
                                className="opacity-60 hover:opacity-100"
                                onClick={() => removeSlotFromDay(day, s)}
                                title="Eliminar de este día"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                      <span>
                        {adjustment === 0 ? (
                          <>{dayHours.toFixed(1)}h</>
                        ) : (
                          <>Plan {dayHours.toFixed(1)}h · Real {actualHours.toFixed(1)}h</>
                        )}
                        {adjustment !== 0 && (
                          <span className={adjustment > 0 ? "ml-1 text-amber-600" : "ml-1 text-sky-600"}>
                            ({adjustment > 0 ? "+" : ""}{adjustment.toFixed(1)}h)
                          </span>
                        )}
                        {overtime > 0 && <span className="ml-1 text-amber-600"> +{overtime.toFixed(1)}h extra</span>}
                      </span>
                      {hasOverride && <span className="italic">Ajuste</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setSlotDialog({ kind: "day", date: dateStr })}>
                        <Plus className="mr-1 h-3 w-3" /> Franja
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setStatusDialog({ date: dateStr, status })} title="Estado del día">
                        <CalendarDays className="h-3.5 w-3.5" />
                      </Button>
                      {hasOverride && (
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => resetDayToTemplate(day)} title="Deshacer cambios de este día (volver a la plantilla)">
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Esta semana</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{weekTotals.worked.toFixed(1)}h</div>
                {weekTotals.extra > 0 && <div className="text-sm text-amber-600">+{weekTotals.extra.toFixed(1)}h extras</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Este mes</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{monthTotals.worked.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">
                  {monthTotals.extra > 0 && <span className="text-amber-600">+{monthTotals.extra.toFixed(1)}h extras · </span>}
                  {monthTotals.vacations} día{monthTotals.vacations === 1 ? "" : "s"} vacaciones
                </div>
              </CardContent>
            </Card>
            {settings.kind === "work" && typeof accruedVacation === "object" && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Vacaciones acumuladas</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{accruedVacation.balance.toFixed(1)}d</div>
                  <div className="text-xs text-muted-foreground">
                    {accruedVacation.active ? (
                      <>Ganados: {accruedVacation.earned.toFixed(1)} · Usados: {accruedVacation.used}</>
                    ) : (
                      <>Sin cómputo activo</>
                    )}
                    {accruedVacation.adjustment !== 0 && (
                      <> · Ajuste: {accruedVacation.adjustment > 0 ? "+" : ""}{accruedVacation.adjustment.toFixed(1)}</>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : (
        <TemplateEditor
          member={member}
          template={template}
          onEdit={(s, day) => setSlotDialog({ kind: "template", day_of_week: day, slot: s })}
          onAdd={(day) => setSlotDialog({ kind: "template", day_of_week: day })}
        />
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          member={member}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => { setSettingsOpen(false); qc.invalidateQueries({ queryKey: ["schedule"] }); onChanged(); }}
        />
      )}
      {slotDialog && (
        <SlotDialog
          member={member}
          kind={settings.kind}
          data={slotDialog}
          onClose={() => setSlotDialog(null)}
          onSaved={() => { setSlotDialog(null); qc.invalidateQueries({ queryKey: ["schedule", member.id] }); }}
        />
      )}
      {statusDialog && (
        <StatusDialog
          member={member}
          date={statusDialog.date}
          status={statusDialog.status}
          onClose={() => setStatusDialog(null)}
          onSaved={() => { setStatusDialog(null); qc.invalidateQueries({ queryKey: ["schedule", member.id] }); }}
        />
      )}
    </>
  );
}

function TemplateEditor({
  member,
  template,
  onEdit,
  onAdd,
}: {
  member: Member;
  template: Slot[];
  onEdit: (s: Slot, day: number) => void;
  onAdd: (day: number) => void;
}) {
  const qc = useQueryClient();
  const copyFn = useServerFn(copyTemplateDay);
  const createRangeFn = useServerFn(createRangeSlots);
  const delFn = useServerFn(deleteTemplateSlot);
  const [copyFrom, setCopyFrom] = useState<number>(0);
  const [rangeStart, setRangeStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rangeEnd, setRangeEnd] = useState(format(addWeeks(new Date(), 2), "yyyy-MM-dd"));
  const [rangeDays, setRangeDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [rangeSlotKind, setRangeSlotKind] = useState<Slot["slot_kind"]>(member.is_child ? "extracurricular" : "work");
  const [rangeSlotStart, setRangeSlotStart] = useState("09:00");
  const [rangeSlotEnd, setRangeSlotEnd] = useState("10:00");
  const [rangeLabel, setRangeLabel] = useState("");
  const [rangeNotes, setRangeNotes] = useState("");
  const [conflictMode, setConflictMode] = useState<"append" | "replace_overlapping" | "replace_days">("append");

  const toggleRangeDay = (day: number, checked: boolean) => {
    setRangeDays((current) =>
      checked
        ? Array.from(new Set([...current, day])).sort((a, b) => a - b)
        : current.filter((d) => d !== day),
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Copiar día de plantilla:</span>
          <Select value={String(copyFrom)} onValueChange={(v) => setCopyFrom(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAY_LABELS.map((l, i) => <SelectItem key={i} value={String(i)}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const targets = [0,1,2,3,4].filter((d) => d !== copyFrom);
              await copyFn({ data: { member_id: member.id, from_day: copyFrom, to_days: targets } });
              toast.success("Copiado a L–V");
              qc.invalidateQueries({ queryKey: ["schedule", member.id] });
            }}
          >
            <Copy className="mr-1 h-3 w-3" /> a L–V
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await copyFn({ data: { member_id: member.id, from_day: copyFrom, to_days: [0,1,2,3,4,5,6].filter((d) => d !== copyFrom) } });
              toast.success("Copiado a toda la semana");
              qc.invalidateQueries({ queryKey: ["schedule", member.id] });
            }}
          >
            <Copy className="mr-1 h-3 w-3" /> a toda la semana
          </Button>
        </div>
        <div className="grid gap-3 border-t pt-3">
          <div>
            <div className="text-sm font-medium">Asistente horario temporal</div>
            <p className="text-xs text-muted-foreground">
              Añade una actividad o turno durante un periodo concreto, sin repetirlo indefinidamente en la plantilla semanal.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label>Qué quieres añadir</Label>
              <Input
                value={rangeLabel}
                onChange={(e) => setRangeLabel(e.target.value)}
                placeholder={member.is_child ? "Extraescolar verano" : "Turno temporal"}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={rangeSlotKind} onValueChange={(v: any) => setRangeSlotKind(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {member.is_child ? (
                    <>
                      <SelectItem value="subject">Clase</SelectItem>
                      <SelectItem value="extracurricular">Extraescolar</SelectItem>
                      <SelectItem value="break">Descanso</SelectItem>
                      <SelectItem value="off">Libre</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="work">Trabajo</SelectItem>
                      <SelectItem value="break">Descanso</SelectItem>
                      <SelectItem value="off">Libre</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Entrada</Label>
              <Input type="time" value={rangeSlotStart} onChange={(e) => setRangeSlotStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Salida</Label>
              <Input type="time" value={rangeSlotEnd} onChange={(e) => setRangeSlotEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
            <div className="grid gap-1.5">
              <Label>Desde</Label>
              <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Días</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, day) => (
                  <label key={day} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                    <Checkbox
                      checked={rangeDays.includes(day)}
                      onCheckedChange={(checked) => toggleRangeDay(day, checked === true)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notas opcionales</Label>
            <Textarea rows={2} value={rangeNotes} onChange={(e) => setRangeNotes(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid min-w-64 gap-1.5">
              <Label>Si ya hay franjas esos días</Label>
              <Select value={conflictMode} onValueChange={(v: any) => setConflictMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">Mantener y añadir esta franja</SelectItem>
                  <SelectItem value="replace_overlapping">Sustituir solo franjas solapadas</SelectItem>
                  <SelectItem value="replace_days">Vaciar esos días y crear esta franja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  if (rangeDays.length === 0) {
                    toast.error("Elige al menos un día");
                    return;
                  }
                  const result = await createRangeFn({
                    data: {
                      member_id: member.id,
                      start_date: rangeStart,
                      end_date: rangeEnd,
                      weekdays: rangeDays,
                      start_time: rangeSlotStart,
                      end_time: rangeSlotEnd,
                      slot_kind: rangeSlotKind,
                      label: rangeLabel || null,
                      notes: rangeNotes || null,
                      conflict_mode: conflictMode,
                    },
                  });
                  const deleted = result.deleted ? `, ${result.deleted} sustituidas` : "";
                  toast.success(`Creado en ${result.dates} días (${result.inserted} franjas${deleted})`);
                  qc.invalidateQueries({ queryKey: ["schedule", member.id] });
                } catch (e: any) {
                  toast.error(e?.message ?? "Error");
                }
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Crear horario temporal
            </Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {DAY_LABELS.map((label, dow) => {
          const slots = template.filter((s) => s.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time));
          const hours = slots.filter((s) => s.slot_kind !== "break" && s.slot_kind !== "off").reduce((a, s) => a + slotHours(s), 0);
          return (
            <Card key={dow}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex justify-between">
                  <span>{label}</span>
                  <span className="text-xs text-muted-foreground">{hours.toFixed(1)}h</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {slots.length === 0 && <p className="text-xs text-muted-foreground">Sin franjas</p>}
                {slots.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs ${kindColor(s.slot_kind)}`}
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(s, dow)} title="Editar">
                      <div className="font-medium">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</div>
                      {s.label && <div className="opacity-80">{s.label}</div>}
                    </button>
                    <button
                      className="shrink-0 opacity-60 hover:opacity-100"
                      title="Eliminar franja de la plantilla"
                      onClick={async () => {
                        try {
                          await delFn({ data: { id: s.id } });
                          toast.success("Franja eliminada");
                          qc.invalidateQueries({ queryKey: ["schedule", member.id] });
                        } catch (e: any) { toast.error(e?.message ?? "Error"); }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {slots.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        for (const s of slots) await delFn({ data: { id: s.id } });
                        toast.success(`${label}: franjas eliminadas`);
                        qc.invalidateQueries({ queryKey: ["schedule", member.id] });
                      } catch (e: any) { toast.error(e?.message ?? "Error"); }
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Vaciar día
                  </Button>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={() => onAdd(dow)}>
                  <Plus className="mr-1 h-3 w-3" /> Franja
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SettingsDialog({
  settings,
  member,
  onClose,
  onSaved,
}: {
  settings: Settings;
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(upsertScheduleSettings);
  const [kind, setKind] = useState(settings.kind);
  const [target, setTarget] = useState(String(settings.target_hours_per_day));
  const [vac, setVac] = useState(String(settings.vacation_days_per_month));
  const [vacAdjustment, setVacAdjustment] = useState(String(settings.vacation_balance_adjustment ?? 0));
  const [vacStart, setVacStart] = useState(settings.vacation_start_date || "");
  const [useTpl, setUseTpl] = useState(settings.use_template);
  const [shared, setShared] = useState(settings.is_shared);
  const [notifyHousehold, setNotifyHousehold] = useState(settings.notify_household ?? false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustes de cuadrante · {member.display_name}</DialogTitle>
          <DialogDescription>Configura horas objetivo, vacaciones y visibilidad.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="work">Laboral</SelectItem>
                <SelectItem value="school">Escolar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Horas objetivo/día</Label>
              <Input type="number" step="0.25" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            {kind === "work" && (
              <div className="grid gap-1.5">
                <Label>Días vacaciones/mes</Label>
                <Input type="number" step="0.5" value={vac} onChange={(e) => setVac(e.target.value)} />
              </div>
            )}
          </div>
          {kind === "work" && (
            <div className="grid gap-3 rounded border p-3">
              <div className="grid gap-1.5">
                <Label>Inicio cómputo vacaciones</Label>
                <Input type="date" value={vacStart} onChange={(e) => setVacStart(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Déjalo vacío si no quieres acumular vacaciones todavía o si has terminado una empresa anterior.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label>Ajuste manual de saldo</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={vacAdjustment}
                  onChange={(e) => setVacAdjustment(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Usa valores negativos para descontar días ya regularizados o positivos para añadir días reconocidos.
                  Los días marcados como vacaciones en el calendario se descuentan automáticamente.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setVac("0");
                  setVacAdjustment("0");
                  setVacStart("");
                }}
              >
                Reiniciar cómputo de vacaciones
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between rounded border p-2">
            <div>
              <div className="text-sm font-medium">Usar plantilla semanal</div>
              <div className="text-xs text-muted-foreground">Repite el horario cada semana</div>
            </div>
            <Switch checked={useTpl} onCheckedChange={setUseTpl} />
          </div>
          <div className="flex items-center justify-between rounded border p-2">
            <div>
              <div className="text-sm font-medium">Compartir con el hogar</div>
              <div className="text-xs text-muted-foreground">Otros miembros pueden ver este cuadrante</div>
            </div>
            <Switch checked={shared} onCheckedChange={setShared} />
          </div>
          <div className="flex items-center justify-between rounded border p-2">
            <div>
              <div className="text-sm font-medium">Avisar a todo el hogar</div>
              <div className="text-xs text-muted-foreground">
                Envía avisos de inicio y fin de turno a todos. Los perfiles infantiles ya se avisan así automáticamente.
              </div>
            </div>
            <Switch checked={notifyHousehold || member.is_child} onCheckedChange={setNotifyHousehold} disabled={member.is_child} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={async () => {
              try {
                await save({
                  data: {
                    member_id: member.id,
                    kind,
                    target_hours_per_day: Number(target) || 8,
                    vacation_days_per_month: Number(vac) || 0,
                    vacation_balance_adjustment: Number(vacAdjustment) || 0,
                    vacation_start_date: vacStart || null,
                    use_template: useTpl,
                    is_shared: shared,
                    notify_household: member.is_child ? true : notifyHousehold,
                  },
                });
                toast.success("Ajustes guardados");
                onSaved();
              } catch (e: any) {
                toast.error(e?.message ?? "Error");
              }
            }}
          >Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlotDialog({
  member,
  kind,
  data,
  onClose,
  onSaved,
}: {
  member: Member;
  kind: "work" | "school";
  data: { kind: "template" | "day"; day_of_week?: number; date?: string; slot?: Slot };
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsertT = useServerFn(upsertTemplateSlot);
  const upsertD = useServerFn(upsertDaySlot);
  const delT = useServerFn(deleteTemplateSlot);
  const delD = useServerFn(deleteDaySlot);
  const s = data.slot;
  const [start, setStart] = useState(s?.start_time?.slice(0, 5) ?? "09:00");
  const [end, setEnd] = useState(s?.end_time?.slice(0, 5) ?? "17:00");
  const [slotKind, setSlotKind] = useState<Slot["slot_kind"]>(s?.slot_kind ?? (kind === "school" ? "subject" : "work"));
  const [label, setLabel] = useState(s?.label ?? "");
  const [notes, setNotes] = useState(s?.notes ?? "");

  const isDay = data.kind === "day";
  const title = isDay ? `Franja del ${data.date}` : `Franja plantilla · ${DAY_LABELS[data.day_of_week ?? 0]}`;

  const kindOptions: { v: Slot["slot_kind"]; l: string }[] =
    kind === "school"
      ? [{ v: "subject", l: "Asignatura" }, { v: "extracurricular", l: "Extraescolar" }, { v: "break", l: "Recreo" }, { v: "off", l: "Libre" }]
      : [{ v: "work", l: "Trabajo" }, { v: "break", l: "Descanso" }, { v: "off", l: "Libre" }];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Entrada</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Salida</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select value={slotKind} onValueChange={(v: any) => setSlotKind(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {kindOptions.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{kind === "school" ? "Asignatura / actividad" : "Etiqueta"}</Label>
            <Input value={label ?? ""} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "school" ? "Matemáticas" : "Turno mañana"} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {s && (
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                try {
                  if (isDay) await delD({ data: { id: s.id } });
                  else await delT({ data: { id: s.id } });
                  toast.success("Franja eliminada");
                  onSaved();
                } catch (e: any) { toast.error(e?.message ?? "Error"); }
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Eliminar
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={async () => {
                try {
                  if (start === end) { toast.error("La entrada y salida no pueden coincidir"); return; }
                  if (isDay) {
                    await upsertD({
                      data: {
                        id: s?.id,
                        member_id: member.id,
                        date: data.date!,
                        start_time: start, end_time: end,
                        slot_kind: slotKind,
                        label: label || null,
                        notes: notes || null,
                      },
                    });
                  } else {
                    await upsertT({
                      data: {
                        id: s?.id,
                        member_id: member.id,
                        day_of_week: data.day_of_week!,
                        start_time: start, end_time: end,
                        slot_kind: slotKind,
                        label: label || null,
                        notes: notes || null,
                      },
                    });
                  }
                  toast.success("Guardado");
                  onSaved();
                } catch (e: any) { toast.error(e?.message ?? "Error"); }
              }}
            >Guardar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({
  member,
  date,
  status,
  onClose,
  onSaved,
}: {
  member: Member;
  date: string;
  status?: DayStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(upsertDayStatus);
  const [state, setState] = useState<DayStatus["state"]>(status?.state ?? "normal");
  const [overtime, setOvertime] = useState(String(status?.overtime_hours ?? 0));
  const [override, setOverride] = useState(status?.use_day_override ?? false);
  const [notes, setNotes] = useState(status?.notes ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estado del día · {date}</DialogTitle>
          <DialogDescription>Marca vacaciones, festivos o ajusta las horas reales del día.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Estado</Label>
            <Select value={state} onValueChange={(v: any) => setState(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="vacation">Vacaciones</SelectItem>
                <SelectItem value="holiday">Festivo</SelectItem>
                <SelectItem value="sick">Baja</SelectItem>
                <SelectItem value="off">Libre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Ajuste de horas reales</Label>
            <Input type="number" step="0.25" value={overtime} onChange={(e) => setOvertime(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Usa positivo si trabajaste más de lo previsto y negativo si saliste antes. Ejemplo: 10h previstas y ajuste -1 = 9h reales.
            </p>
          </div>
          <div className="flex items-center justify-between rounded border p-2">
            <div>
              <div className="text-sm font-medium">Este día no sigue la plantilla</div>
              <div className="text-xs text-muted-foreground">Aunque no tenga franjas concretas.</div>
            </div>
            <Switch checked={override} onCheckedChange={setOverride} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={async () => {
              try {
                await save({
                  data: {
                    member_id: member.id,
                    date,
                    state,
                    overtime_hours: Number(overtime) || 0,
                    use_day_override: override,
                    notes: notes || null,
                  },
                });
                toast.success("Guardado");
                onSaved();
              } catch (e: any) { toast.error(e?.message ?? "Error"); }
            }}
          >Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
