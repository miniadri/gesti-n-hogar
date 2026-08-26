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
  AlertCircle,
  Check,
  X,
  ChevronDown,
  ShoppingCart,
  History,
  Bell,
  Clock3,
  HeartPulse,
  FileText,
  AlertTriangle,
  Stethoscope,
  Settings,
  Trash2,
  Syringe,
  Copy,
  Printer,
  Search,
  ExternalLink,
  ShieldAlert,
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
import { supabase } from "@/integrations/supabase/client-app";
import { listMedications, createMedication, updateMedication, deleteMedication, recordIntake, snoozeIntake } from "@/lib/medications.functions";
import { listMedicines } from "@/lib/medicines.functions";
import { searchCimaMedicines } from "@/lib/cima.functions";
import { createShoppingItem } from "@/lib/shopping.functions";
import {
  listMedicalRegistry,
  upsertMedicalProfile,
  createMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
} from "@/lib/medical-records.functions";
import { SosButton } from "@/components/SosButton";

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

const medicalRegistryQueryOptions = queryOptions({
  queryKey: ["medical-registry"],
  queryFn: () => listMedicalRegistry(),
});

export const Route = createFileRoute("/_authenticated/medications")({
  head: () => ({
    meta: [{ title: "Salud — HomeSync" }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(medicationsQueryOptions);
    await context.queryClient.ensureQueryData(householdQueryOptions);
    try {
      await context.queryClient.ensureQueryData(medicalRegistryQueryOptions);
    } catch {
      // The medical registry is adult-only and also depends on the latest
      // migration. Keep the medication page usable if it is not available yet.
    }
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
  const { data: medicalRegistry } = useQuery(medicalRegistryQueryOptions);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [medicalRegistryOpen, setMedicalRegistryOpen] = useState(false);

  const doCreate = useServerFn(createMedication);
  const doUpdate = useServerFn(updateMedication);
  const doDelete = useServerFn(deleteMedication);
  const doRecord = useServerFn(recordIntake);
  const doSnooze = useServerFn(snoozeIntake);
  const doAddShopping = useServerFn(createShoppingItem);
  const doSaveProfile = useServerFn(upsertMedicalProfile);
  const doCreateMedicalRecord = useServerFn(createMedicalRecord);
  const doUpdateMedicalRecord = useServerFn(updateMedicalRecord);
  const doDeleteMedicalRecord = useServerFn(deleteMedicalRecord);


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
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["shopping"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["shopping"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
          <h2 className="text-2xl font-bold tracking-tight">Salud</h2>
          <p className="text-muted-foreground">Medicación, registro médico y datos de emergencia</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild variant="outline" title="Ajustes de emergencia">
            <Link to="/settings/emergency">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:ml-2 sm:inline">Emergencia</span>
            </Link>
          </Button>
          <SosButton variant="compact" />
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
      </div>

      <section className="space-y-3">
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full items-start justify-between gap-3 whitespace-normal rounded-xl border bg-card p-4 text-left shadow-sm"
          onClick={() => setMedicalRegistryOpen((open) => !open)}
          aria-expanded={medicalRegistryOpen}
        >
          <span className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10">
              <HeartPulse className="h-5 w-5 text-primary" />
            </span>
            <span className="min-w-0">
              <span className="block break-words font-semibold">Registro médico</span>
            <span className="block break-words text-sm font-normal text-muted-foreground">
              Datos médicos familiares, alergias, condiciones y resumen SOS.
            </span>
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${medicalRegistryOpen ? "rotate-180" : ""}`} />
        </Button>

        {medicalRegistryOpen && (
          <MedicalRegistryView
            members={members}
            registry={medicalRegistry}
            onSaveProfile={async (payload) => {
              await doSaveProfile({ data: payload });
              queryClient.invalidateQueries({ queryKey: ["medical-registry"] });
            }}
            onCreateRecord={async (payload) => {
              await doCreateMedicalRecord({ data: payload });
              queryClient.invalidateQueries({ queryKey: ["medical-registry"] });
            }}
            onUpdateRecord={async (payload) => {
              await doUpdateMedicalRecord({ data: payload });
              queryClient.invalidateQueries({ queryKey: ["medical-registry"] });
            }}
            onDeleteRecord={async (id) => {
              await doDeleteMedicalRecord({ data: { id } });
              queryClient.invalidateQueries({ queryKey: ["medical-registry"] });
            }}
          />
        )}
      </section>

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
          <TabsTrigger value="active">Medicación activa</TabsTrigger>
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
        medicalRegistry={medicalRegistry}
        onSave={handleSave}
      />
    </div>
  );
}

const MEDICAL_RECORD_TYPES = [
  { value: "condition", label: "Condición/diagnóstico" },
  { value: "allergy", label: "Alergia/intolerancia" },
  { value: "visit", label: "Cita/visita médica" },
  { value: "procedure", label: "Cirugía/procedimiento" },
  { value: "vaccine", label: "Vacuna" },
  { value: "note", label: "Nota médica" },
  { value: "other", label: "Otro" },
];

const MEDICAL_SEVERITIES = [
  { value: "low", label: "Leve" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

function MedicalRegistryView({
  members,
  registry,
  onSaveProfile,
  onCreateRecord,
  onUpdateRecord,
  onDeleteRecord,
}: {
  members: any[];
  registry: any;
  onSaveProfile: (payload: any) => Promise<void>;
  onCreateRecord: (payload: any) => Promise<void>;
  onUpdateRecord: (payload: any) => Promise<void>;
  onDeleteRecord: (id: string) => Promise<void>;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? "");
  const [profileOpen, setProfileOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  useEffect(() => {
    if (!selectedMemberId && members[0]?.id) setSelectedMemberId(members[0].id);
  }, [members, selectedMemberId]);

  if (!registry) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-4">
          <p className="font-medium text-amber-700">Registro médico no disponible todavía</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Aplica la migración del registro médico en Lovable Cloud. Si el usuario no es adulto del hogar, esta sección queda protegida.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedMember = members.find((m: any) => m.id === selectedMemberId) ?? members[0];
  const profiles = registry.profiles ?? [];
  const records = registry.records ?? [];
  const profile = profiles.find((p: any) => p.member_id === selectedMember?.id) ?? null;
  const memberRecords = records.filter((r: any) => r.member_id === selectedMember?.id);
  const criticalRecords = memberRecords.filter((r: any) => r.show_in_sos || ["high", "critical"].includes(r.severity));
  const allergyRecords = memberRecords.filter((r: any) => r.record_type === "allergy");
  const conditionRecords = memberRecords.filter((r: any) => r.record_type === "condition");
  const vaccineRecords = memberRecords
    .filter((r: any) => r.record_type === "vaccine")
    .sort((a: any, b: any) => String(b.occurred_on ?? "").localeCompare(String(a.occurred_on ?? "")));

  const copySummary = async () => {
    if (!selectedMember) return;
    try {
      await navigator.clipboard.writeText(buildMedicalSummaryText(selectedMember, profile, memberRecords));
      toast.success("Resumen médico copiado");
    } catch {
      toast.error("No se pudo copiar el resumen");
    }
  };

  const printSummary = () => {
    if (!selectedMember) return;
    const html = buildMedicalSummaryHtml(selectedMember, profile, memberRecords);
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!win) {
      toast.error("No se pudo abrir la ficha para imprimir");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="h-4 w-4 text-primary" />
                Registro médico familiar
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Visible solo para adultos del hogar. Los datos marcados para SOS se incluirán en avisos de emergencia.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copySummary} disabled={!selectedMember}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar resumen
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={printSummary} disabled={!selectedMember}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir ficha
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
            <div className="space-y-2">
              <Label>Miembro</Label>
              <Select value={selectedMember?.id ?? ""} onValueChange={setSelectedMemberId}>
                <SelectTrigger><SelectValue placeholder="Selecciona miembro" /></SelectTrigger>
                <SelectContent>
                  {members.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.display_name}{member.is_child ? " · infantil" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No guardes contraseñas ni claves. Para datos críticos, usa “Mostrar en SOS” solo cuando sea útil para una emergencia real.
            </div>
          </div>

          {selectedMember && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Datos vitales y seguros</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setProfileOpen(true)}>Editar</Button>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Grupo sanguíneo" value={profile?.blood_type} />
                  <InfoRow label="Peso / altura" value={[profile?.weight_kg ? `${profile.weight_kg} kg` : "", profile?.height_cm ? `${profile.height_cm} cm` : ""].filter(Boolean).join(" · ")} />
                  <InfoRow label="Sanidad pública" value={[profile?.public_health_provider, profile?.public_health_id].filter(Boolean).join(" · ")} />
                  <InfoRow label="Seguro privado" value={[profile?.private_insurance_name, profile?.private_policy_number].filter(Boolean).join(" · ")} />
                  {profile?.private_coverage_notes && <InfoRow label="Coberturas" value={profile.private_coverage_notes} />}
                  {profile?.emergency_notes && <InfoRow label="Notas emergencia" value={profile.emergency_notes} />}
                  {!profile && <p className="text-muted-foreground">Sin datos vitales registrados.</p>}
                </CardContent>
              </Card>

              <Card className="border-destructive/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Resumen SOS
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {criticalRecords.length === 0 && !profile?.emergency_notes ? (
                    <p className="text-muted-foreground">Sin alergias o condiciones críticas marcadas para SOS.</p>
                  ) : (
                    <>
                      {profile?.emergency_notes && <p>{profile.emergency_notes}</p>}
                      {criticalRecords.slice(0, 6).map((record: any) => (
                        <div key={record.id} className="rounded-md border p-2">
                          <p className="font-medium">{record.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {recordTypeLabel(record.record_type)}
                            {record.severity ? ` · ${severityLabel(record.severity)}` : ""}
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Syringe className="h-4 w-4 text-primary" />
                    Vacunas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {vaccineRecords.length === 0 ? (
                    <p className="text-muted-foreground">Sin vacunas registradas.</p>
                  ) : (
                    vaccineRecords.slice(0, 5).map((record: any) => (
                      <div key={record.id} className="rounded-md border p-2">
                        <p className="font-medium">{record.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.occurred_on ? formatDate(record.occurred_on) : "Sin fecha"}
                          {record.follow_up_on ? ` · Próxima: ${formatDate(record.follow_up_on)}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {selectedMember && (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm md:grid-cols-2">
              <div>
                <p className="font-medium">Alergias/intolerancias</p>
                {allergyRecords.length === 0 ? (
                  <p className="mt-1 text-muted-foreground">Sin alergias registradas.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {allergyRecords.slice(0, 8).map((record: any) => (
                      <Badge key={record.id} variant={record.severity === "critical" ? "destructive" : "secondary"}>
                        {record.title}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium">Condiciones principales</p>
                {conditionRecords.length === 0 ? (
                  <p className="mt-1 text-muted-foreground">Sin condiciones registradas.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {conditionRecords.slice(0, 8).map((record: any) => (
                      <Badge key={record.id} variant={["high", "critical"].includes(record.severity) ? "destructive" : "outline"}>
                        {record.title}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Condiciones, alergias, citas y notas</h3>
          <p className="text-sm text-muted-foreground">Historial médico básico para seguimiento familiar.</p>
        </div>
        <Button onClick={() => { setEditingRecord(null); setRecordOpen(true); }} disabled={!selectedMember}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir registro
        </Button>
      </div>

      {memberRecords.length === 0 ? (
        <EmptyState icon={FileText} title="Sin registros médicos" description="Añade alergias, diagnósticos, citas o notas relevantes para este miembro." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {memberRecords.map((record: any) => (
            <Card key={record.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={record.severity === "critical" ? "destructive" : "secondary"}>{recordTypeLabel(record.record_type)}</Badge>
                      {record.severity && <Badge variant="outline">{severityLabel(record.severity)}</Badge>}
                      {record.show_in_sos && <Badge variant="destructive">SOS</Badge>}
                    </div>
                    <p className="mt-2 font-semibold">{record.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {record.occurred_on ? `Fecha: ${formatDate(record.occurred_on)}` : "Sin fecha"}
                      {record.follow_up_on ? ` · Seguimiento: ${formatDate(record.follow_up_on)}` : ""}
                    </p>
                    {record.notes && <p className="mt-2 text-sm text-muted-foreground">{record.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditingRecord(record); setRecordOpen(true); }}>
                      <span className="sr-only">Editar</span>
                      <Stethoscope className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        try {
                          await onDeleteRecord(record.id);
                          toast.success("Registro eliminado");
                        } catch (err: any) {
                          toast.error(err.message || "No se pudo eliminar");
                        }
                      }}
                    >
                      <span className="sr-only">Eliminar</span>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedMember && (
        <>
          <MedicalProfileDialog
            open={profileOpen}
            onOpenChange={setProfileOpen}
            member={selectedMember}
            profile={profile}
            onSave={async (payload) => {
              try {
                await onSaveProfile(payload);
                toast.success("Datos médicos guardados");
                setProfileOpen(false);
              } catch (err: any) {
                toast.error(err.message || "No se pudo guardar");
              }
            }}
          />
          <MedicalRecordDialog
            open={recordOpen}
            onOpenChange={(value) => {
              setRecordOpen(value);
              if (!value) setEditingRecord(null);
            }}
            member={selectedMember}
            editing={editingRecord}
            onSave={async (payload) => {
              try {
                if (editingRecord) await onUpdateRecord({ ...payload, id: editingRecord.id });
                else await onCreateRecord(payload);
                toast.success(editingRecord ? "Registro actualizado" : "Registro añadido");
                setRecordOpen(false);
                setEditingRecord(null);
              } catch (err: any) {
                toast.error(err.message || "No se pudo guardar");
              }
            }}
          />
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b pb-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function MedicalProfileDialog({ open, onOpenChange, member, profile, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; member: any; profile: any; onSave: (payload: any) => Promise<void>; }) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (!open) return;
    setForm({
      blood_type: profile?.blood_type ?? "",
      height_cm: profile?.height_cm ?? "",
      weight_kg: profile?.weight_kg ?? "",
      public_health_provider: profile?.public_health_provider ?? "",
      public_health_id: profile?.public_health_id ?? "",
      private_insurance_name: profile?.private_insurance_name ?? "",
      private_policy_number: profile?.private_policy_number ?? "",
      private_coverage_notes: profile?.private_coverage_notes ?? "",
      emergency_notes: profile?.emergency_notes ?? "",
      show_in_sos: profile?.show_in_sos ?? true,
    });
  }, [open, profile]);
  const update = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Datos médicos de {member.display_name}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          onSave({
            member_id: member.id,
            ...form,
            height_cm: form.height_cm ? Number(form.height_cm) : null,
            weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
          });
        }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Grupo sanguíneo</Label><Input value={form.blood_type ?? ""} onChange={(e) => update("blood_type", e.target.value)} placeholder="Ej. A+" /></div>
            <div className="space-y-1"><Label>Peso kg</Label><Input type="number" step="0.1" value={form.weight_kg ?? ""} onChange={(e) => update("weight_kg", e.target.value)} /></div>
            <div className="space-y-1"><Label>Altura cm</Label><Input type="number" step="0.1" value={form.height_cm ?? ""} onChange={(e) => update("height_cm", e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Sanidad pública</Label><Input value={form.public_health_provider ?? ""} onChange={(e) => update("public_health_provider", e.target.value)} placeholder="SESCAM, SERMAS..." /></div>
            <div className="space-y-1"><Label>Número / tarjeta sanitaria</Label><Input value={form.public_health_id ?? ""} onChange={(e) => update("public_health_id", e.target.value)} /></div>
            <div className="space-y-1"><Label>Seguro privado</Label><Input value={form.private_insurance_name ?? ""} onChange={(e) => update("private_insurance_name", e.target.value)} /></div>
            <div className="space-y-1"><Label>Número de póliza</Label><Input value={form.private_policy_number ?? ""} onChange={(e) => update("private_policy_number", e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Coberturas / observaciones del seguro</Label><Textarea value={form.private_coverage_notes ?? ""} onChange={(e) => update("private_coverage_notes", e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Notas prácticas para emergencia</Label>
            <Textarea value={form.emergency_notes ?? ""} onChange={(e) => update("emergency_notes", e.target.value)} placeholder="Ej. no puede quedarse solo, avisar al centro escolar, lleva documentación en la mochila..." />
            <p className="text-xs text-muted-foreground">
              No repitas aquí condiciones médicas, alergias o diagnósticos: añádelos en Condiciones, alergias, citas y notas. Este campo es para indicaciones prácticas que ayudarían durante una emergencia.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Checkbox checked={Boolean(form.show_in_sos)} onCheckedChange={(v) => update("show_in_sos", Boolean(v))} />
            Incluir estas notas en avisos SOS
          </label>
          <DialogFooter><Button type="submit">Guardar datos médicos</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MedicalRecordDialog({ open, onOpenChange, member, editing, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; member: any; editing: any; onSave: (payload: any) => Promise<void>; }) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (!open) return;
    setForm({
      record_type: editing?.record_type ?? "condition",
      title: editing?.title ?? "",
      severity: editing?.severity ?? "",
      occurred_on: editing?.occurred_on ?? "",
      follow_up_on: editing?.follow_up_on ?? "",
      notes: editing?.notes ?? "",
      show_in_sos: editing?.show_in_sos ?? false,
    });
  }, [open, editing]);
  const update = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));
  const copy = getMedicalRecordCopy(form.record_type);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar registro" : "Añadir registro"} · {member.display_name}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          onSave({
            member_id: member.id,
            record_type: form.record_type,
            title: form.title,
            severity: form.severity || null,
            occurred_on: form.occurred_on || null,
            follow_up_on: form.follow_up_on || null,
            notes: form.notes || null,
            show_in_sos: Boolean(form.show_in_sos),
          });
        }}>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={form.record_type ?? "condition"} onValueChange={(v) => update("record_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MEDICAL_RECORD_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{copy.titleLabel}</Label>
            <Input value={form.title ?? ""} onChange={(e) => update("title", e.target.value)} placeholder={copy.titlePlaceholder} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Gravedad</Label>
              <Select value={form.severity || "none"} onValueChange={(v) => update("severity", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin indicar</SelectItem>
                  {MEDICAL_SEVERITIES.map((sev) => <SelectItem key={sev.value} value={sev.value}>{sev.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{copy.dateLabel}</Label><Input type="date" value={form.occurred_on ?? ""} onChange={(e) => update("occurred_on", e.target.value)} /></div>
            <div className="space-y-1"><Label>{copy.followUpLabel}</Label><Input type="date" value={form.follow_up_on ?? ""} onChange={(e) => update("follow_up_on", e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>{copy.notesLabel}</Label><Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} placeholder={copy.notesPlaceholder} /></div>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Checkbox checked={Boolean(form.show_in_sos)} onCheckedChange={(v) => update("show_in_sos", Boolean(v))} />
            Mostrar en emergencia/SOS
          </label>
          <DialogFooter><Button type="submit">{editing ? "Guardar cambios" : "Añadir registro"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function recordTypeLabel(type: string) {
  return MEDICAL_RECORD_TYPES.find((item) => item.value === type)?.label ?? "Registro";
}

function severityLabel(severity: string) {
  return MEDICAL_SEVERITIES.find((item) => item.value === severity)?.label ?? severity;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-ES");
}

function getMedicalRecordCopy(type: string) {
  if (type === "vaccine") {
    return {
      titleLabel: "Vacuna",
      titlePlaceholder: "Ej. Triple vírica, meningococo, gripe",
      dateLabel: "Fecha de administración",
      followUpLabel: "Próxima dosis / recuerdo",
      notesLabel: "Lote, centro y observaciones",
      notesPlaceholder: "Ej. lote, centro sanitario, reacción, pauta pendiente...",
    };
  }
  if (type === "allergy") {
    return {
      titleLabel: "Alergia o intolerancia",
      titlePlaceholder: "Ej. Penicilina, ibuprofeno, lactosa",
      dateLabel: "Fecha detectada",
      followUpLabel: "Revisión",
      notesLabel: "Síntomas, reacción y medicación relacionada",
      notesPlaceholder: "Ej. urticaria, dificultad respiratoria, evitar familia de antibióticos...",
    };
  }
  if (type === "visit") {
    return {
      titleLabel: "Cita o visita",
      titlePlaceholder: "Ej. Pediatría, endocrino, revisión digestivo",
      dateLabel: "Fecha de visita",
      followUpLabel: "Volver / seguimiento",
      notesLabel: "Observaciones",
      notesPlaceholder: "Resumen de la visita, pautas y próximos pasos...",
    };
  }
  return {
    titleLabel: "Título",
    titlePlaceholder: "Ej. Tiroides, hernia de hiato, asma",
    dateLabel: "Fecha",
    followUpLabel: "Seguimiento",
    notesLabel: "Notas",
    notesPlaceholder: "Datos relevantes para seguimiento familiar...",
  };
}

function buildMedicalSummaryText(member: any, profile: any, records: any[]) {
  const byType = (type: string) => records.filter((r: any) => r.record_type === type);
  const line = (label: string, value?: string | number | null) => (value ? `${label}: ${value}` : null);
  const profileLines = [
    line("Grupo sanguíneo", profile?.blood_type),
    line("Peso", profile?.weight_kg ? `${profile.weight_kg} kg` : null),
    line("Altura", profile?.height_cm ? `${profile.height_cm} cm` : null),
    line("Sanidad pública", [profile?.public_health_provider, profile?.public_health_id].filter(Boolean).join(" · ")),
    line("Seguro privado", [profile?.private_insurance_name, profile?.private_policy_number].filter(Boolean).join(" · ")),
    line("Coberturas", profile?.private_coverage_notes),
    line("Notas prácticas emergencia", profile?.emergency_notes),
  ].filter(Boolean);
  const recordLines = (title: string, items: any[]) => [
    "",
    title,
    ...(items.length
      ? items.map((r: any) => `- ${r.title}${r.severity ? ` (${severityLabel(r.severity)})` : ""}${r.occurred_on ? ` · ${formatDate(r.occurred_on)}` : ""}${r.follow_up_on ? ` · Seguimiento: ${formatDate(r.follow_up_on)}` : ""}${r.notes ? `\n  ${r.notes}` : ""}`)
      : ["- Sin registros"]),
  ];
  return [
    `Ficha médica - ${member.display_name}`,
    `Generada: ${new Date().toLocaleString("es-ES")}`,
    "",
    ...profileLines,
    ...recordLines("Alergias e intolerancias", byType("allergy")),
    ...recordLines("Condiciones y diagnósticos", byType("condition")),
    ...recordLines("Vacunas", byType("vaccine")),
    ...recordLines("Citas, procedimientos y notas", records.filter((r: any) => !["allergy", "condition", "vaccine"].includes(r.record_type))),
  ].join("\n");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMedicalSummaryHtml(member: any, profile: any, records: any[]) {
  const text = buildMedicalSummaryText(member, profile, records);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ficha médica ${escapeHtml(member.display_name)}</title><style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:32px;color:#111;line-height:1.45}
    h1{font-size:24px;margin:0 0 6px} pre{white-space:pre-wrap;font:inherit}
  </style></head><body><h1>Ficha médica - ${escapeHtml(member.display_name)}</h1><pre>${escapeHtml(text)}</pre></body></html>`;
}

function normalizeMedicalText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getAllergyWarnings(
  registry: any,
  memberId: string,
  medicationName: string,
  medicationNotes: string,
  activeIngredients: string[] = [],
  excipients: string[] = [],
) {
  if (!registry || !memberId) return [];
  const haystack = normalizeMedicalText(`${medicationName} ${medicationNotes} ${activeIngredients.join(" ")} ${excipients.join(" ")}`);
  if (haystack.length < 3) return [];
  const allergies = (registry.records ?? []).filter((r: any) => r.member_id === memberId && r.record_type === "allergy");
  return allergies
    .map((allergy: any) => {
    const allergyText = normalizeMedicalText(`${allergy.title} ${allergy.notes ?? ""}`);
      if (!allergyText) return null;
      if (haystack.includes(allergyText) || allergyText.includes(haystack)) return { ...allergy, matchedTerm: allergy.title };
    const allergyTerms = allergyText.split(" ").filter((term: string) => term.length >= 4);
    const medicationTerms = haystack.split(" ").filter((term: string) => term.length >= 4);
      const matchedTerm =
        allergyTerms.find((term: string) => haystack.includes(term)) ??
        medicationTerms.find((term: string) => allergyText.includes(term));
      return matchedTerm ? { ...allergy, matchedTerm } : null;
    })
    .filter(Boolean);
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
            {med.doctor_instructions && (
              <p className="mt-1 text-xs text-muted-foreground">
                Pauta: {med.doctor_instructions}
              </p>
            )}
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
            {med.cima_nregistro && (
              <div className="mt-2 rounded-lg border bg-muted/30 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="secondary">AEMPS</Badge>
                  {med.cima_prescription_required && <Badge variant="outline">Receta</Badge>}
                  {(med.cima_active_ingredients ?? []).slice(0, 4).map((ingredient: string) => (
                    <Badge key={ingredient} variant="outline">{ingredient}</Badge>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {med.cima_prospect_url && (
                    <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={med.cima_prospect_url} target="_blank" rel="noreferrer">
                      Prospecto <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {med.cima_ficha_tecnica_url && (
                    <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={med.cima_ficha_tecnica_url} target="_blank" rel="noreferrer">
                      Ficha técnica <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
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
  medicalRegistry,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any;
  members: any[];
  medications: any[];
  medicalRegistry?: any;
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
  const [escalationMinutes, setEscalationMinutes] = useState("15");
  const [notes, setNotes] = useState("");
  const [doctorInstructions, setDoctorInstructions] = useState("");
  const [cimaSearch, setCimaSearch] = useState("");
  const [cimaResults, setCimaResults] = useState<any[]>([]);
  const [cimaLoading, setCimaLoading] = useState(false);
  const [cimaSelected, setCimaSelected] = useState<any>(null);
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [schedules, setSchedules] = useState<any[]>([{ time_of_day: "09:00", days_of_week: [1, 2, 3, 4, 5, 6, 0], frequency_type: "daily", interval_hours: 8, active: true }]);
  const doSearchCima = useServerFn(searchCimaMedicines);
  const allergyWarnings = getAllergyWarnings(
    medicalRegistry,
    memberId,
    name,
    notes,
    cimaSelected?.activeIngredients ?? editing?.cima_active_ingredients ?? [],
    cimaSelected?.excipients ?? editing?.cima_excipients ?? [],
  );

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
      setEscalationMinutes(editing.escalation_after_minutes != null ? String(editing.escalation_after_minutes) : "15");
      setNotes(editing.notes || "");
      setDoctorInstructions(editing.doctor_instructions || "");
      setCimaSearch(editing.cima_name || editing.name || "");
      setCimaSelected(
        editing.cima_nregistro
          ? {
              nregistro: editing.cima_nregistro,
              cn: editing.cima_cn,
              name: editing.cima_name,
              activeIngredients: editing.cima_active_ingredients ?? [],
              excipients: editing.cima_excipients ?? [],
              prospectUrl: editing.cima_prospect_url,
              fichaTecnicaUrl: editing.cima_ficha_tecnica_url,
              cimaUrl: editing.cima_url,
              prescriptionRequired: editing.cima_prescription_required,
            }
          : null,
      );
      setCimaResults([]);
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
      setEscalationMinutes("15");
      setNotes("");
      setDoctorInstructions("");
      setCimaSearch("");
      setCimaSelected(null);
      setCimaResults([]);
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
      escalation_after_minutes: escalationMinutes.trim() === "" ? null : Math.max(0, Number(escalationMinutes) || 0),
      notes,
      doctor_instructions: doctorInstructions.trim() || null,
      cima_nregistro: cimaSelected?.nregistro ?? null,
      cima_cn: cimaSelected?.cn ?? null,
      cima_name: cimaSelected?.name ?? null,
      cima_active_ingredients: cimaSelected?.activeIngredients ?? [],
      cima_excipients: cimaSelected?.excipients ?? [],
      cima_prospect_url: cimaSelected?.prospectUrl ?? null,
      cima_ficha_tecnica_url: cimaSelected?.fichaTecnicaUrl ?? null,
      cima_url: cimaSelected?.cimaUrl ?? null,
      cima_prescription_required: cimaSelected?.prescriptionRequired ?? null,
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

  const handleCimaSearch = async () => {
    const query = (cimaSearch || name).trim();
    if (query.length < 2) {
      toast.error("Escribe un nombre, código nacional o EAN");
      return;
    }
    setCimaLoading(true);
    try {
      const response = await doSearchCima({ data: { query } });
      setCimaResults(response.results ?? []);
      if ((response.results ?? []).length === 0) toast.warning("CIMA no encontró coincidencias");
    } catch (err: any) {
      toast.error(err.message || "No se pudo consultar CIMA/AEMPS");
    } finally {
      setCimaLoading(false);
    }
  };

  const pickCimaMedicine = (medicine: any) => {
    setCimaSelected(medicine);
    setName(medicine.name || name);
    if (medicine.dose) setUnit(medicine.dose);
    setCimaResults([]);
    toast.success("Medicamento oficial vinculado");
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
                  if (m.doctor_instructions) setDoctorInstructions(m.doctor_instructions);
                  setCimaSelected(
                    m.cima_nregistro
                      ? {
                          nregistro: m.cima_nregistro,
                          cn: m.cima_cn,
                          name: m.cima_name,
                          activeIngredients: m.cima_active_ingredients ?? [],
                          excipients: m.cima_excipients ?? [],
                          prospectUrl: m.cima_prospect_url,
                          fichaTecnicaUrl: m.cima_ficha_tecnica_url,
                          cimaUrl: m.cima_url,
                          prescriptionRequired: m.cima_prescription_required,
                        }
                      : null,
                  );
                }}
                onPickMedicine={(m: any) => {
                  setName(m.name);
                  setForm(m.form ?? "pill");
                  setDose(m.dose_amount != null ? String(m.dose_amount) : "1");
                  setUnit(m.unit ?? "pastilla");
                  setTotalQty(m.total_quantity != null ? String(m.total_quantity) : "");
                  setCurrentQty(m.current_quantity != null ? String(m.current_quantity) : "");
                  setThreshold(m.low_stock_threshold != null ? String(m.low_stock_threshold) : "");
                  setNotes(m.notes ?? m.note ?? "");
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

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label>CIMA/AEMPS oficial</Label>
                <Input
                  value={cimaSearch}
                  onChange={(e) => setCimaSearch(e.target.value)}
                  placeholder="Nombre, código nacional o EAN del envase"
                />
              </div>
              <Button type="button" variant="outline" onClick={handleCimaSearch} disabled={cimaLoading}>
                <Search className="mr-2 h-4 w-4" />
                {cimaLoading ? "Buscando..." : "Buscar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Vincula el medicamento oficial para guardar principios activos/excipientes y abrir prospecto o ficha técnica de AEMPS.
            </p>

            {cimaSelected && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{cimaSelected.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cimaSelected.nregistro ? `Registro ${cimaSelected.nregistro}` : "Registro no disponible"}
                      {cimaSelected.cn ? ` · CN ${cimaSelected.cn}` : ""}
                      {cimaSelected.prescriptionRequired ? " · sujeto a receta" : ""}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setCimaSelected(null)}>
                    Desvincular
                  </Button>
                </div>
                {(cimaSelected.activeIngredients?.length > 0 || cimaSelected.excipients?.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(cimaSelected.activeIngredients ?? []).slice(0, 8).map((ingredient: string) => (
                      <Badge key={`active-${ingredient}`} variant="secondary">{ingredient}</Badge>
                    ))}
                    {(cimaSelected.excipients ?? []).slice(0, 8).map((excipient: string) => (
                      <Badge key={`excipient-${excipient}`} variant="outline">{excipient}</Badge>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {cimaSelected.prospectUrl && (
                    <Button type="button" asChild size="sm" variant="outline">
                      <a href={cimaSelected.prospectUrl} target="_blank" rel="noreferrer">
                        Prospecto <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  {cimaSelected.fichaTecnicaUrl && (
                    <Button type="button" asChild size="sm" variant="outline">
                      <a href={cimaSelected.fichaTecnicaUrl} target="_blank" rel="noreferrer">
                        Ficha técnica <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  {cimaSelected.cimaUrl && (
                    <Button type="button" asChild size="sm" variant="outline">
                      <a href={cimaSelected.cimaUrl} target="_blank" rel="noreferrer">
                        AEMPS <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {cimaResults.length > 0 && (
              <div className="space-y-2">
                {cimaResults.map((medicine: any) => (
                  <button
                    key={medicine.nregistro ?? medicine.name}
                    type="button"
                    className="w-full rounded-lg border bg-card p-3 text-left transition hover:border-primary"
                    onClick={() => pickCimaMedicine(medicine)}
                  >
                    <p className="font-medium">{medicine.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[medicine.dose, medicine.form, medicine.lab].filter(Boolean).join(" · ")}
                    </p>
                    {(medicine.activeIngredients?.length > 0 || medicine.excipients?.length > 0) && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        Principios: {(medicine.activeIngredients ?? []).join(", ") || "no disponible"}
                        {medicine.excipients?.length ? ` · Excipientes: ${medicine.excipients.slice(0, 6).join(", ")}` : ""}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Caducidad (mes)</Label>
              <Input
                type="number"
                min="1"
                max="12"
                placeholder="MM"
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Caducidad (año)</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                placeholder="AAAA"
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("medications.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Toma indicada por médico/farmacéutico</Label>
            <Textarea
              value={doctorInstructions}
              onChange={(e) => setDoctorInstructions(e.target.value)}
              rows={2}
              placeholder="Ej. tomar con comida durante 7 días; no mezclar con..."
            />
            <p className="text-xs text-muted-foreground">
              Este campo guarda la pauta indicada para este medicamento en general. Las horas concretas van en las tomas.
            </p>
          </div>

          {allergyWarnings.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Posible coincidencia con alergias registradas</p>
                  <p className="text-muted-foreground">
                    Revisa antes de guardar. Esta comprobación cruza alergias con nombre, notas y datos CIMA/AEMPS si el medicamento está vinculado. No sustituye una revisión médica.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {allergyWarnings.slice(0, 5).map((allergy: any) => (
                      <Badge key={allergy.id} variant="destructive">
                        {allergy.title}{allergy.matchedTerm ? ` · ${allergy.matchedTerm}` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}


          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="reminders" className="cursor-pointer">
              {t("medications.reminders")}
            </Label>
            <Switch id="reminders" checked={reminders} onCheckedChange={setReminders} />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="escalation">Escalar a adultos si se retrasa (minutos)</Label>
            <Input
              id="escalation"
              type="number"
              min="0"
              max="720"
              value={escalationMinutes}
              onChange={(e) => setEscalationMinutes(e.target.value)}
              placeholder="15"
            />
            <p className="text-xs text-muted-foreground">
              Pasado este tiempo desde la hora prevista, avisamos a adultos marcados como
              contacto de emergencia y a contactos externos por Telegram. Deja vacío o pon 0 para desactivar.
            </p>
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
                  <span className="text-xs text-muted-foreground">
                    {m.dose_amount != null && m.unit ? `${m.dose_amount} ${m.unit}` : "Sin dosis"}
                    {m.current_quantity != null ? ` · stock ${m.current_quantity}` : ""}
                    {m.total_quantity != null ? `/${m.total_quantity}` : ""}
                    {m.expiry_month && m.expiry_year ? ` · caduca ${String(m.expiry_month).padStart(2, "0")}/${m.expiry_year}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
