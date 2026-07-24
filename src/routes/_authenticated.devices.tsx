import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, Thermometer, Shield, Power, Trash2, RefreshCw, Activity, Settings2, Search, Eye, EyeOff, X, Star, Maximize, Minimize } from "lucide-react";
import { syncHomeAssistantEntities, callHomeAssistantService } from "@/lib/home-assistant.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { listDevices, updateDevice, deleteDevice, setDevicesHidden, setDeviceQuickAccess } from "@/lib/devices.functions";
import { detectIntegration, INTEGRATION_LABELS, type IntegrationKey } from "@/lib/device-integration";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


const devicesQueryOptions = queryOptions({
  queryKey: ["devices"],
  queryFn: () => listDevices(),
});

export const Route = createFileRoute("/_authenticated/devices")({
  validateSearch: (search: Record<string, unknown>) => ({
    panel: search.panel === "1" || search.panel === 1 || search.panel === true ? 1 : 0,
  }),
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
  const { panel } = Route.useSearch();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [integrationFilter, setIntegrationFilter] = useState<string>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [manageHidden, setManageHidden] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const doUpdate = useServerFn(updateDevice);
  const doDelete = useServerFn(deleteDevice);
  const doSetHidden = useServerFn(setDevicesHidden);
  const doSetQuick = useServerFn(setDeviceQuickAccess);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["devices"] });

  const toggleDevice = async (device: any) => {
    const next = device.status === "on" ? "off" : "on";
    await doUpdate({ data: { id: device.id, status: next } });
    refresh();
  };

  const toggleQuick = async (device: any) => {
    const next = !device.quick_access;
    await doSetQuick({ data: { id: device.id, quick_access: next } });
    toast.success(next ? "Añadido a accesos rápidos" : "Quitado de accesos rápidos");
    refresh();
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enterPanelFullscreen = async () => {
    try {
      if (panelRef.current && !document.fullscreenElement) {
        await panelRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo activar pantalla completa");
    }
  };

  // If arriving with ?panel=1, auto-enter fullscreen panel view
  useEffect(() => {
    if (panel === 1 && panelRef.current && !document.fullscreenElement) {
      panelRef.current.requestFullscreen().catch(() => { /* user gesture required */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




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

  const rooms = useMemo(() => {
    const s = new Set<string>();
    for (const d of data as any[]) if (d.room) s.add(d.room);
    return Array.from(s).sort();
  }, [data]);

  const devicesWithIntegration = useMemo(
    () => (data as any[]).map((d) => ({ ...d, __integration: detectIntegration(d) as IntegrationKey })),
    [data],
  );

  const integrationCounts = useMemo(() => {
    const m = new Map<IntegrationKey, number>();
    for (const d of devicesWithIntegration) m.set(d.__integration, (m.get(d.__integration) ?? 0) + 1);
    return m;
  }, [devicesWithIntegration]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devicesWithIntegration.filter((d) => {
      if (!showHidden && d.hidden) return false;
      if (typeFilter !== "all" && d.type !== typeFilter && d.domain !== typeFilter) return false;
      if (roomFilter !== "all" && (d.room || "") !== (roomFilter === "__none" ? "" : roomFilter)) return false;
      if (integrationFilter !== "all" && d.__integration !== integrationFilter) return false;
      if (statusFilter !== "all") {
        const isSensor = d.type === "sensor" || d.domain === "sensor" || d.domain === "binary_sensor";
        if (statusFilter === "sensor" && !isSensor) return false;
        if (statusFilter === "on" && d.status !== "on") return false;
        if (statusFilter === "off" && d.status !== "off") return false;
      }
      if (q) {
        const hay = `${d.name ?? ""} ${d.room ?? ""} ${d.domain ?? ""} ${d.type ?? ""} ${d.external_id ?? ""} ${INTEGRATION_LABELS[d.__integration as IntegrationKey] ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [devicesWithIntegration, search, typeFilter, statusFilter, roomFilter, integrationFilter, showHidden]);


  const hiddenCount = (data as any[]).filter((d) => d.hidden).length;

  const toggleHidden = async (device: any) => {
    const next = !device.hidden;
    await doSetHidden({ data: { ids: [device.id], hidden: next } });
    toast.success(next ? "Dispositivo ocultado" : "Dispositivo visible");
    refresh();
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setRoomFilter("all");
    setIntegrationFilter("all");
  };

  const hasFilters = !!search || typeFilter !== "all" || statusFilter !== "all" || roomFilter !== "all" || integrationFilter !== "all";

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
        </div>

      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, habitación o entidad..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todos los tipos</option>
            {deviceTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
            <option value="switch">Switch (HA)</option>
            <option value="sensor">Sensor (HA)</option>
            <option value="binary_sensor">Sensor binario (HA)</option>
            <option value="cover">Persiana (HA)</option>
            <option value="media_player">Media player (HA)</option>
            <option value="climate">Clima (HA)</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Cualquier estado</option>
            <option value="on">Encendidos</option>
            <option value="off">Apagados</option>
            <option value="sensor">Sensores</option>
          </select>
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todas las habitaciones</option>
            <option value="__none">Sin habitación</option>
            {rooms.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={integrationFilter}
            onChange={(e) => setIntegrationFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            title="Filtrar por aplicación/integración"
          >
            <option value="all">Todas las apps</option>
            {(Object.keys(INTEGRATION_LABELS) as IntegrationKey[])
              .filter((k) => (integrationCounts.get(k) ?? 0) > 0)
              .sort((a, b) => INTEGRATION_LABELS[a].localeCompare(INTEGRATION_LABELS[b]))
              .map((k) => (
                <option key={k} value={k}>
                  {INTEGRATION_LABELS[k]} ({integrationCounts.get(k)})
                </option>
              ))}
          </select>
          <Button
            type="button"
            variant={showHidden ? "default" : "outline"}
            size="sm"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
            {showHidden ? "Ocultos visibles" : `Mostrar ocultos${hiddenCount ? ` (${hiddenCount})` : ""}`}
          </Button>
          <Button
            type="button"
            variant={manageHidden ? "default" : "outline"}
            size="sm"
            onClick={() => setManageHidden((v) => !v)}
          >
            {manageHidden ? "Salir de gestión" : "Gestionar visibilidad"}
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-2 h-4 w-4" /> Limpiar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {(data as any[]).length} dispositivos
          {hiddenCount ? ` · ${hiddenCount} ocultos` : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay dispositivos que coincidan con los filtros.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((device: any) => {
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
              <Card key={device.id} className={cn(device.hidden && "opacity-60")}>
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
                        <p className="font-semibold">
                          {device.name}
                          {device.hidden && <span className="ml-2 text-xs text-muted-foreground">(oculto)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isHa ? `HA · ${device.domain ?? typeInfo.label}` : typeInfo.label} · {device.room || "Sin habitación"}
                          {device.__integration && device.__integration !== "other" && (
                            <span className="ml-1">· {INTEGRATION_LABELS[device.__integration as IntegrationKey]}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(manageHidden || device.hidden) && (
                        <button
                          onClick={() => toggleHidden(device)}
                          className="text-muted-foreground hover:text-foreground"
                          title={device.hidden ? "Mostrar" : "Ocultar"}
                        >
                          {device.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                      )}
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
      )}
    </div>
  );
}

