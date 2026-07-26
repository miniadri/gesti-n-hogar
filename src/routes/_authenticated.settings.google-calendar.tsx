import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, CheckCircle2, RefreshCw, Unplug } from "lucide-react";
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

  const [selectedHours, setSelectedHours] = useState<number[] | null>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const hours = selectedHours ?? hoursData?.hours ?? [6, 15];

  const toggleHour = (h: number) => {
    const base = selectedHours ?? hoursData?.hours ?? [6, 15];
    const next = base.includes(h) ? base.filter((x) => x !== h) : [...base, h].sort((a, b) => a - b);
    setSelectedHours(next);
  };

  const handleSaveHours = async () => {
    try {
      const r = await saveHours({ data: { hours } });
      setSelectedHours(null);
      qc.setQueryData(["google-sync-hours"], { hours: r.hours });
      toast.success("Horario de sincronización guardado");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    }
  };

  const handleConnect = async () => {
    setBusy("connect");
    try {
      const result = await connectAppUser({
        connectorId: CONNECTOR_ID,
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: (targetOrigin) => startConnect({ data: targetOrigin }),
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
          {!status?.connected && (
            <Button onClick={handleConnect} disabled={busy !== null}>
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
