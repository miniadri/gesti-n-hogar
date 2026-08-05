import { Clock, Package, ReceiptText, ShoppingCart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const domainIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  inventory: Package,
  shopping: ShoppingCart,
  receipt: ReceiptText,
};

const actionLabels: Record<string, string> = {
  created: "Añadido",
  updated: "Actualizado",
  deleted: "Eliminado",
  restored: "Restaurado",
  moved: "Movido",
  checked: "Comprado",
  unchecked: "Pendiente",
  imported: "Importado",
  scanned: "Escaneado",
  suggested_added: "Sugerido",
};

export function ActivityList({
  title = "Actividad reciente",
  items,
  empty = "Todavía no hay actividad registrada.",
}: {
  title?: string;
  items: any[];
  empty?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">{title}</h3>
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const Icon = domainIcons[item.domain] ?? Clock;
              return (
                <li key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {actionLabels[item.action] ?? item.action}
                      </span>
                    </div>
                    {item.details && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.details}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {item.actor_name ?? "Usuario"} · {formatActivityTime(item.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
