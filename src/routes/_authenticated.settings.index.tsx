import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, ChefHat, Home, Globe, Bell, ChevronRight, LayoutList, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [{ title: "Ajustes — HomeSync" }],
  }),
  component: SettingsHubPage,
});

function SettingsHubPage() {
  const { t } = useTranslation();

  const items = [
    {
      to: "/settings/family",
      label: t("nav.family"),
      description: "Gestiona los miembros del hogar y las invitaciones",
      icon: Users,
    },
    {
      to: "/settings/appliances",
      label: t("nav.appliances"),
      description: "Electrodomésticos disponibles para las recetas",
      icon: ChefHat,
    },
    {
      to: "/settings/home-assistant",
      label: "Home Assistant",
      description: "Conexión con tu servidor y sincronización de dispositivos",
      icon: Home,
    },
    {
      to: "/settings/localization",
      label: "Idioma y moneda",
      description: "Preferencias de idioma, tema y moneda",
      icon: Globe,
    },
    {
      to: "/settings/notifications",
      label: t("common.notifications"),
      description: "Notificaciones push y alertas del hogar",
      icon: Bell,
    },
    {
      to: "/settings/google-calendar",
      label: "Google Calendar",
      description: "Sincroniza tus eventos con Google Calendar",
      icon: Calendar,
    },
    {
      to: "/settings/navigation",
      label: "Navegación lateral",
      description: "Reordena u oculta las secciones del menú",
      icon: LayoutList,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("nav.settings")}</h2>
        <p className="text-muted-foreground">Configuración del hogar y de la cuenta</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
