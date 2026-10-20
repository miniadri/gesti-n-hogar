import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RecipientPicker,
  usePersonalContext,
  type PersonalContext,
} from "@/components/family/PersonalContext";
import {
  addDays,
  localDay,
  estimateCycle,
  CycleEntrySchema,
  CycleDataSchema,
  EMPTY_CYCLE,
  validateCycleEntries,
  type CycleEntry,
  type CycleData,
} from "@/lib/family-features";
import { readCycleLocal, saveCycleLocal } from "@/lib/cycle-local";
import {
  getCycleReminder,
  listCycleShares,
  setCycleSharing,
  setCycleReminder,
} from "@/lib/family-features.functions";

const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("es-ES");
const flows = {
  unspecified: "Sin especificar",
  light: "Escaso",
  medium: "Medio",
  heavy: "Abundante",
};

export function CyclePanel() {
  const { data: context, isPending, error } = usePersonalContext();
  if (isPending) return <p role="status">Cargando espacio personal…</p>;
  if (error || !context)
    return <p role="alert">{error?.message || "No se pudo identificar la cuenta personal"}</p>;
  return <CycleContent key={`${context.userId}:${context.householdId}`} context={context} />;
}

function CycleContent({ context }: { context: PersonalContext }) {
  const getShares = useServerFn(listCycleShares);
  const getReminder = useServerFn(getCycleReminder);
  const share = useServerFn(setCycleSharing);
  const reminder = useServerFn(setCycleReminder);
  const local = useQuery({
    queryKey: ["cycle-local", context.userId, context.householdId],
    queryFn: () => readCycleLocal(context.userId, context.householdId),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const remote = useQuery({
    queryKey: ["cycle-sharing", context.userId, context.householdId],
    queryFn: async () => ({ shares: await getShares(), reminder: await getReminder() }),
    gcTime: 0,
  });
  const [data, setData] = useState<CycleData | null>(null);
  const [baseData, setBaseData] = useState<CycleData | null>(null);
  const [expectedDaysInput, setExpectedDaysInput] = useState("28");
  const [leadDaysInput, setLeadDaysInput] = useState("3");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [savedRecipients, setSavedRecipients] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [start, setStart] = useState(localDay());
  const [end, setEnd] = useState("");
  const [flow, setFlow] = useState<CycleEntry["flow"]>("unspecified");
  const [observations, setObservations] = useState("");
  const [month, setMonth] = useState(localDay().slice(0, 7));

  useEffect(() => {
    if (local.data && !data) {
      setData(local.data);
      setBaseData(local.data);
      setExpectedDaysInput(String(local.data.expectedDays));
      setLeadDaysInput(String(local.data.leadDays));
    }
  }, [local.data, data]);
  useEffect(() => {
    if (!remote.data) return;
    const own = remote.data.shares.find((row) => row.owner_user_id === context.userId);
    setSharing(!!own);
    setRecipients(own?.recipients ?? []);
    setSavedRecipients(own?.recipients ?? []);
    setReminding(!!remote.data.reminder);
  }, [remote.data, context.userId]);

  const estimate = data ? estimateCycle(data) : null;
  const latest = data
    ? [...data.entries].sort((first, second) => second.start.localeCompare(first.start))[0]
    : null;

  const publishSummary = async (next: CycleData, enabled: boolean, audience = savedRecipients) => {
    const last = [...next.entries].sort((first, second) =>
      second.start.localeCompare(first.start),
    )[0];
    await share({
      data: {
        enabled: enabled && !!last,
        start: last?.start ?? null,
        end: last?.end ?? null,
        next: estimateCycle(next)?.next ?? null,
        recipients: audience,
      },
    });
  };

  const scheduleReminder = async (next: CycleData, enabled: boolean) => {
    const prediction = estimateCycle(next);
    const due = prediction
      ? new Date(`${addDays(prediction.next, -next.leadDays)}T09:00:00`)
      : null;
    const validDue = enabled && due && due.getTime() > Date.now() ? due.toISOString() : null;
    await reminder({ data: { due: validDue, next: validDue ? prediction!.next : null } });
    if (enabled && !validDue)
      toast.info("Sin fecha futura para el aviso. Se recalculará al guardar un nuevo inicio.");
  };

  const commit = async (next: CycleData) => {
    const parsed = CycleDataSchema.parse(next);
    validateCycleEntries(parsed.entries);
    await saveCycleLocal(context.userId, context.householdId, parsed, baseData ?? undefined);
    setData(parsed);
    setBaseData(parsed);
    if (remote.isPending || remote.error) {
      setSyncError(
        "Registro guardado localmente. No se ha podido comprobar si hay un resumen o aviso autorizado en el servidor; reintenta la sincronización cuando vuelva la conexión.",
      );
      return;
    }
    try {
      if (sharing) await publishSummary(parsed, true);
      if (reminding) await scheduleReminder(parsed, true);
      setSyncError("");
    } catch {
      setSyncError(
        "El registro está guardado localmente, pero no se pudo actualizar el resumen o aviso. Reintenta la sincronización antes de darlo por actualizado.",
      );
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error: any) {
      toast.error(error.message || "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  };

  if (local.isPending) return <p role="status">Leyendo registros de este dispositivo…</p>;
  if (local.error || !data)
    return (
      <div role="alert">
        <p>No se pueden abrir los registros locales. No se han sobrescrito.</p>
        <Button onClick={() => local.refetch()}>Reintentar</Button>
      </div>
    );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Ciclo menstrual · espacio personal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Fechas, intensidad y observaciones se guardan solo en este navegador, separados por
            cuenta y hogar. No se envían al asistente, al historial familiar ni a Telegram. No están
            cifrados localmente: evita dispositivos compartidos.
          </p>
          <p className="font-medium">
            Borrar los datos del navegador o desinstalar la PWA puede eliminar el registro. Exporta
            una copia si deseas conservarlo.
          </p>
          <p>
            Las estimaciones son orientativas, pueden adelantarse o retrasarse y no son un
            diagnóstico ni un método anticonceptivo.
          </p>
          <p>
            {latest
              ? `Último inicio: ${dayLabel(latest.start)}${latest.end ? ` · Fin: ${dayLabel(latest.end)}` : " · Sin fecha de fin"}`
              : "Aún no hay registros en este dispositivo."}
          </p>
          {estimate && (
            <div className="rounded-md bg-secondary p-3">
              <p className="font-semibold">Próximo inicio estimado: {dayLabel(estimate.next)}</p>
              <p>
                {estimate.samples
                  ? `Media de ${estimate.samples} intervalo(s) registrado(s): ${estimate.days} días.`
                  : `Sin historial suficiente: se usan tus ${estimate.days} días configurados.`}
              </p>
              <p>
                Referencia visual: {dayLabel(estimate.from)} – {dayLabel(estimate.to)} (±
                {data.leadDays} días, no una garantía).
              </p>
              {estimate.next < localDay() && (
                <p className="font-semibold">
                  La fecha estimada ya ha pasado. Registra el inicio real cuando corresponda; no se
                  ha creado un ciclo automáticamente.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {remote.error && (
        <p role="alert" className="rounded-md border p-3 text-sm">
          El registro local sigue disponible, pero no se puede comprobar el estado compartido o los
          avisos. Verifica la migración y la conexión antes de compartir.
        </p>
      )}
      {syncError && (
        <div role="alert" className="space-y-2 rounded-md border p-3">
          <p>{syncError}</p>
          <Button
            disabled={busy || remote.isPending || !!remote.error}
            onClick={() =>
              run(async () => {
                if (sharing) await publishSummary(data, true);
                if (reminding) await scheduleReminder(data, true);
                setSyncError("");
              })
            }
          >
            Reintentar sincronización
          </Button>
        </div>
      )}

      <form
        className="space-y-4 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const entry = CycleEntrySchema.parse({
              id: editing ?? crypto.randomUUID(),
              start,
              end: end || null,
              flow,
              observations,
            });
            if (entry.start > localDay() || (entry.end && entry.end > localDay()))
              throw new Error("Registra fechas observadas, no futuras");
            await commit({
              ...data,
              entries: [...data.entries.filter((value) => value.id !== editing), entry],
            });
            setEditing(null);
            setStart(localDay());
            setEnd("");
            setFlow("unspecified");
            setObservations("");
            toast.success("Registro guardado en este dispositivo");
          });
        }}
      >
        <h3 className="font-semibold">{editing ? "Editar registro" : "Registrar menstruación"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 space-y-1 text-sm">
            Inicio
            <Input
              type="date"
              required
              value={start}
              max={localDay()}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            Fin (opcional)
            <Input
              type="date"
              min={start}
              max={localDay()}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
        <Select value={flow} onValueChange={(value) => setFlow(value as CycleEntry["flow"])}>
          <SelectTrigger aria-label="Intensidad del sangrado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(flows).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="block space-y-1 text-sm">
          Síntomas u observaciones (opcional)
          <Textarea
            maxLength={2000}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            placeholder="Adelanto, retraso, sangrado escaso o abundante, molestias…"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} type="submit">
            {busy ? "Guardando…" : "Guardar registro"}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setObservations("");
                setEnd("");
                setStart(localDay());
                setFlow("unspecified");
              }}
            >
              Cancelar edición
            </Button>
          )}
        </div>
      </form>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Calendario personal</h3>
        <Input
          type="month"
          aria-label="Mes del calendario menstrual"
          value={month}
          onChange={(event) => {
            if (event.target.value) setMonth(event.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Rosa: días registrados. Borde discontinuo: próximo inicio estimado, no confirmado.
        </p>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["L", "M", "X", "J", "V", "S", "D"].map((day, index) => (
            <span key={index}>{day}</span>
          ))}
          {Array.from(
            { length: (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7 },
            (_, index) => (
              <span key={`empty-${index}`} />
            ),
          )}
          {Array.from(
            { length: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() },
            (_, index) => {
              const date = `${month}-${String(index + 1).padStart(2, "0")}`;
              const recorded = data.entries.some(
                (entry) => date >= entry.start && date <= (entry.end ?? entry.start),
              );
              return (
                <div
                  key={date}
                  title={`${dayLabel(date)}${recorded ? " · Registrado" : ""}${estimate?.next === date ? " · Estimado" : ""}`}
                  className={`rounded p-2 ${recorded ? "bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-100" : ""} ${estimate?.next === date ? "border-2 border-dashed border-primary" : ""}`}
                >
                  {index + 1}
                </div>
              );
            },
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Mis registros (solo este dispositivo)</h3>
        {[...data.entries]
          .sort((first, second) => second.start.localeCompare(first.start))
          .map((entry) => (
            <div key={entry.id} className="space-y-2 border-b pb-3 text-sm">
              <p className="font-medium">
                {dayLabel(entry.start)} –{" "}
                {entry.end ? dayLabel(entry.end) : "en curso / fin sin registrar"} ·{" "}
                {flows[entry.flow]}
              </p>
              <p className="whitespace-pre-wrap break-words">{entry.observations}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(entry.id);
                    setStart(entry.start);
                    setEnd(entry.end ?? "");
                    setFlow(entry.flow);
                    setObservations(entry.observations);
                  }}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Eliminar este registro local y actualizar su resumen compartido si existe?",
                      )
                    )
                      void run(() =>
                        commit({
                          ...data,
                          entries: data.entries.filter((value) => value.id !== entry.id),
                        }),
                      );
                  }}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        {!data.entries.length && <p className="text-sm text-muted-foreground">Sin registros.</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `homesync-ciclo-${localDay()}.json`;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Exportar copia personal
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !!remote.error || remote.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "¿Borrar TODOS los registros de este dispositivo y retirar el resumen y el aviso del servidor? No se puede deshacer.",
                )
              )
                void run(async () => {
                  await publishSummary(EMPTY_CYCLE, false);
                  await reminder({ data: { due: null, next: null } });
                  await saveCycleLocal(
                    context.userId,
                    context.householdId,
                    null,
                    baseData ?? undefined,
                  );
                  setData({ ...EMPTY_CYCLE, entries: [] });
                  setBaseData(EMPTY_CYCLE);
                  setSharing(false);
                  setReminding(false);
                  setSyncError("");
                  await remote.refetch();
                });
            }}
          >
            Borrar mis datos y retirar acceso
          </Button>
        </div>
      </section>

      <form
        className="space-y-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            commit({
              ...data,
              expectedDays: Number(expectedDaysInput),
              leadDays: Number(leadDaysInput),
            }),
          );
        }}
      >
        <h3 className="font-semibold">Estimación y aviso previo</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.estimateEnabled}
            onChange={(event) => setData({ ...data, estimateEnabled: event.target.checked })}
          />
          Mostrar estimación orientativa
        </label>
        <label className="block space-y-1 text-sm">
          Duración de referencia sin historial (días)
          <Input
            type="number"
            required
            min={10}
            max={120}
            value={expectedDaysInput}
            onChange={(event) => setExpectedDaysInput(event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Avisarme cuántos días antes (1–14)
          <Input
            type="number"
            required
            min={1}
            max={14}
            value={leadDaysInput}
            onChange={(event) => setLeadDaysInput(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy}>
          Guardar ajustes locales
        </Button>
        <p className="text-sm text-muted-foreground">
          Para avisar con la app cerrada se guardan solo tu fecha estimada y la hora del aviso en el
          servidor. Push genérico “Recordatorio personal”, exclusivamente a tus dispositivos; nunca
          a otros miembros ni a Telegram. Requiere Push ya activado en Ajustes → Notificaciones y el
          programador del servidor. No se garantiza entrega exacta.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy || remote.isPending || !!remote.error || (!estimate && !reminding)}
          onClick={() =>
            run(async () => {
              const enabled = !reminding;
              if (
                enabled &&
                !window.confirm(
                  "¿Autorizar guardar la próxima fecha y el aviso en el servidor para enviarte un Push personal?",
                )
              )
                return;
              await scheduleReminder(data, enabled);
              setReminding(enabled);
              await remote.refetch();
            })
          }
        >
          {reminding ? "Desactivar aviso Push y borrar su fecha" : "Activar aviso Push personal"}
        </Button>
        {remote.data?.reminder && (
          <p className="text-sm">
            {remote.data.reminder.notified_at
              ? "Aviso procesado"
              : remote.data.reminder.attempts >= 3
                ? "No se pudo entregar tras tres intentos"
                : "Aviso programado"}
            : {new Date(remote.data.reminder.due_at).toLocaleString("es-ES")}
          </p>
        )}
      </form>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Compartir solo el resumen de fechas</h3>
        <p className="text-sm">
          Estado:{" "}
          {remote.isPending || remote.error
            ? "sin comprobar; verifica la conexión"
            : sharing
              ? "resumen compartido"
              : "sin compartir"}
          . Al autorizarlo, solo el último inicio, fin y próxima fecha estimada se guardan en el
          servidor. Síntomas y notas nunca salen del dispositivo. No concede acceso a los
          administradores. Retirar acceso no borra capturas de terceros.
        </p>
        <RecipientPicker context={context} selected={recipients} onChange={setRecipients} />
        {latest && (
          <p className="text-sm">
            Se publicará: inicio {dayLabel(latest.start)}, fin{" "}
            {latest.end ? dayLabel(latest.end) : "sin registrar"}, estimación{" "}
            {estimate ? dayLabel(estimate.next) : "desactivada"}.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !latest || !recipients.length || remote.isPending || !!remote.error}
            onClick={() =>
              run(async () => {
                if (
                  !window.confirm(
                    "¿Compartir estas fechas con las personas seleccionadas y guardarlas en el servidor?",
                  )
                )
                  return;
                await publishSummary(data, true, recipients);
                setSavedRecipients(recipients);
                setSharing(true);
                await remote.refetch();
              })
            }
          >
            {sharing ? "Actualizar destinatarios y resumen" : "Autorizar y compartir fechas"}
          </Button>
          {sharing && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await publishSummary(data, false);
                  setSharing(false);
                  await remote.refetch();
                })
              }
            >
              Retirar acceso y borrar resumen
            </Button>
          )}
        </div>
      </section>
      {(remote.data?.shares ?? [])
        .filter((row) => row.owner_user_id !== context.userId)
        .map((row) => (
          <Card key={row.owner_user_id}>
            <CardContent className="space-y-1 p-4 text-sm">
              <h3 className="font-semibold">
                Resumen compartido por{" "}
                {context.members.find((member) => member.user_id === row.owner_user_id)
                  ?.display_name ?? "Miembro"}
              </h3>
              <p>
                Inicio: {dayLabel(row.start_date)} · Fin:{" "}
                {row.end_date ? dayLabel(row.end_date) : "sin registrar"}
              </p>
              <p>
                Próximo inicio estimado: {row.next_date ? dayLabel(row.next_date) : "no compartido"}
              </p>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
