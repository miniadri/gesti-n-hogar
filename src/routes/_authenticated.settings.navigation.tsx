import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_NAV_ORDER,
  useNavPreferences,
  type NavKey,
} from "@/lib/nav-preferences";

export const Route = createFileRoute("/_authenticated/settings/navigation")({
  head: () => ({
    meta: [{ title: "Navegación — HomeSync" }],
  }),
  component: NavigationSettingsPage,
});

function NavigationSettingsPage() {
  const { t } = useTranslation();
  const { prefs, toggleHidden, move, reset } = useNavPreferences();

  const labelFor = (key: NavKey): string => {
    const map: Record<NavKey, string> = {
      dashboard: t("nav.dashboard"),
      tasks: t("nav.tasks"),
      calendar: t("nav.calendar"),
      shopping: t("nav.shoppingList"),
      inventory: t("nav.inventory"),
      recipes: t("nav.recipes"),
      finances: t("nav.finances"),
      devices: t("nav.devices"),
      medications: t("nav.medications"),
    };
    return map[key];
  };

  const hidden = new Set(prefs.hidden);
  const order = prefs.order.length ? prefs.order : DEFAULT_NAV_ORDER;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Navegación lateral</h2>
          <p className="text-muted-foreground">
            Reordena las secciones o ocúltalas si no las usas. Los cambios se guardan en este dispositivo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Restaurar por defecto
        </Button>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <ul className="divide-y">
            {order.map((key, idx) => {
              const isHidden = hidden.has(key);
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex flex-col">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={idx === 0}
                        onClick={() => move(key, -1)}
                        aria-label="Subir"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={idx === order.length - 1}
                        onClick={() => move(key, 1)}
                        aria-label="Bajar"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="min-w-0">
                      <p className={isHidden ? "font-medium text-muted-foreground line-through" : "font-medium"}>
                        {labelFor(key)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isHidden ? "Oculta" : `Posición ${idx + 1}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isHidden ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Switch
                      checked={!isHidden}
                      onCheckedChange={() => toggleHidden(key)}
                      aria-label={`Mostrar ${labelFor(key)}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        En móvil, la barra inferior muestra las primeras 5 secciones visibles.
      </p>
    </div>
  );
}
