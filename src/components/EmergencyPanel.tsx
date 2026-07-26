import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, ShieldAlert, MapPin, Clock, Navigation } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  listEmergencyContacts,
  createEmergencyContact,
  deleteEmergencyContact,
  setMemberEmergencyContact,
} from "@/lib/emergency-contacts.functions";
import { listSosEvents } from "@/lib/sos.functions";

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

  const doCreate = useServerFn(createEmergencyContact);
  const doDelete = useServerFn(deleteEmergencyContact);
  const doToggle = useServerFn(setMemberEmergencyContact);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");

  const adults = members.filter((m) => !m.is_child);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["emergency-contacts"] });
    qc.invalidateQueries({ queryKey: ["household"] });
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

  return (
    <div className="space-y-6">
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
            const lat = Number(s.latitude);
            const lng = Number(s.longitude);
            const d = 0.004;
            const bbox = hasLoc
              ? `${lng - d},${lat - d},${lng + d},${lat + d}`
              : null;
            return (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{s.triggered_by_name}</p>
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" /> SOS
                  </Badge>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(s.created_at).toLocaleString()}
                  </span>
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
                {s.note && <p className="mt-1 text-sm">{s.note}</p>}
                {isLatest && hasLoc && bbox && (
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
