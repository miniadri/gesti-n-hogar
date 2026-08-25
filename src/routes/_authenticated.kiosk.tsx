import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Camera,
  ChefHat,
  Clock3,
  Keyboard,
  ListTodo,
  Maximize,
  Minimize,
  Package,
  Pill,
  Refrigerator,
  Settings,
  ShoppingCart,
  Utensils,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SosAckBanner } from "@/components/SosAckBanner";
import { SosButton } from "@/components/SosButton";
import { KioskVoiceAssistant } from "@/components/KioskVoiceAssistant";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-version";

export const Route = createFileRoute("/_authenticated/kiosk")({
  head: () => ({
    meta: [{ title: "Modo kiosko - HomeSync" }],
  }),
  component: KioskPage,
});

type KioskAction = {
  title: string;
  description: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  tone: "primary" | "green" | "blue" | "amber" | "rose" | "slate";
};

const actions: KioskAction[] = [
  {
    title: "Escanear y descontar",
    description: "Cámara o lector USB para consumir inventario",
    to: "/inventory/kitchen",
    icon: Camera,
    tone: "primary",
  },
  {
    title: "Lista de la compra",
    description: "Añadir, quitar y marcar productos",
    to: "/shopping",
    icon: ShoppingCart,
    tone: "green",
  },
  {
    title: "Tareas",
    description: "Lavadora, limpieza y encargos del hogar",
    to: "/tasks",
    icon: ListTodo,
    tone: "slate",
  },
  {
    title: "Inventario",
    description: "Mover productos y revisar stock",
    to: "/inventory",
    icon: Refrigerator,
    tone: "blue",
  },
  {
    title: "Recetas",
    description: "Modo cocina y recetas guardadas",
    to: "/recipes",
    icon: ChefHat,
    tone: "amber",
  },
  {
    title: "Salud",
    description: "Medicación, tomas y registro médico",
    to: "/medications",
    icon: Pill,
    tone: "rose",
  },
  {
    title: "Calendario",
    description: "Eventos y cuadrante del hogar",
    to: "/calendar",
    icon: CalendarDays,
    tone: "slate",
  },
];

function KioskPage() {
  const navigate = useNavigate();
  const [fullscreen, setFullscreen] = useState(false);
  const [wakeLockStatus, setWakeLockStatus] = useState<"idle" | "active" | "unsupported" | "error">("idle");
  const wakeLockRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem("homesync:kiosk-active", "true");
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      try {
        wakeLockRef.current?.release?.();
      } catch {}
    };
  }, []);

  const deviceHints = useMemo(() => {
    if (typeof navigator === "undefined") return [];
    const ua = navigator.userAgent.toLowerCase();
    const hints = [];
    if (/android/.test(ua)) hints.push("Android: cámara disponible si el navegador concede permiso.");
    if (/linux|x11|raspbian/.test(ua)) hints.push("Raspberry: recomendado lector USB; funciona como teclado y termina con Enter.");
    if (!hints.length) hints.push("Compatible con navegador moderno, cámara o lector USB tipo teclado.");
    return hints;
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        await requestWakeLock();
      } else {
        await document.exitFullscreen();
        await releaseWakeLock();
      }
    } catch {
      setWakeLockStatus("error");
    }
  };

  const requestWakeLock = async () => {
    try {
      if (!("wakeLock" in navigator)) {
        setWakeLockStatus("unsupported");
        return;
      }
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      setWakeLockStatus("active");
      wakeLockRef.current.addEventListener?.("release", () => setWakeLockStatus("idle"));
    } catch {
      setWakeLockStatus("error");
    }
  };

  const releaseWakeLock = async () => {
    try {
      await wakeLockRef.current?.release?.();
      wakeLockRef.current = null;
      setWakeLockStatus("idle");
    } catch {
      setWakeLockStatus("error");
    }
  };

  const exitKiosk = () => {
    window.localStorage.removeItem("homesync:kiosk-active");
    navigate({ to: "/dashboard" as any });
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background text-foreground"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-5 sm:py-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={exitKiosk} title="Salir del modo kiosko">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Salir del modo kiosko</span>
            </Button>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Utensils className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">Modo kiosko</h1>
              <p className="truncate text-sm text-muted-foreground">
                Cocina, compra, inventario, salud y avisos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" asChild title="Ajustes">
              <Link to="/settings">
                <Settings className="h-5 w-5" />
                <span className="sr-only">Ajustes</span>
              </Link>
            </Button>
            <Button variant="outline" size="icon" onClick={toggleFullscreen} title="Pantalla completa">
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              <span className="sr-only">Pantalla completa</span>
            </Button>
          </div>
        </header>

        <SosAckBanner />

        <section className="grid gap-3 lg:grid-cols-[1fr_260px]">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Emergencia
                </p>
                <p className="text-sm text-muted-foreground">
                  Mantener pulsado para enviar SOS con ubicación y resumen médico crítico.
                </p>
              </div>
              <div className="shrink-0">
                <SosButton />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid h-full grid-cols-2 gap-2 p-3 text-sm">
              <StatusPill icon={Keyboard} label="USB" value="Activo en modo cocina" />
              <StatusPill icon={Camera} label="Cámara" value="Según permisos" />
              <StatusPill icon={Clock3} label="Pantalla" value={wakeLockLabel(wakeLockStatus)} />
              <StatusPill icon={Bell} label="Avisos" value="Push/Telegram" />
            </CardContent>
          </Card>
        </section>

        <KioskVoiceAssistant />

        <main className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => (
            <KioskActionCard key={action.to} action={action} />
          ))}
        </main>

        <Alert>
          <Package className="h-4 w-4" />
          <AlertTitle>Terminal doméstico</AlertTitle>
          <AlertDescription>
            <div className="space-y-1">
              {deviceHints.map((hint) => (
                <p key={hint}>{hint}</p>
              ))}
              <p>
                Si falta alguna función concreta, abre la sección normal desde estos accesos y mantenemos este modo como capa simple.
              </p>
            </div>
          </AlertDescription>
        </Alert>

        <footer className="flex justify-end text-xs text-muted-foreground">{APP_VERSION}</footer>
      </div>
    </div>
  );
}

function KioskActionCard({ action }: { action: KioskAction }) {
  const Icon = action.icon;
  return (
    <Link
      to={action.to as any}
      search={{ kiosk: "1" } as any}
      className="group block min-h-[170px] rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[190px]"
    >
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("grid h-16 w-16 place-items-center rounded-xl", toneClass(action.tone))}>
            <Icon className="h-8 w-8" />
          </div>
        </div>
        <div>
          <p className="text-2xl font-bold leading-tight">{action.title}</p>
          <p className="mt-1 text-base text-muted-foreground">{action.description}</p>
        </div>
      </div>
    </Link>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{value}</p>
    </div>
  );
}

function toneClass(tone: KioskAction["tone"]) {
  switch (tone) {
    case "primary":
      return "bg-primary text-primary-foreground";
    case "green":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "blue":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "amber":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "rose":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200";
    case "slate":
      return "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200";
  }
}

function wakeLockLabel(status: "idle" | "active" | "unsupported" | "error") {
  if (status === "active") return "Activa";
  if (status === "unsupported") return "No soportado";
  if (status === "error") return "Revisar";
  return "Normal";
}
