import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pill,
  Clock,
  Calendar,
  AlertCircle,
  Check,
  X,
  ChevronRight,
  ShoppingCart,
  History,
  Bell,
  Clock3,

} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { listMedications, createMedication, updateMedication, deleteMedication, recordIntake, snoozeIntake } from "@/lib/medications.functions";
import { listMedicines } from "@/lib/medicines.functions";
import { createShoppingItem } from "@/lib/shopping.functions";

const medicationsQueryOptions = queryOptions({
  queryKey: ["medications"],
  queryFn: () => listMedications(),
});

const householdQueryOptions = queryOptions({
  queryKey: ["household"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("households")
      .select("*, household_members(*)")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/medications")({
  head: () => ({
    meta: [{ title: "Medicación — HomeSync" }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(medicationsQueryOptions);
    await context.queryClient.ensureQueryData(householdQueryOptions);
  },
  component: MedicationsPage,
});

const FORMS = [
  { value: "pill", label: "Pastilla(s)" },
  { value: "ml", label: "Mililitros" },
  { value: "drops", label: "Gotas" },
  { value: "inhaler", label: "Inhalación" },
  { value: "patch", label: "Parche" },
  { value: "injection", label: "Inyección" },
  { value: "other", label: "Otro" },
];

const WEEKDAYS = [
  { value: 1, label: "L" },
  { value: 2, label: "M" },
  { value: 3, label: "X" },
  { value: 4, label: "J" },
  { value: 5, label: "V" },
  { value: 6, label: "S" },
  { value: 0, label: "D" },
];

function MedicationsPage() {
  const { t } = useTranslation();
  const { data: medications } = useSuspenseQuery(medicationsQueryOptions);
  const { data: household } = useSuspenseQuery(householdQueryOptions);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const doCreate = useServerFn(createMedication);
  const doUpdate = useServerFn(updateMedication);
  const doDelete = useServerFn(deleteMedication);
  const doRecord = useServerFn(recordIntake);
  const doSnooze = useServerFn(snoozeIntake);
  const doAddShopping = useServerFn(createShoppingItem);


  const members = (household?.household_members ?? []).sort((a: any, b: any) => (a.is_child === b.is_child ? 0 : a.is_child ? 1 : -1));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const todayIntakes = (medications ?? [])
    .flatMap((m: any) =>
      (m.medication_intakes ?? [])
        .filter((i: any) => i.scheduled_for >= todayStart && i.scheduled_for < todayEnd)
        .map((i: any) => ({ ...i, medication: m })),
    )
    .sort((a: any, b: any) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());

  const pendingToday = todayIntakes.filter((i: any) => i.status === "pending");
  const lowStockMeds = (medications ?? []).filter((m: any) => {
    if (m.low_stock_threshold == null || m.current_quantity == null) return false;
    return m.current_quantity <= m.low_stock_threshold;
  });

  const handleSave = async (payload: any) => {
    try {
      if (editing) {
        await doUpdate({ data: { ...payload, id: editing.id } });
        toast.success("Medicación actualizada");
      } else {
        await doCreate({ data: payload });
        toast.success("Medicación añadida");
      }
      queryClient.invalidateQueries({ queryKey: ["medications"] });
      setDialogOpen(false);
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    }
  };

  const handleDelete = async (med: any) => {
    try {
      await doDelete({ data: { id: med.id } });
      toast.success("Medicación eliminada");
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    }
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
      toast.success(`Recordatorio pospuesto ${minutes} min`);
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    } catch (err: any) {
      toast.error(err.message || "Error al posponer");
    }
  };


  const handleAddToShopping = async (med: any) => {
    try {
      await doAddShopping({
        data: {
          name: med.name,
          quantity: Math.ceil((med.low_stock_threshold ?? 1) * 2),
          store_id: null,
          category: "FARMACIA",
        },
      });
      toast.success("Añadido a la lista de compra");
      queryClient.invalidateQueries({ queryKey: ["shopping-items"] });
    } catch (err: any) {
      toast.error(err.message || "Error al añadir");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("medications.title")}</h2>
          <p className="text-muted-foreground">{t("medications.subtitle")}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("medications.add")}
        </Button>
      </div>

      {pendingToday.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-amber-500" />
              Toma(s) pendiente(s) hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingToday.map((intake: any) => (
              <div
                key={intake.id}
                className="flex items-center justify-between rounded-lg border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {intake.medication.name} · {intake.medication.dose_amount} {intake.medication.unit}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {intake.medication.household_members?.display_name} ·{" "}
                    {new Date(intake.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" title="Posponer 10 min" onClick={() => handleSnooze(intake, 10)}>
                    <Clock3 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" title="Omitir toma" onClick={() => handleRecord(intake, "skipped")}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button size="sm" title="Confirmar toma" onClick={() => handleRecord(intake, "taken")}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>

              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Activas</TabsTrigger>
          <TabsTrigger value="history">{t("medications.history")}</TabsTrigger>
          <TabsTrigger value="stock">{t("medications.lowStock")}</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {(medications ?? []).length === 0 && (
            <EmptyState
              icon={Pill}
              title="Sin medicación registrada"
              description="Añade la primera medicación para empezar a recibir recordatorios."
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("medications.add")}
                </Button>
              }
            />
          )}
          {members.map((member: any) => {
            const memberMeds = (medications ?? []).filter((m: any) => m.member_id === member.id);
            if (memberMeds.length === 0) return null;
            return (
              <div key={member.id} className="space-y-3">
                <h3 className="font-semibold text-muted-foreground">{member.display_name}</h3>
                {memberMeds.map((med: any) => (
                  <MedicationCard
                    key={med.id}
                    med={med}
                    member={member}
                    onEdit={() => {
                      setEditing(med);
                      setDialogOpen(true);
                    }}
                    onDelete={() => handleDelete(med)}
                    onRecord={handleRecord}
                    onSnooze={handleSnooze}

                  />
                ))}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <HistoryView medications={medications ?? []} />
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          {lowStockMeds.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title="No hay medicamentos con stock bajo"
              description="Los medicamentos que actualmente se estén tomando y que estén con stock por debajo del umbral aparecerán aquí."
            />
          ) : (
            lowStockMeds.map((med: any) => (
              <Card key={med.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{med.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Quedan {med.current_quantity} {med.unit} (umbral: {med.low_stock_threshold})
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAddToShopping(med)}>
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    {t("medications.addToShopping")}
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <MedicationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        members={members}
        medications={medications}
        onSave={handleSave}
      />
    </div>
  );
}

function MedicationCard({
  med,
  member,
  onEdit,
  onDelete,
  onRecord,
  onSnooze,
}: {
  med: any;
  member: any;
  onEdit: () => void;
  onDelete: () => void;
  onRecord: (intake: any, status: string) => void;
  onSnooze: (intake: any, minutes?: number) => void;
}) {

  const today = new Date().toISOString().split("T")[0];
  const todayIntakes = (med.medication_intakes ?? [])
    .filter((i: any) => i.scheduled_for.startsWith(today))
    .sort((a: any, b: any) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" />
              <p className="font-semibold">{med.name}</p>
              {!med.reminders_enabled && (
                <Badge variant="secondary" className="text-[10px]">
                  Silenciado
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {med.dose_amount} {med.unit} · {FORMS.find((f) => f.value === med.form)?.label}
            </p>
            {med.current_quantity != null && med.total_quantity != null && (
              <p className="text-xs text-muted-foreground">
                Stock: {med.current_quantity} / {med.total_quantity} {med.unit}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {(med.medication_schedules ?? [])
                .filter((s: any) => s.active)
                .map((s: any) => (
                  <Badge key={s.id} variant="outline" className="text-[10px]">
                    <Clock className="mr-1 h-3 w-3" />
                    {s.time_of_day}
                    {s.frequency_type === "interval" && s.interval_hours ? ` (cada ${s.interval_hours}h)` : ""}
                  </Badge>
                ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit}>
              <span className="sr-only">Editar</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </Button>
            <Button size="icon" variant="ghost" className="text-destructive" onClick={onDelete}>
              <span className="sr-only">Eliminar</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
          </div>
        </div>

        {todayIntakes.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Hoy</p>
            <div className="flex flex-wrap gap-2">
              {todayIntakes.map((intake: any) => (
                <div
                  key={intake.id}
                  className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                >
                  {new Date(intake.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {intake.status === "pending" ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-5 w-5" title="Confirmar" onClick={() => onRecord(intake, "taken")}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5" title="Posponer 10 min" onClick={() => onSnooze(intake, 10)}>
                        <Clock3 className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5" title="Omitir" onClick={() => onRecord(intake, "skipped")}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>

                  ) : intake.status === "taken" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <X className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MedicationDialog({
  open,
  onOpenChange,
  editing,
  members,
  medications,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any;
  members: any[];
  medications: any[];
  onSave: (payload: any) => void;
}) {
  const { t } = useTranslation();
  const { data: medicines = [] } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => listMedicines(),
    enabled: open,
  });
  const [name, setName] = useState("");
  const [form, setForm] = useState("pill");
  const [dose, setDose] = useState("1");
  const [unit, setUnit] = useState("pastilla");
  const [totalQty, setTotalQty] = useState("");
  const [currentQty, setCurrentQty] = useState("");
  const [threshold, setThreshold] = useState("");
  const [memberId, setMemberId] = useState("");
  const [reminders, setReminders] = useState(true);
  const [notes, setNotes] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [schedules, setSchedules] = useState<any[]>([{ time_of_day: "09:00", days_of_week: [1, 2, 3, 4, 5, 6, 0], frequency_type: "daily", interval_hours: 8, active: true }]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setForm(editing.form);
      setDose(String(editing.dose_amount));
      setUnit(editing.unit);
      setTotalQty(editing.total_quantity != null ? String(editing.total_quantity) : "");
      setCurrentQty(editing.current_quantity != null ? String(editing.current_quantity) : "");
      setThreshold(editing.low_stock_threshold != null ? String(editing.low_stock_threshold) : "");
      setMemberId(editing.member_id);
      setReminders(editing.reminders_enabled);
      setNotes(editing.notes || "");
      // Prefill expiry from matching medicine in inventory
      const match = (medicines ?? []).find(
        (m: any) => m.name.toLowerCase() === (editing.name || "").toLowerCase(),
      );
      setExpiryMonth(match?.expiry_month != null ? String(match.expiry_month) : "");
      setExpiryYear(match?.expiry_year != null ? String(match.expiry_year) : "");
      setSchedules(
        (editing.medication_schedules ?? []).map((s: any) => ({
          id: s.id,
          time_of_day: s.time_of_day,
          days_of_week: s.days_of_week ?? [1, 2, 3, 4, 5, 6, 0],
          frequency_type: s.frequency_type,
          interval_hours: s.interval_hours ?? 8,
          active: s.active,
        })),
      );
    } else {
      setName("");
      setForm("pill");
      setDose("1");
      setUnit("pastilla");
      setTotalQty("");
      setCurrentQty("");
      setThreshold("");
      setMemberId(members[0]?.id || "");
      setReminders(true);
      setNotes("");
      setExpiryMonth("");
      setExpiryYear("");
      setSchedules([{ time_of_day: "09:00", days_of_week: [1, 2, 3, 4, 5, 6, 0], frequency_type: "daily", interval_hours: 8, active: true }]);
    }
  }, [editing, members, medicines]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      member_id: memberId,
      name,
      form,
      dose_amount: Number(dose) || 1,
      unit,
      total_quantity: totalQty ? Number(totalQty) : undefined,
      current_quantity: currentQty ? Number(currentQty) : undefined,
      low_stock_threshold: threshold ? Number(threshold) : undefined,
      reminders_enabled: reminders,
      notes,
      expiry_month: expiryMonth ? Number(expiryMonth) : null,
      expiry_year: expiryYear ? Number(expiryYear) : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      schedules,
    });

  };

  const updateSchedule = (idx: number, patch: any) => {
    setSchedules((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const toggleDay = (idx: number, day: number) => {
    setSchedules((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const days = new Set<number>(s.days_of_week);
        if (days.has(day)) days.delete(day);
        else days.add(day);
        return { ...s, days_of_week: Array.from(days).sort((a: number, b: number) => a - b) };
      }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar medicación" : t("medications.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("medications.patient")}</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("medications.name")}</Label>
              <MedicineNameSearch
                value={name}
                onChange={setName}
                medicines={medicines}
                medications={medications}
                disabled={!!editing}
                onPickMedication={(m: any) => {
                  setName(m.name);
                  setForm(m.form);
                  setDose(String(m.dose_amount));
                  setUnit(m.unit);
                  if (m.total_quantity != null) setTotalQty(String(m.total_quantity));
                  if (m.current_quantity != null) setCurrentQty(String(m.current_quantity));
                  if (m.low_stock_threshold != null) setThreshold(String(m.low_stock_threshold));
                  if (m.notes) setNotes(m.notes);
                }}
                onPickMedicine={(m: any) => {
                  setName(m.name);
                  if (m.expiry_month != null) setExpiryMonth(String(m.expiry_month));
                  if (m.expiry_year != null) setExpiryYear(String(m.expiry_year));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("medications.form")}</Label>
              <Select value={form} onValueChange={setForm}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("medications.dose")}</Label>
              <Input type="number" step="0.01" value={dose} onChange={(e) => setDose(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t("medications.unit")}</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("medications.totalStock")}</Label>
              <Input type="number" step="0.01" value={totalQty} onChange={(e) => setTotalQty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("medications.stock")}</Label>
              <Input type="number" step="0.01" value={currentQty} onChange={(e) => setCurrentQty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("medications.lowStockThreshold")}</Label>
              <Input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("medications.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="reminders" className="cursor-pointer">
              {t("medications.reminders")}
            </Label>
            <Switch id="reminders" checked={reminders} onCheckedChange={setReminders} />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("medications.schedules")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSchedules([
                    ...schedules,
                    { time_of_day: "09:00", days_of_week: [1, 2, 3, 4, 5, 6, 0], frequency_type: "daily", interval_hours: 8, active: true },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                {t("medications.addSchedule")}
              </Button>
            </div>
            {schedules.map((s, idx) => (
              <div key={idx} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={s.time_of_day}
                    onChange={(e) => updateSchedule(idx, { time_of_day: e.target.value })}
                    className="w-28"
                  />
                  <Select
                    value={s.frequency_type}
                    onValueChange={(v) => updateSchedule(idx, { frequency_type: v })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">{t("medications.daily")}</SelectItem>
                      <SelectItem value="interval">{t("medications.interval")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {s.frequency_type === "interval" && (
                    <Input
                      type="number"
                      step="0.25"
                      min="0.25"
                      value={s.interval_hours}
                      onChange={(e) => updateSchedule(idx, { interval_hours: Number(e.target.value) })}
                      className="w-24"
                      placeholder="h"
                    />

                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => setSchedules(schedules.filter((_, i) => i !== idx))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(idx, d.value)}
                      className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${
                        s.days_of_week.includes(d.value)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryView({ medications }: { medications: any[] }) {
  const allIntakes = medications
    .flatMap((m) => (m.medication_intakes ?? []).map((i: any) => ({ ...i, medication: m })))
    .filter((i) => i.status !== "pending")
    .sort((a, b) => new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime())
    .slice(0, 50);

  if (allIntakes.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Sin historial"
        description="Las tomas confirmadas, omitidas o no tomadas aparecerán aquí."
      />
    );
  }

  return (
    <div className="space-y-2">
      {allIntakes.map((intake) => (
        <div key={intake.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
          <div>
            <p className="font-medium">{intake.medication.name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(intake.scheduled_for).toLocaleDateString()} ·{" "}
              {new Date(intake.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <Badge
            variant={
              intake.status === "taken" ? "default" : intake.status === "skipped" ? "secondary" : "destructive"
            }
          >
            {intake.status === "taken" ? "Tomada" : intake.status === "skipped" ? "Omitida" : "No tomada"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function MedicineNameSearch({
  value,
  onChange,
  medicines,
  medications,
  disabled,
  onPickMedicine,
  onPickMedication,
}: {
  value: string;
  onChange: (v: string) => void;
  medicines: any[];
  medications: any[];
  disabled?: boolean;
  onPickMedicine: (m: any) => void;
  onPickMedication: (m: any) => void;
}) {
  const [focused, setFocused] = useState(false);
  const q = value.trim().toLowerCase();

  // Unique medications by name (keep first occurrence with stock info).
  const medsByName = new Map<string, any>();
  for (const m of medications ?? []) {
    const k = (m.name || "").toLowerCase();
    if (k && !medsByName.has(k)) medsByName.set(k, m);
  }

  const matchedMedications = q
    ? Array.from(medsByName.values()).filter((m) => m.name.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const takenNames = new Set(matchedMedications.map((m) => m.name.toLowerCase()));
  const matchedMedicines = q
    ? (medicines ?? [])
        .filter((m: any) => m.name.toLowerCase().includes(q) && !takenNames.has(m.name.toLowerCase()))
        .slice(0, 5)
    : [];

  const showList = focused && !disabled && (matchedMedications.length > 0 || matchedMedicines.length > 0);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Buscar en inventario o escribir…"
        disabled={disabled}
        required
      />
      {showList && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {matchedMedications.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Ya en control de tomas</div>
              {matchedMedications.map((m) => (
                <button
                  key={`med-${m.id}`}
                  type="button"
                  className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPickMedication(m);
                  }}
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.dose_amount} {m.unit}
                    {m.current_quantity != null ? ` · stock ${m.current_quantity}` : ""}
                    {m.total_quantity != null ? `/${m.total_quantity}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {matchedMedicines.length > 0 && (
            <div className="border-t p-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Inventario de medicinas</div>
              {matchedMedicines.map((m: any) => (
                <button
                  key={`inv-${m.id}`}
                  type="button"
                  className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPickMedicine(m);
                  }}
                >
                  <span className="font-medium">{m.name}</span>
                  {m.expiry_month && m.expiry_year && (
                    <span className="text-xs text-muted-foreground">
                      Caduca {String(m.expiry_month).padStart(2, "0")}/{m.expiry_year}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
