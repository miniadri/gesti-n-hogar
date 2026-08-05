import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  HeartPulse,
  Landmark,
  Package,
  ReceiptText,
  ShoppingCart,
  Siren,
  Stethoscope,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listActivityCenter } from "@/lib/activity.functions";
import { cn } from "@/lib/utils";

type DomainFilter =
  | "all"
  | "needs_review"
  | "notification"
  | "sos"
  | "schedule"
  | "calendar"
  | "medication"
  | "inventory"
  | "shopping"
  | "receipt"
  | "health"
  | "finance";

const filters: Array<{ value: DomainFilter; label: string }> = [
  { value: "all", label: "Todo" },
  { value: "needs_review", label: "Pendiente/revisar" },
  { value: "notification", label: "Avisos" },
  { value: "sos", label: "SOS" },
  { value: "schedule", label: "Cuadrante" },
  { value: "calendar", label: "Calendario" },
  { value: "medication", label: "Medicación" },
  { value: "health", label: "Salud" },
  { value: "finance", label: "Finanzas" },
  { value: "inventory", label: "Inventario" },
  { value: "shopping", label: "Compra" },
  { value: "receipt", label: "Tickets" },
];

const domainIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  inventory: Package,
  shopping: ShoppingCart,
  receipt: ReceiptText,
  notification: Bell,
  sos: Siren,
  schedule: Clock,
  calendar: Calendar,
  medication: HeartPulse,
  health: Stethoscope,
  finance: Landmark,
};

const domainLabels: Record<string, string> = {
  inventory: "Inventario",
  shopping: "Compra",
  receipt: "Ticket",
  notification: "Aviso",
  sos: "SOS",
  schedule: "Cuadrante",
  calendar: "Calendario",
  medication: "Medicación",
  health: "Salud",
  finance: "Finanzas",
};

export const Route = createFileRoute("/_authenticated/settings/activity")({
  head: () => ({
    meta: [{ title: "Actividad y avisos - HomeSync" }],
  }),
  component: ActivityCenterPage,
});

function ActivityCenterPage() {
  const [domain, setDomain] = useState<DomainFilter>("all");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["activity-center", domain],
    queryFn: () => listActivityCenter({ data: { domain, limit: 80 } }),
  });

  const items = data?.items ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">Actividad y avisos</h2>
          </div>
          <p className="text-muted-foreground">
            Historial del hogar para revisar cambios, recordatorios, avisos y emergencias.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <Clock className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={Activity}
          label="Registros"
          value={summary?.total ?? 0}
          active={domain === "all"}
          onClick={() => setDomain("all")}
        />
        <SummaryCard
          icon={Bell}
          label="Avisos"
          value={summary?.notifications ?? 0}
          active={domain === "notification"}
          onClick={() => setDomain("notification")}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Pendiente/revisar"
          value={(summary?.pending ?? 0) + (summary?.warnings ?? 0)}
          active={domain === "needs_review"}
          onClick={() => setDomain("needs_review")}
        />
        <SummaryCard icon={CheckCircle2} label="Último" value={summary?.latestAt ? formatRelative(summary.latestAt) : "Sin datos"} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Filtro</p>
            <p className="text-xs text-muted-foreground">
              Usa este panel para comprobar si algo se registró o avisó sin entrar en cada sección.
            </p>
          </div>
          <Select value={domain} onValueChange={(value) => setDomain(value as DomainFilter)}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filters.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Línea de tiempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay registros para este filtro todavía.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item: any) => {
                const Icon = domainIcons[item.domain] ?? Activity;
                const content = (
                  <li className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        <Badge variant="outline">{domainLabels[item.domain] ?? item.domain}</Badge>
                        <StatusBadge status={item.status} />
                        {item.channel && <Badge variant="secondary">{item.channel}</Badge>}
                      </div>
                      {item.details && <p className="text-sm text-muted-foreground">{item.details}</p>}
                      <p className="text-xs text-muted-foreground">
                        {item.actor_name ?? "Sistema"} · {formatDate(item.created_at)}
                      </p>
                    </div>
                  </li>
                );

                return item.href ? (
                  <Link key={item.id} to={item.href as any} className="block">
                    {content}
                  </Link>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <Card className={cn(onClick && "transition-colors hover:bg-muted/40", active && "border-primary bg-primary/5")}>
      <CardContent className="flex items-center gap-3 p-4 text-left">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (!onClick) return content;

  return (
    <button type="button" className="block w-full text-left" onClick={onClick} aria-pressed={active}>
      {content}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") return <Badge className="bg-emerald-600 hover:bg-emerald-600">OK</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  if (status === "warning") return <Badge className="bg-amber-500 hover:bg-amber-500">Revisar</Badge>;
  if (status === "pending") return <Badge className="bg-sky-600 hover:bg-sky-600">Pendiente</Badge>;
  return <Badge variant="secondary">Info</Badge>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelative(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return "Sin datos";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
