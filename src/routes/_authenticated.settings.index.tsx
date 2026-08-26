import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Users, ChefHat, Home, Globe, Bell, ChevronRight, LayoutList, Calendar, ShieldAlert, ShieldCheck, FlaskConical, Activity, MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client-app";
import { APP_VERSION } from "@/lib/app-version";

const PRIVATE_ADMIN_EMAILS = new Set([
  "adri.miniadri@gmail.com",
  "adriturcafamiliar@gmail.com",
  "adrian.moya.manteca@gmail.com",
]);

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [{ title: "Ajustes — HomeSync" }],
  }),
  component: SettingsHubPage,
});

function SettingsHubPage() {
  const { t } = useTranslation();
  const [canSeePrivateTools, setCanSeePrivateTools] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email?.toLowerCase();
      setCanSeePrivateTools(Boolean(email && PRIVATE_ADMIN_EMAILS.has(email)));
    });
  }, []);

  const items = useMemo(() => [
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
      to: "/settings/activity",
      label: "Actividad y avisos",
      description: "Historial común de cambios, recordatorios y emergencias",
      icon: Activity,
    },
    {
      to: "/settings/emergency",
      label: "Emergencia",
      description: "Contactos SOS, miembros avisados e historial",
      icon: ShieldAlert,
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
    {
      to: "/kiosk",
      label: "Modo kiosko",
      description: "Pantalla simplificada para cocina, tareas, compra y salud",
      icon: MonitorSmartphone,
    },
    ...(canSeePrivateTools
      ? [
          {
            to: "/settings/diagnostics",
            label: "Diagnóstico",
            description: "Estado técnico privado de integraciones y avisos",
            icon: ShieldCheck,
          },
          {
            to: "/settings/experimental",
            label: "Experimental",
            description: "Pruebas privadas de sensores y funciones sensibles",
            icon: FlaskConical,
          },
        ]
      : []),
  ], [canSeePrivateTools, t]);

  return (
    <div className="relative space-y-6 pb-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("nav.settings")}</h2>
        <p className="text-muted-foreground">Configuración del hogar y de la cuenta</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="block min-w-0">
              <Card className="h-full transition-colors hover:bg-accent">
                <CardContent className="flex min-w-0 items-center gap-3 p-4 sm:gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{item.label}</p>
                    <p className="break-words text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 text-xs text-muted-foreground">
        {APP_VERSION}
      </div>
    </div>
  );
}
