import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Calendar, CheckCircle2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";
import {
  getGoogleCalendarStatus,
  startGoogleCalendarConnect,
  saveGoogleCalendarConnection,
  disconnectGoogleCalendar,
  syncGoogleCalendarImport,
  getGoogleSyncHours,
  setGoogleSyncHours,
} from "@/lib/google-calendar.functions";
import { Clock } from "lucide-react";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";

export const Route = createFileRoute("/_authenticated/settings/google-calendar")({
  head: () => ({ meta: [{ title: "Google Calendar — HomeSync" }] }),
  component: GoogleCalendarSettings,
});

function GoogleCalendarSettings() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getGoogleCalendarStatus);
  const startConnect = useServerFn(startGoogleCalendarConnect);
  const saveConn = useServerFn(saveGoogleCalendarConnection);
  const doDisconnect = useServerFn(disconnectGoogleCalendar);
  const doSync = useServerFn(syncGoogleCalendarImport);
  const getHours = useServerFn(getGoogleSyncHours);
  const saveHours = useServerFn(setGoogleSyncHours);

  const { data: status } = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => getStatus(),
  });

  const { data: hoursData } = useQuery({
    queryKey: ["google-sync-hours"],
    queryFn: () => getHours(),
    enabled: !!status?.connected,
  });

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const savedTz = hoursData?.timezone;
  const [selectedHours, setSelectedHours] = useState<number[] | null>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const hours = selectedHours ?? hoursData?.hours ?? [6, 15];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast.success("Google Calendar conectado");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      window.history.replaceState({}, "", "/settings/google-calendar");
    }
    const googleError = params.get("google_error");
    if (googleError) {
      toast.error(`Google Calendar: ${googleError}`);
      window.history.replaceState({}, "", "/settings/google-calendar");
    }
  }, [qc]);

  const toggleHour = (h: number) => {
    const base = selectedHours ?? hoursData?.hours ?? [6, 15];
    const next = base.includes(h) ? base.filter((x) => x !== h) : [...base, h].sort((a, b) => a - b);
    setSelectedHours(next);
  };

  const handleSaveHours = async () => {
    try {
      const tz = savedTz || browserTz || "UTC";
      const r = await saveHours({ data: { hours, timezone: tz } });
      setSelectedHours(null);
      qc.setQueryData(["google-sync-hours"], { hours: r.hours, timezone: r.timezone });
      toast.success("Horario de sincronización guardado");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    }
  };

  const handleConnect = async () => {
    if (status && !status.connectorConfigured) {
      toast.error("Google Calendar no está configurado en Lovable");
      return;
    }
    setBusy("connect");
    try {
      const started = await startConnect({ data: window.location.origin });
      if (started.mode === "redirect") {
        window.location.href = started.authorizationUrl;
        return;
      }
      const result = await connectAppUser({
        connectorId: CONNECTOR_ID,
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: () => Promise.resolve(started),
      });
      if (!result.success) {
        toast.error(result.error || "No se pudo conectar");
        return;
      }
      if (!result.connectionAPIKey) {
        toast.error("Google no devolvió acceso offline. Vuelve a intentarlo.");
        return;
      }
      await saveConn({ data: { connectionAPIKey: result.connectionAPIKey } });
      toast.success("Google Calendar conectado");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    } catch (e: any) {
      toast.error(e?.message || "Error conectando con Google");
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy("sync");
    try {
      const r = await doSync();
      toast.success(
        `Importados ${r.inserted} nuevos · ${r.updated} actualizados · ${r.skipped} sin cambios`,
      );
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e: any) {
      toast.error(e?.message || "Error al sincronizar");
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("¿Desconectar Google Calendar? Los eventos ya importados se conservarán.")) return;
    setBusy("disconnect");
    try {
      await doDisconnect();
      toast.success("Desconectado");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    } catch (e: any) {
      toast.error(e?.message || "Error al desconectar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Calendar className="h-6 w-6" /> Google Calendar
        </h2>
        <p className="text-muted-foreground">
          Conecta tu cuenta de Google para sincronizar eventos entre HomeSync y tu calendario.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Estado{" "}
            {status?.connected ? (
              <Badge className="gap-1 bg-emerald-500/15 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Conectado
              </Badge>
            ) : (
              <Badge variant="secondary">No conectado</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status && !status.connectorConfigured && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Google Calendar no está configurado en este entorno.</p>
                <p className="text-xs">
                  En Cloudflare faltan <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> y{" "}
                  <code>GOOGLE_REDIRECT_URI</code>. En Lovable también puede usarse el conector antiguo.
                </p>
              </div>
            </div>
          )}
          {status?.connectorConfigured && (
            <p className="text-xs text-muted-foreground">
              Modo de conexión:{" "}
              <strong>
                {status.mode === "direct_oauth"
                  ? "OAuth propio"
                  : status.mode === "lovable_connector"
                    ? "Conector Lovable"
                    : "no configurado"}
              </strong>
            </p>
          )}
          {status && !status.configured && status.connectorConfigured && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">No se puede comprobar la conexión guardada.</p>
                <p className="text-xs">
                  Falta la configuración admin de Supabase. El calendario local puede seguir funcionando, pero la
                  conexión con Google no se puede verificar desde aquí.
                </p>
              </div>
            </div>
          )}
          {!status?.connected && (
            <Button onClick={handleConnect} disabled={busy !== null || (status ? !status.connectorConfigured : false)}>
              {busy === "connect" ? "Abriendo Google..." : "Conectar con Google"}
            </Button>
          )}
          {status?.connected && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSync} disabled={busy !== null}>
                <RefreshCw className={`mr-2 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
                Importar eventos de Google
              </Button>
              <Button variant="outline" onClick={handleDisconnect} disabled={busy !== null}>
                <Unplug className="mr-2 h-4 w-4" />
                Desconectar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {status?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Sincronización automática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Elige las horas <strong>locales</strong> de tu dispositivo en las que HomeSync
              importará automáticamente los eventos de tu Google Calendar. Por defecto:{" "}
              <strong>06:00</strong> y <strong>15:00</strong>.
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Zona horaria detectada:</span>
              <span>{savedTz || browserTz || "UTC"}</span>
              {savedTz && savedTz !== browserTz && (
                <span className="text-amber-600">(este dispositivo: {browserTz})</span>
              )}
            </div>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
              {Array.from({ length: 24 }, (_, h) => {
                const active = hours.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHour(h)}
                    className={`rounded-md border px-2 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Seleccionadas: {hours.length === 0 ? "ninguna (desactivado)" : hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")}
              </p>
              <Button size="sm" onClick={handleSaveHours} disabled={selectedHours === null}>
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}



      <Card>
        <CardHeader>
          <CardTitle>Cómo funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Privacidad por defecto:</strong> los eventos importados son privados y solo tú
            los ves. En el calendario puedes marcarlos como "Compartido con el hogar" cuando quieras
            que el resto de la familia los vea.
          </p>
          <p>
            <strong>Importar:</strong> pulsa "Importar eventos de Google" para traer tus eventos de
            los últimos 7 días y los próximos 90 días desde tu calendario principal.
          </p>
          <p>
            <strong>Exportar:</strong> al crear un evento en HomeSync puedes marcar "Publicar en
            Google Calendar" y aparecerá también en tu calendario de Google. Las ediciones y
            borrados en HomeSync se replican en Google.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
