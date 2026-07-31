import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, ShieldAlert, MapPin, Clock, Navigation, Radio, Send, Users, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  listEmergencyContacts,
  listEmergencyRecipients,
  createEmergencyContact,
  deleteEmergencyContact,
  setMemberEmergencyContact,
} from "@/lib/emergency-contacts.functions";
import { cancelSos, listSosEvents, triggerSosSimulation } from "@/lib/sos.functions";

export function EmergencyPanel({ members }: { members: any[] }) {
  const qc = useQueryClient();
  const { data: contacts = [] } = useQuery({
    queryKey: ["emergency-contacts"],
    queryFn: () => listEmergencyContacts(),
  });
  const { data: sosEvents = [] } = useQuery({
    queryKey: ["sos-events"],
    queryFn: () => listSosEvents(),
  });
  const { data: recipients } = useQuery({
    queryKey: ["emergency-recipients"],
    queryFn: () => listEmergencyRecipients(),
  });

  const doCreate = useServerFn(createEmergencyContact);
  const doDelete = useServerFn(deleteEmergencyContact);
  const doToggle = useServerFn(setMemberEmergencyContact);
  const doSimulation = useServerFn(triggerSosSimulation);
  const doCancelSos = useServerFn(cancelSos);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [simulationLoading, setSimulationLoading] = useState(false);

  const adults = members.filter((m) => !m.is_child);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["emergency-contacts"] });
    qc.invalidateQueries({ queryKey: ["emergency-recipients"] });
    qc.invalidateQueries({ queryKey: ["household"] });
  };

  const refreshSos = () => {
    qc.invalidateQueries({ queryKey: ["sos-events"] });
    qc.invalidateQueries({ queryKey: ["emergency-recipients"] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await doCreate({
        data: {
          name: name.trim(),
          phone: phone.trim() || null,
          telegram_chat_id: telegram.trim() || null,
        },
      });
      toast.success("Contacto añadido");
      setName("");
      setPhone("");
      setTelegram("");
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo añadir");
    }
  };

  const runSimulation = async () => {
    const ok = window.confirm(
      "Se enviará un SIMULACRO SOS a los destinatarios configurados. El mensaje indicará claramente que no es una emergencia real.",
    );
    if (!ok) return;

    setSimulationLoading(true);
    try {
      const result: any = await doSimulation();
      refreshSos();
      const status = result?.notification_status;
      if (status?.ok) {
        const channels = [
          status.telegramSent ? `${status.telegramSent} Telegram` : null,
          status.pushSent ? "push" : null,
        ].filter(Boolean).join(" + ");
        toast.success(`Simulacro SOS enviado${channels ? ` por ${channels}` : ""}`);
      } else {
        toast.warning("Simulacro registrado, pero no se pudo confirmar el envío de notificaciones");
      }
    } catch (err: any) {
      toast.error(err?.message || "No se pudo lanzar el simulacro");
    } finally {
      setSimulationLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-5 w-5 text-destructive" />
            Simulacro SOS
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Envía una alerta marcada como simulacro para comprobar destinatarios y acuse sin generar recordatorios automáticos.
            </p>
            <p className="text-xs text-muted-foreground">
              Receptores disponibles ahora: {recipients?.totalReachable ?? 0}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={runSimulation}
            disabled={simulationLoading || (recipients?.totalReachable ?? 0) === 0}
            className="shrink-0"
          >
            <Send className="mr-2 h-4 w-4" />
            {simulationLoading ? "Enviando..." : "Enviar simulacro"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Adultos que reciben alertas SOS y escalado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {adults.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay adultos en el hogar.</p>
          )}
          {adults.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{m.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.is_emergency_contact ? "Recibe SOS y toma retrasada" : "No recibe alertas de emergencia"}
                </p>
              </div>
              <Switch
                checked={!!m.is_emergency_contact}
                onCheckedChange={async (v) => {
                  try {
                    await doToggle({ data: { member_id: m.id, is_emergency_contact: v } });
                    invalidate();
                  } catch (err: any) {
                    toast.error(err?.message || "No se pudo actualizar");
                  }
                }}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Si no marcas ninguno, las alertas van a todos los adultos por defecto.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Receptores SOS reales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(recipients?.totalReachable ?? 0) === 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              No hay ningún receptor con Telegram o push activo. El SOS se registrará, pero no podrá confirmar envío.
            </div>
          )}
          {(recipients?.members ?? []).map((r: any) => (
            <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.selected
                    ? r.fallback
                      ? "Recibe por fallback: no hay adultos marcados como contacto SOS"
                      : "Marcado como contacto SOS"
                    : "No seleccionado para SOS"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <ChannelBadge active={r.telegram} label="Telegram" />
                <ChannelBadge active={r.push} label="Push" />
                {r.reachable && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Recibe
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {(recipients?.externalContacts ?? []).map((r: any) => (
            <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  Contacto externo{r.phone ? ` · ${r.phone}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <ChannelBadge active={r.telegram} label="Telegram" />
                {r.reachable && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Recibe
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contactos externos (Telegram)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin contactos externos.</p>
          )}
          {contacts.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.telegram_chat_id ? `Telegram: ${c.telegram_chat_id}` : "Sin Telegram"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await doDelete({ data: { id: c.id } });
                    toast.success("Contacto eliminado");
                    invalidate();
                  } catch (err: any) {
                    toast.error(err?.message || "No se pudo eliminar");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <form onSubmit={submit} className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vecina Ana" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+34…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Chat ID Telegram</Label>
              <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="123456789" />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" size="sm" disabled={!name.trim()}>
                <Plus className="mr-2 h-4 w-4" /> Añadir contacto
              </Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground">
            El contacto debe haber escrito antes al bot para que Telegram permita entregarle mensajes. Pídele
            que envíe cualquier mensaje al bot y usa <code>/start</code> para obtener su chat ID.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial SOS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sosEvents.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin activaciones registradas.</p>
          )}
          {sosEvents.map((s: any, idx: number) => {
            const hasLoc = s.latitude != null && s.longitude != null;
            const isLatest = idx === 0;
            const isTest = Boolean(s.is_test);
            const isCancelled = Boolean(s.cancelled_at);
            const canCancel = Boolean(s.can_cancel && !s.cancelled_at && !s.acknowledged_at && !s.is_test);
            const acks = Array.isArray(s.sos_acknowledgements) ? s.sos_acknowledgements : [];
            const confirmed = acks.filter((a: any) => a.acknowledged_at);
            const pending = acks.length - confirmed.length;
            const firstAck = confirmed
              .slice()
              .sort((a: any, b: any) => new Date(a.acknowledged_at).getTime() - new Date(b.acknowledged_at).getTime())[0];
            const lat = Number(s.latitude);
            const lng = Number(s.longitude);
            const accuracy = s.location_accuracy != null ? Number(s.location_accuracy) : null;
            const d = 0.004;
            const bbox = hasLoc
              ? `${lng - d},${lat - d},${lng + d},${lat + d}`
              : null;
            return (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{s.triggered_by_name}</p>
                  <div className="flex flex-wrap justify-end gap-1">
                    {isTest && <Badge variant="outline">Simulacro</Badge>}
                    {isCancelled && <Badge variant="secondary">Cancelado</Badge>}
                    <Badge variant={isTest ? "secondary" : "destructive"} className="gap-1">
                      <ShieldAlert className="h-3 w-3" /> SOS
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                  {s.sos_type && <span>Tipo: {sosTypeLabel(s.sos_type)}</span>}
                  {hasLoc && (
                    <>
                      <a
                        href={`https://maps.google.com/?q=${lat},${lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <MapPin className="h-3 w-3" /> Ver ubicación
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Navigation className="h-3 w-3" /> Cómo llegar
                      </a>
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {acks.length > 0 && (
                    <Badge variant={pending === 0 ? "secondary" : firstAck ? "outline" : "destructive"} className="font-normal">
                      {confirmed.length}/{acks.length} confirmados
                    </Badge>
                  )}
                  {firstAck && (
                    <Badge variant="secondary" className="font-normal">
                      Primer acuse: {firstAck.recipient_name ?? "Destinatario"} · {new Date(firstAck.acknowledged_at).toLocaleTimeString()}
                    </Badge>
                  )}
                  {s.battery_level != null && (
                    <Badge variant="secondary" className="font-normal">
                      Batería {Math.round(Number(s.battery_level))}%{s.battery_charging ? " · cargando" : ""}
                    </Badge>
                  )}
                  {s.last_known_location_used && (
                    <Badge variant="outline" className="font-normal">
                      Última ubicación conocida
                    </Badge>
                  )}
                  {hasLoc ? (
                    <>
                      <Badge variant="secondary" className="font-normal">
                        {lat.toFixed(6)}, {lng.toFixed(6)}
                      </Badge>
                      {accuracy != null && (
                        <Badge variant="secondary" className="font-normal">
                          Precisión aprox. {Math.round(accuracy)} m
                        </Badge>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      Sin ubicación
                    </Badge>
                  )}
                </div>
                {s.note && <p className="mt-1 text-sm">{s.note}</p>}
                {isCancelled && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cancelado el {new Date(s.cancelled_at).toLocaleString()}
                    {s.cancel_reason ? ` · ${s.cancel_reason}` : ""}
                  </p>
                )}
                {canCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      const ok = window.confirm("¿Cancelar este SOS y detener los recordatorios?");
                      if (!ok) return;
                      try {
                        await doCancelSos({ data: { sosEventId: s.id, reason: "Cancelado por quien lanzó el aviso" } });
                        toast.success("SOS cancelado");
                        refreshSos();
                        qc.invalidateQueries({ queryKey: ["sos-pending-acks"] });
                      } catch (err: any) {
                        toast.error(err?.message || "No se pudo cancelar el SOS");
                      }
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar SOS
                  </Button>
                )}
                {acks.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium">Acuse de recibo</p>
                    <div className="flex flex-wrap gap-1">
                      {acks.map((a: any) => (
                        <Badge
                          key={a.id}
                          variant={a.acknowledged_at ? "secondary" : "outline"}
                          className="font-normal"
                        >
                          {a.acknowledged_at ? "✅" : "⏳"} {a.recipient_name ?? "Destinatario"}
                          {a.acknowledged_at
                            ? ` · ${new Date(a.acknowledged_at).toLocaleTimeString()}${a.channel ? ` (${a.channel})` : ""}`
                            : " · sin confirmar"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {isLatest && !isTest && hasLoc && bbox && (
                  <div className="mt-3 overflow-hidden rounded-lg border">
                    <iframe
                      title={`Mapa SOS ${s.id}`}
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`}
                      className="h-56 w-full"
                      loading="lazy"
                    />
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 bg-muted/50 py-2 text-xs font-medium text-primary hover:bg-muted"
                    >
                      <Navigation className="h-3 w-3" /> Abrir ruta en Google Maps
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge variant={active ? "secondary" : "outline"} className="font-normal">
      {active ? label : `Sin ${label.toLowerCase()}`}
    </Badge>
  );
}

function sosTypeLabel(type?: string | null) {
  switch (type) {
    case "medical":
      return "Médico";
    case "fall":
      return "Caída";
    case "unsafe":
      return "Inseguridad";
    case "other":
      return "Otro";
    case "urgency":
    default:
      return "Urgencia";
  }
}
