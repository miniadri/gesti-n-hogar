import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  ShoppingCart,
  ListTodo,
  Calendar,
  CalendarDays,
  Wallet,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Sparkles,
  Pill,
  AlertTriangle,
  Check,
  Clock3,
  X,
  Lightbulb,
  Thermometer,
  Shield,
  Power,
  Activity,
  Star,
  PackageOpen,
  SlidersHorizontal,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client-app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getPrepAheadForTomorrow } from "@/lib/meal-plan.functions";
import { listMedicines } from "@/lib/medicines.functions";
import { listInventory } from "@/lib/inventory.functions";
import { listMedications, recordIntake, snoozeIntake } from "@/lib/medications.functions";
import { listDevices, updateDevice } from "@/lib/devices.functions";
import { callHomeAssistantService } from "@/lib/home-assistant.functions";
import { cn } from "@/lib/utils";
import { SosButton } from "@/components/SosButton";
import {
  CalendarTodayTomorrowCard,
  ScheduleTodayTomorrowCard,
  SummaryCard,
} from "@/components/dashboard/DashboardCards";
import {
  addDays,
  buildScheduleUpcoming,
  dateKey,
  formatTime,
  slotCrossesMidnight,
  splitEventsUpcoming,
  startOfLocalDay,
  WORK_SLOT_KINDS,
} from "@/lib/dashboard-utils";



const MONTHLY_BUDGET = 1000;
const DASHBOARD_PREFS_KEY = "homesync.dashboard.sections.v2";

type DashboardSectionKey =
  | "summary"
  | "calendar"
  | "schedule"
  | "prep"
  | "medications"
  | "devices"
  | "pharmacy"
  | "expiry"
  | "tasks"
  | "inventory";

const DEFAULT_SECTION_ORDER: DashboardSectionKey[] = [
  "summary",
  "calendar",
  "schedule",
  "medications",
  "devices",
  "prep",
  "pharmacy",
  "expiry",
  "tasks",
  "inventory",
];
const SECTION_LABELS: Record<DashboardSectionKey, string> = {
  summary: "Resumen",
  calendar: "Calendario hoy/mañana",
  schedule: "Cuadrante hoy/mañana",
  prep: "Adelanta para mañana",
  medications: "Próxima toma",
  devices: "Accesos rápidos",
  pharmacy: "Farmacia",
  expiry: "Caducidad próxima",
  tasks: "Tareas",
  inventory: "Inventario bajo",
};


const dashboardQueryOptions = queryOptions({
  queryKey: ["dashboard"],
  queryFn: async () => {
    const householdId = (await supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const user = (await supabase.auth.getUser()).data.user;
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const afterTomorrow = addDays(todayStart, 2);
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [{ data: tasks }, { data: shopping }, { data: events }, { data: expenses }, { data: agendaEvents }, { data: members }] =
      await Promise.all([
        supabase.from("tasks").select("*").eq("household_id", householdId).eq("status", "pending").limit(5),
        supabase
          .from("shopping_list_items")
          .select("*, shopping_list:shopping_list_id(store_id, name)")
          .eq("checked", false)
          .limit(5),
        supabase
          .from("calendar_events")
          .select("*")
          .eq("household_id", householdId)
          .gte("start_at", new Date().toISOString())
          .order("start_at", { ascending: true })
          .limit(5),
        supabase
          .from("expenses")
          .select("*")
          .eq("household_id", householdId)
          .gte("date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
          .limit(5),
        supabase
          .from("calendar_events")
          .select("*")
          .eq("household_id", householdId)
          .gte("start_at", now.toISOString())
          .lt("start_at", next24h.toISOString())
          .order("start_at", { ascending: true }),
        supabase
          .from("household_members")
          .select("id, display_name, is_child, user_id")
          .eq("household_id", householdId),
      ]);

    let schedule: any = null;
    const memberIds = (members ?? []).map((member: any) => member.id);
    if (memberIds.length > 0) {
      const yesterday = addDays(todayStart, -1);
      const [settingsRes, templateRes, daySlotsRes, statusRes] = await Promise.all([
        supabase.from("schedule_settings").select("*").in("member_id", memberIds),
        supabase.from("schedule_template_slots").select("*").in("member_id", memberIds).order("day_of_week").order("start_time"),
        supabase
          .from("schedule_day_slots")
          .select("*")
          .in("member_id", memberIds)
          .gte("date", dateKey(yesterday))
          .lte("date", dateKey(afterTomorrow))
          .order("date")
          .order("start_time"),
        supabase
          .from("schedule_day_status")
          .select("*")
          .in("member_id", memberIds)
          .gte("date", dateKey(yesterday))
          .lte("date", dateKey(afterTomorrow)),
      ]);
      schedule = {
        members: members ?? [],
        currentUserId: user?.id ?? null,
        settings: settingsRes.data ?? [],
        template: templateRes.data ?? [],
        daySlots: daySlotsRes.data ?? [],
        status: statusRes.data ?? [],
      };
    }

    return {
      tasks: tasks ?? [],
      shopping: shopping ?? [],
      events: events ?? [],
      expenses: expenses ?? [],
      agendaEvents: agendaEvents ?? [],
      schedule,
      householdId,
    };
  },
});

const prepAheadQO = queryOptions({
  queryKey: ["prep-ahead-tomorrow"],
  queryFn: () => getPrepAheadForTomorrow(),
});

const medicinesQO = queryOptions({
  queryKey: ["medicines"],
  queryFn: () => listMedicines(),
});

const inventoryQO = queryOptions({
  queryKey: ["inventory"],
  queryFn: () => listInventory(),
});

const medicationsQO = queryOptions({
  queryKey: ["medications"],
  queryFn: () => listMedications(),
});

const devicesQO = queryOptions({
  queryKey: ["devices"],
  queryFn: () => listDevices(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(dashboardQueryOptions),
      context.queryClient.ensureQueryData(prepAheadQO),
      context.queryClient.ensureQueryData(medicinesQO),
      context.queryClient.ensureQueryData(inventoryQO),
      context.queryClient.ensureQueryData(medicationsQO),
      context.queryClient.ensureQueryData(devicesQO),
    ]),
  head: () => ({
    meta: [{ title: "Dashboard - HomeSync" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useSuspenseQuery(dashboardQueryOptions);
  const { data: prepAhead } = useSuspenseQuery(prepAheadQO);
  const { data: medicines } = useSuspenseQuery(medicinesQO);
  const { data: inventory } = useSuspenseQuery(inventoryQO);
  const { data: medications } = useSuspenseQuery(medicationsQO);
  const { data: devices } = useSuspenseQuery(devicesQO);
  const queryClient = useQueryClient();
  const doRecord = useServerFn(recordIntake);
  const doSnooze = useServerFn(snoozeIntake);
  const doUpdateDevice = useServerFn(updateDevice);
  const doCallHa = useServerFn(callHomeAssistantService);
  const pharmacyToBuy = medicines.filter((m: any) => m.needs_purchase);


  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const soonThreshold = new Date(todayMidnight);
  soonThreshold.setDate(soonThreshold.getDate() + 7);

  const expiringFoods = inventory
    .filter((i: any) => i.expiry_date)
    .map((i: any) => ({ ...i, _expiry: new Date(i.expiry_date) }))
    .filter((i: any) => i._expiry <= soonThreshold)
    .sort((a: any, b: any) => a._expiry.getTime() - b._expiry.getTime());

  const expiringMeds = medicines
    .filter((m: any) => m.expiry_year && m.expiry_month)
    .map((m: any) => ({
      ...m,
      _expiry: new Date(m.expiry_year, m.expiry_month, 0), // last day of month
    }))
    .filter((m: any) => m._expiry <= soonThreshold)
    .sort((a: any, b: any) => a._expiry.getTime() - b._expiry.getTime());

  const totalExpenses = data.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const urgentTasks = data.tasks.filter((t) => t.priority === "high");

  // Nearest pending medication intake per member (only next one per person)
  const nowMs = Date.now();
  const nextIntakePerMember = new Map<string, any>();
  for (const med of (medications ?? []) as any[]) {
    const memberId: string | undefined = med.member_id;
    if (!memberId) continue;
    for (const intake of (med.medication_intakes ?? []) as any[]) {
      if (intake.status !== "pending") continue;
      const t = new Date(intake.scheduled_for).getTime();
      // include past-due pending as well (they are the most urgent)
      const enriched = { ...intake, medication: med };
      const current = nextIntakePerMember.get(memberId);
      if (!current || t < new Date(current.scheduled_for).getTime()) {
        nextIntakePerMember.set(memberId, enriched);
      }
      // We keep the earliest scheduled_for; a past-due entry (smallest t) wins naturally.
      // Limit lookahead — ignore intakes scheduled more than 24h from now.
      if (t - nowMs > 24 * 60 * 60 * 1000) {
        // still allow tracking, but if a closer one exists it will replace it above
      }
    }
  }
  const nextIntakes = Array.from(nextIntakePerMember.values())
    .filter((i: any) => new Date(i.scheduled_for).getTime() - nowMs < 24 * 60 * 60 * 1000)
    .sort((a: any, b: any) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());

  // Low-stock inventory items (only when a min_stock is set)
  const lowStockItems = (inventory as any[])
    .filter((i) => Number(i.min_stock) > 0 && Number(i.quantity) <= Number(i.min_stock))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity));

  // Quick-access devices (pinned)
  const quickDevices = (devices as any[])
    .filter((d) => d.quick_access && !d.hidden)
    .slice(0, 5);

  const agendaEvents = splitEventsUpcoming(data.agendaEvents);
  const scheduleDays = buildScheduleUpcoming(data.schedule);
  const [sectionPrefs, setSectionPrefs] = useState(() => loadDashboardPrefs());
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    saveDashboardPrefs(sectionPrefs);
  }, [sectionPrefs]);

  const moveSection = (key: DashboardSectionKey, direction: -1 | 1) => {
    setSectionPrefs((prev) => {
      const order = [...prev.order];
      const idx = order.indexOf(key);
      const nextIdx = idx + direction;
      if (idx < 0 || nextIdx < 0 || nextIdx >= order.length) return prev;
      [order[idx], order[nextIdx]] = [order[nextIdx], order[idx]];
      return { ...prev, order };
    });
  };

  const toggleSection = (key: DashboardSectionKey) => {
    setSectionPrefs((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(key) ? prev.hidden.filter((item) => item !== key) : [...prev.hidden, key],
    }));
  };

  const handleRecord = async (intake: any, status: string) => {
    try {
      await doRecord({ data: { intake_id: intake.id, status } });
      toast.success(status === "taken" ? "Toma confirmada" : "Toma omitida");
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    } catch (err: any) {
      toast.error(err.message || "Error al registrar");
    }
  };
  const handleSnooze = async (intake: any, minutes = 10) => {
    try {
      await doSnooze({ data: { intake_id: intake.id, minutes } });
      toast.success(`Pospuesto ${minutes} min`);
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    } catch (err: any) {
      toast.error(err.message || "Error al posponer");
    }
  };

  const toggleQuickDevice = async (device: any) => {
    const nextStatus = device.status === "on" ? "off" : "on";
    try {
      if (device.external_source === "home_assistant") {
        const domain = device.domain ?? String(device.external_id ?? "").split(".")[0];
        const turnOn = device.status !== "on";
        let service = turnOn ? "turn_on" : "turn_off";
        if (domain === "cover") service = turnOn ? "open_cover" : "close_cover";
        if (domain === "media_player") service = turnOn ? "media_play" : "media_pause";
        await doCallHa({ data: { entity_id: device.external_id, service } });
      } else {
        await doUpdateDevice({ data: { id: device.id, status: nextStatus } });
      }
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error al enviar comando");
    }
  };

  const dashboardSections = useMemo(() => {
    type DashboardSection = {
      key: DashboardSectionKey;
      title: string;
      visible: boolean;
      size: "full" | "half" | "third";
      node: ReactNode;
    };

    const byKey: Record<DashboardSectionKey, DashboardSection> = {
      summary: {
        key: "summary",
        title: SECTION_LABELS.summary,
        visible: data.shopping.length > 0 || data.events.length > 0 || totalExpenses > 0,
        size: "full",
        node: (
          <div className="grid auto-rows-fr items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard
              title="Por comprar"
              value={data.shopping.length}
              icon={ShoppingCart}
              href="/shopping"
              color="text-chart-1"
            />
            <SummaryCard
              title="Próximos eventos"
              value={data.events.length}
              icon={Calendar}
              href="/calendar"
              color="text-chart-2"
            />
            <Link to="/finances" className="block h-full">
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardContent className="flex h-full items-center gap-4 p-5">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary">
                    <Wallet className="h-5 w-5 text-chart-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-muted-foreground">Gastos y presupuesto</p>
                    <p className="text-2xl font-bold">€{totalExpenses.toFixed(2)}</p>
                    <Progress value={Math.min((totalExpenses / MONTHLY_BUDGET) * 100, 100)} className="mt-2 h-1.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        ),
      },
      calendar: {
        key: "calendar",
        title: SECTION_LABELS.calendar,
        visible: agendaEvents.today.length > 0 || agendaEvents.tomorrow.length > 0,
        size: "half",
        node: <CalendarTodayTomorrowCard today={agendaEvents.today} tomorrow={agendaEvents.tomorrow} />,
      },
      schedule: {
        key: "schedule",
        title: SECTION_LABELS.schedule,
        visible: scheduleDays.length > 0,
        size: "half",
        node: <ScheduleTodayTomorrowCard days={scheduleDays} />,
      },
      prep: {
        key: "prep",
        title: SECTION_LABELS.prep,
        visible: prepAhead.length > 0,
        size: "full",
        node: (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Adelanta para mañana
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/recipes/planner">Ver planner</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {prepAhead.map((s: any) => (
                <div key={s.id} className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.recipes?.title}
                  </p>
                  <p className="mt-1 text-sm">{s.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ),
      },
      medications: {
        key: "medications",
        title: SECTION_LABELS.medications,
        visible: nextIntakes.length > 0,
        size: "full",
        node: (
          <Card className="border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Pill className="h-4 w-4 text-primary" />
                Próxima toma
              </CardTitle>
              <div className="flex items-center gap-2">
                <SosButton variant="compact" />
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/medications">Ver medicación</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {nextIntakes.map((intake: any) => {
                const when = new Date(intake.scheduled_for);
                const overdue = when.getTime() < nowMs;
                const memberName = intake.medication.household_members?.display_name ?? "Miembro";
                return (
                  <div
                    key={intake.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border bg-card p-3",
                      overdue && "border-amber-500/50 bg-amber-500/5",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {memberName} · {intake.medication.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {intake.medication.dose_amount} {intake.medication.unit} ·{" "}
                        {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {overdue && " · vencida"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" title="Posponer 10 min" onClick={() => handleSnooze(intake, 10)}>
                        <Clock3 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" title="Omitir" onClick={() => handleRecord(intake, "skipped")}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" title="Confirmar" onClick={() => handleRecord(intake, "taken")}>
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ),
      },
      devices: {
        key: "devices",
        title: SECTION_LABELS.devices,
        visible: quickDevices.length > 0,
        size: "full",
        node: (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-amber-500" />
                Accesos rápidos
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/devices" search={{ panel: 1 } as any}>Panel</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/devices" search={{ panel: 0 }}>Gestionar</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quickDevices.map((d: any) => {
                  const isSensor = d.type === "sensor" || d.domain === "sensor" || d.domain === "binary_sensor";
                  const Icon = isSensor
                    ? Activity
                    : d.type === "light"
                      ? Lightbulb
                      : d.type === "thermostat"
                        ? Thermometer
                        : d.type === "security"
                          ? Shield
                          : Power;
                  const attrs = d.attributes ?? {};
                  const stateLabel = isSensor
                    ? `${attrs.state ?? "-"}${attrs.unit_of_measurement ? ` ${attrs.unit_of_measurement}` : ""}`
                    : d.status === "on"
                      ? "Encendido"
                      : "Apagado";
                  return (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
                            d.status === "on" ? "bg-primary text-primary-foreground" : "bg-secondary",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{stateLabel}</p>
                        </div>
                      </div>
                      {!isSensor && (
                        <Button size="sm" variant="outline" onClick={() => toggleQuickDevice(d)}>
                          {d.status === "on" ? "Apagar" : "Encender"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ),
      },
      pharmacy: {
        key: "pharmacy",
        title: SECTION_LABELS.pharmacy,
        visible: pharmacyToBuy.length > 0,
        size: "half",
        node: (
          <Card className="border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base uppercase tracking-wide">
                <Pill className="h-4 w-4 text-primary" />
                Farmacia
                <Badge variant="secondary" className="ml-2">{pharmacyToBuy.length}</Badge>
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/shopping">Ver lista</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {pharmacyToBuy.slice(0, 8).map((m: any) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-3 py-1 text-xs">
                    <Pill className="h-3 w-3" />
                    {m.name}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      },
      expiry: {
        key: "expiry",
        title: SECTION_LABELS.expiry,
        visible: expiringFoods.length > 0 || expiringMeds.length > 0,
        size: "half",
        node: (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Caducidad próxima
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/inventory">Abrir inventario</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {expiringFoods.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Alimentos ({expiringFoods.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {expiringFoods.slice(0, 8).map((i: any) => (
                      <Link
                        key={i.id}
                        to="/inventory"
                        className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs hover:bg-accent"
                      >
                        {i.name}
                        <span className="text-muted-foreground">
                          · {i._expiry.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {expiringMeds.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Medicinas ({expiringMeds.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {expiringMeds.slice(0, 8).map((m: any) => (
                      <Link
                        key={m.id}
                        to="/inventory"
                        className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs hover:bg-accent"
                      >
                        <Pill className="h-3 w-3" />
                        {m.name}
                        <span className="text-muted-foreground">
                          · {String(m.expiry_month).padStart(2, "0")}/{m.expiry_year}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ),
      },
      tasks: {
        key: "tasks",
        title: SECTION_LABELS.tasks,
        visible: data.tasks.length > 0,
        size: "third",
        node: (
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Tareas</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tasks">Ver todas</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-chart-4" />
                <span className="text-sm text-muted-foreground">
                  {data.tasks.length} pendientes
                  {urgentTasks.length > 0 && ` · ${urgentTasks.length} urgentes`}
                </span>
              </div>
              {data.tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay tareas pendientes.</p>
              )}
              {data.tasks.slice(0, 4).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.due_date ? new Date(task.due_date).toLocaleDateString("es-ES") : "Sin fecha"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </CardContent>
          </Card>
        ),
      },
      inventory: {
        key: "inventory",
        title: SECTION_LABELS.inventory,
        visible: lowStockItems.length > 0 || expiringFoods.length > 0,
        size: "third",
        node: (
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Inventario bajo</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/inventory">Ver</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {lowStockItems.length === 0 && expiringFoods.length === 0 && (
                <p className="text-sm text-muted-foreground">Todo en orden por ahora.</p>
              )}
              {lowStockItems.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <PackageOpen className="h-3.5 w-3.5" />
                    Stock mínimo ({lowStockItems.length})
                  </p>
                  <div className="space-y-1.5">
                    {lowStockItems.slice(0, 5).map((i: any) => (
                      <div key={i.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                        <span className="truncate">{i.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {Number(i.quantity)}/{Number(i.min_stock)} {i.unit || "ud."}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expiringFoods.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Caducidad próxima ({expiringFoods.length})
                  </p>
                  <div className="space-y-1.5">
                    {expiringFoods.slice(0, 5).map((i: any) => (
                      <div key={i.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                        <span className="truncate">{i.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {i._expiry.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ),
      },
    };

    return sectionPrefs.order
      .map((key) => byKey[key])
      .filter((section): section is DashboardSection => Boolean(section) && section.visible && !sectionPrefs.hidden.includes(section.key));
  }, [
    agendaEvents,
    data.events.length,
    data.schedule,
    data.shopping.length,
    expiringFoods,
    expiringMeds,
    lowStockItems,
    nextIntakes,
    nowMs,
    pharmacyToBuy,
    prepAhead,
    quickDevices,
    scheduleDays,
    sectionPrefs,
    totalExpenses,
    urgentTasks.length,
  ]);


  return (
    <div className="space-y-6">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Buenos días</h2>
          <p className="text-muted-foreground">Resumen de tu hogar hoy</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setCustomizing((value) => !value)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Personalizar
          </Button>
          <SosButton variant="compact" />
        </div>
      </section>

      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Las tarjetas sin información relevante se ocultan automáticamente. Si no has ocultado una tarjeta manualmente,
        volverá a aparecer cuando tenga algo importante que mostrar.
      </div>

      {customizing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ajustar dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sectionPrefs.order.map((key) => {
              const hidden = sectionPrefs.hidden.includes(key);
              const liveSection = dashboardSections.find((section) => section.key === key);
              return (
                <div key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{SECTION_LABELS[key]}</p>
                    <p className="text-xs text-muted-foreground">
                      {hidden ? "Oculto por usuario" : liveSection ? "Visible ahora" : "Se mostrará cuando tenga contenido"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="icon" onClick={() => moveSection(key, -1)} title="Subir">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => moveSection(key, 1)} title="Bajar">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant={hidden ? "secondary" : "outline"} size="icon" onClick={() => toggleSection(key)} title={hidden ? "Mostrar" : "Ocultar"}>
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {dashboardSections.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-6">
          {dashboardSections.map((section) => (
            <div
              key={section.key}
              className={cn(
                section.size === "full" && "lg:col-span-6",
                section.size === "half" && "lg:col-span-3",
                section.size === "third" && "lg:col-span-2",
              )}
            >
              {section.node}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function loadDashboardPrefs(): { order: DashboardSectionKey[]; hidden: DashboardSectionKey[] } {
  if (typeof window === "undefined") return { order: DEFAULT_SECTION_ORDER, hidden: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DASHBOARD_PREFS_KEY) || "");
    const order = Array.isArray(parsed?.order)
      ? [
          ...parsed.order.filter((key: string) => DEFAULT_SECTION_ORDER.includes(key as DashboardSectionKey)),
          ...DEFAULT_SECTION_ORDER.filter((key) => !parsed.order.includes(key)),
        ]
      : DEFAULT_SECTION_ORDER;
    const hidden = Array.isArray(parsed?.hidden)
      ? parsed.hidden.filter((key: string) => DEFAULT_SECTION_ORDER.includes(key as DashboardSectionKey))
      : [];
    return { order, hidden };
  } catch {
    return { order: DEFAULT_SECTION_ORDER, hidden: [] };
  }
}

function saveDashboardPrefs(value: { order: DashboardSectionKey[]; hidden: DashboardSectionKey[] }) {
  try {
    window.localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(value));
  } catch {
    // Local dashboard preference only.
  }
}

