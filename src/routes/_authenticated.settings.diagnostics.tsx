import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Home,
  KeyRound,
  Shield,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDiagnostics } from "@/lib/diagnostics.functions";

const diagnosticsQueryOptions = queryOptions({
  queryKey: ["diagnostics"],
  queryFn: () => getDiagnostics(),
});

export const Route = createFileRoute("/_authenticated/settings/diagnostics")({
  loader: ({ context }) => context.queryClient.ensureQueryData(diagnosticsQueryOptions),
  head: () => ({
    meta: [{ title: "Diagnóstico - HomeSync" }],
  }),
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const { data } = useSuspenseQuery(diagnosticsQueryOptions);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">Diagnóstico</h2>
        </div>
        <p className="text-muted-foreground">
          Estado técnico de HomeSync. Solo muestra estados generales, no claves ni datos privados.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={Users} label="Miembros" value={data.summary.householdMembers} />
        <MetricCard icon={Bell} label="Telegram vinculados" value={data.summary.telegramLinkedUsers} />
        <MetricCard icon={Bell} label="Push de este usuario" value={data.summary.currentUserPushSubscriptions} />
        <MetricCard icon={ShieldAlert} label="Contactos emergencia" value={data.summary.emergencyContacts} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Configuración
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {data.environment.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Google Calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusLine
              label="Conexión del usuario actual"
              ok={data.integrations.googleCalendar.connected && data.integrations.googleCalendar.available}
              okText="Conectada"
              emptyText={data.integrations.googleCalendar.available ? "No conectada" : "No verificable"}
              warning={!data.integrations.googleCalendar.available}
            />
            <InfoLine
              label="Diagnóstico"
              value={data.integrations.googleCalendar.available ? "Consulta completada" : "Prueba funcional desde Calendario"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Home Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusLine
              label="Conexión del hogar"
              ok={data.integrations.homeAssistant.configured}
              okText={data.integrations.homeAssistant.status}
              emptyText="No configurada"
            />
            <StatusLine
              label="Errores recientes"
              ok={!data.integrations.homeAssistant.hasLastError}
              okText="Sin error registrado"
              emptyText="Hay un error registrado"
              warning
            />
            <InfoLine label="Última sincronización" value={formatDate(data.integrations.homeAssistant.lastSyncedAt)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Actividad reciente
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Último SOS</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.activity.latestSos ? formatDate(data.activity.latestSos.createdAt) : "Sin registros"}
            </p>
            {data.activity.latestSos && (
              <Badge variant={data.activity.latestSos.hasLocation ? "secondary" : "outline"} className="mt-3">
                {data.activity.latestSos.hasLocation
                  ? `Con ubicación${data.activity.latestSos.locationAccuracy ? ` · ${Math.round(data.activity.latestSos.locationAccuracy)} m` : ""}`
                  : "Sin ubicación"}
              </Badge>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Tomas pendientes</p>
            <p className="mt-1 text-2xl font-semibold">{formatNumber(data.activity.pendingMedicationIntakes)}</p>
            <p className="text-xs text-muted-foreground">Recordatorios de medicación sin completar</p>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Última toma generada</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.activity.latestMedicationIntake
                ? formatDate(data.activity.latestMedicationIntake.createdAt)
                : "Sin registros"}
            </p>
            {data.activity.latestMedicationIntake && (
              <Badge variant="outline" className="mt-3">
                {data.activity.latestMedicationIntake.status}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-4 w-4" />
        Generado el {formatDate(data.generatedAt)}
      </p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: number | null }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold">{formatNumber(value)}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "ok" | "warning" | "error" }) {
  if (status === "ok") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        OK
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Revisar
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="shrink-0 gap-1">
      <XCircle className="h-3 w-3" />
      Falta
    </Badge>
  );
}

function StatusLine({
  label,
  ok,
  okText,
  emptyText,
  warning,
}: {
  label: string;
  ok: boolean;
  okText: string;
  emptyText: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={ok ? "secondary" : warning ? "outline" : "destructive"}>{ok ? okText : emptyText}</Badge>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function formatNumber(value: number | null) {
  return typeof value === "number" ? String(value) : "-";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
