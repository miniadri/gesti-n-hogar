import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Lightbulb, Thermometer, Shield, Power, Trash2, RefreshCw, Activity, Settings2, Search, Eye, EyeOff, X } from "lucide-react";
import { syncHomeAssistantEntities, callHomeAssistantService } from "@/lib/home-assistant.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { listDevices, createDevice, updateDevice, deleteDevice, setDevicesHidden } from "@/lib/devices.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const devicesQueryOptions = queryOptions({
  queryKey: ["devices"],
  queryFn: () => listDevices(),
});

export const Route = createFileRoute("/_authenticated/devices")({
  loader: ({ context }) => context.queryClient.ensureQueryData(devicesQueryOptions),
  head: () => ({
    meta: [{ title: "Hogar inteligente - HomeSync" }],
  }),
  component: DevicesPage,
});

const deviceTypes = [
  { value: "light", label: "Luz", icon: Lightbulb },
  { value: "thermostat", label: "Termostato", icon: Thermometer },
  { value: "security", label: "Seguridad", icon: Shield },
  { value: "other", label: "Otro", icon: Power },
];

function DevicesPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(devicesQueryOptions);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("light");
  const [room, setRoom] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [manageHidden, setManageHidden] = useState(false);

  const doCreate = useServerFn(createDevice);
  const doUpdate = useServerFn(updateDevice);
  const doDelete = useServerFn(deleteDevice);
  const doSetHidden = useServerFn(setDevicesHidden);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["devices"] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({
        data: {
          name: name.trim(),
          type,
          room: room || undefined,
        },
      });
      toast.success("Dispositivo añadido");
      setName("");
      setRoom("");
      refresh();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir dispositivo");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDevice = async (device: any) => {
    const next = device.status === "on" ? "off" : "on";
    await doUpdate({ data: { id: device.id, status: next } });
    refresh();
  };

  const doSync = useServerFn(syncHomeAssistantEntities);
  const doCall = useServerFn(callHomeAssistantService);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = (await doSync()) as { count: number };
      toast.success(`Sincronizados ${res.count} dispositivos de Home Assistant`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  const toggleHa = async (device: any) => {
    const domain = device.domain ?? String(device.external_id ?? "").split(".")[0];
    const turnOn = device.status !== "on";
    // media_player uses media_play/pause; cover uses open/close. Everything else uses turn_on/off.
    let service = turnOn ? "turn_on" : "turn_off";
    if (domain === "cover") service = turnOn ? "open_cover" : "close_cover";
    if (domain === "media_player") service = turnOn ? "media_play" : "media_pause";
    try {
      await doCall({ data: { entity_id: device.external_id, service } });
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al enviar comando");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hogar inteligente</h2>
          <p className="text-muted-foreground">Control de dispositivos y mantenimiento</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
            Sincronizar HA
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings/home-assistant">
              <Settings2 className="mr-2 h-4 w-4" />
              Home Assistant
            </Link>
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Dispositivo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((device: any) => {
          const isHa = device.external_source === "home_assistant";
          const isSensor = device.type === "sensor" || device.domain === "sensor" || device.domain === "binary_sensor";
          const typeInfo = deviceTypes.find((t) => t.value === device.type) || deviceTypes[3];
          const Icon = isSensor ? Activity : typeInfo.icon;
          const attrs = device.attributes ?? {};
          const stateLabel = isSensor
            ? `${attrs.state ?? "-"}${attrs.unit_of_measurement ? ` ${attrs.unit_of_measurement}` : ""}`
            : device.status === "on"
              ? "Encendido"
              : "Apagado";
          return (
            <Card key={device.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-2xl",
                        device.status === "on" ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{device.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isHa ? `HA · ${device.domain ?? typeInfo.label}` : typeInfo.label} · {device.room || "Sin habitación"}
                      </p>
                    </div>
                  </div>
                  {!isHa && (
                    <button
                      onClick={async () => {
                        await doDelete({ data: { id: device.id } });
                        refresh();
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <Badge variant={device.status === "on" ? "default" : "secondary"}>{stateLabel}</Badge>
                  {isSensor ? null : isHa ? (
                    <Button size="sm" variant="outline" onClick={() => toggleHa(device)}>
                      {device.status === "on" ? "Apagar" : "Encender"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => toggleDevice(device)}>
                      {device.status === "on" ? "Apagar" : "Encender"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo dispositivo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {deviceTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Habitación</Label>
              <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Ej. Salón" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !name.trim()} className="w-full">
                {submitting ? "Añadiendo..." : "Añadir dispositivo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
