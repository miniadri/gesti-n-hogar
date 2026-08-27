import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Camera,
  Clock3,
  Maximize,
  Minimize,
  Package,
  Settings,
  Utensils,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SosAckBanner } from "@/components/SosAckBanner";
import { SosButton } from "@/components/SosButton";
import { KioskVoiceAssistant } from "@/components/KioskVoiceAssistant";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-version";
import { ensureKioskMember, getHousehold } from "@/lib/household.functions";
import {
  KIOSK_ACTIVE_KEY,
  KIOSK_MEMBER_NAME,
  KIOSK_MODULES,
  type KioskModule,
  type KioskModuleKey,
  kioskSearch,
  readKioskVisibleModules,
  writeKioskVisibleModules,
} from "@/lib/kiosk";

const householdQueryOptions = queryOptions({
  queryKey: ["household"],
  queryFn: () => getHousehold(),
});

export const Route = createFileRoute("/_authenticated/kiosk")({
  loader: ({ context }) => context.queryClient.ensureQueryData(householdQueryOptions),
  head: () => ({
    meta: [{ title: "Modo kiosko - HomeSync" }],
  }),
  component: KioskPage,
});

function KioskPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: household } = useSuspenseQuery(householdQueryOptions);
  const doEnsureKioskMember = useServerFn(ensureKioskMember);
  const [fullscreen, setFullscreen] = useState(false);
  const [wakeLockStatus, setWakeLockStatus] = useState<"idle" | "active" | "unsupported" | "error">("idle");
  const [visibleKeys, setVisibleKeys] = useState<KioskModuleKey[]>(() => readKioskVisibleModules());
  const [kioskMember, setKioskMember] = useState<any>(() =>
    (household?.household_members ?? []).find((member: any) => member.display_name === KIOSK_MEMBER_NAME) ?? null,
  );
  const wakeLockRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(KIOSK_ACTIVE_KEY, "true");
  }, []);

  useEffect(() => {
    if (kioskMember) return;
    doEnsureKioskMember()
      .then((member: any) => {
        setKioskMember(member);
        queryClient.invalidateQueries({ queryKey: ["household"] });
      })
      .catch(() => {
        // Kiosko sigue siendo usable aunque no se pueda crear el miembro virtual.
      });
  }, [doEnsureKioskMember, kioskMember, queryClient]);

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
    window.localStorage.removeItem(KIOSK_ACTIVE_KEY);
    navigate({ to: "/dashboard" as any });
  };

  const toggleModule = (key: KioskModuleKey) => {
    setVisibleKeys((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      const safeNext: KioskModuleKey[] = next.length ? next : ["shopping"];
      writeKioskVisibleModules(safeNext);
      return safeNext;
    });
  };

  const visibleModules = KIOSK_MODULES.filter((module) => visibleKeys.includes(module.key));

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
            <KioskModuleSettings visibleKeys={visibleKeys} onToggle={toggleModule} />
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
              <StatusPill icon={Settings} label="Usuario" value={kioskMember?.display_name ?? "Preparando Kiosko"} />
              <StatusPill icon={Camera} label="Cámara" value="Según permisos" />
              <StatusPill icon={Clock3} label="Pantalla" value={wakeLockLabel(wakeLockStatus)} />
              <StatusPill icon={Bell} label="Avisos" value="Push/Telegram" />
            </CardContent>
          </Card>
        </section>

        <KioskVoiceAssistant kioskMemberId={kioskMember?.id} />

        <main className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleModules.map((action) => (
            <KioskActionCard key={action.key} action={action} />
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
                Las secciones se abren con navegación reducida y botones grandes. Pulsa Salir del kiosko para volver al modo completo.
              </p>
            </div>
          </AlertDescription>
        </Alert>

        <footer className="flex justify-end text-xs text-muted-foreground">{APP_VERSION}</footer>
      </div>
    </div>
  );
}

function KioskActionCard({ action }: { action: KioskModule }) {
  const Icon = action.icon;
  return (
    <Link
      to={action.to as any}
      search={kioskSearch()}
      className="group block min-h-[172px] rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[196px]"
    >
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("grid h-16 w-16 place-items-center rounded-xl", toneClass(action.tone))}>
            <Icon className="h-8 w-8" />
          </div>
        </div>
        <div>
          <p className="text-2xl font-bold leading-tight sm:text-3xl">{action.title}</p>
          <p className="mt-1 text-base text-muted-foreground">{action.description}</p>
        </div>
      </div>
    </Link>
  );
}

function KioskModuleSettings({
  visibleKeys,
  onToggle,
}: {
  visibleKeys: KioskModuleKey[];
  onToggle: (key: KioskModuleKey) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Configurar Kiosko">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Configurar Kiosko</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Módulos del Kiosko</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Esta configuración se guarda solo en este dispositivo.
          </p>
          {KIOSK_MODULES.map((module) => {
            const Icon = module.icon;
            const checked = visibleKeys.includes(module.key);
            return (
              <div key={module.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", toneClass(module.tone))}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{module.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{module.description}</p>
                  </div>
                </div>
                <Switch checked={checked} onCheckedChange={() => onToggle(module.key)} />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
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

function toneClass(tone: KioskModule["tone"]) {
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
    case "red":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  }
}

function wakeLockLabel(status: "idle" | "active" | "unsupported" | "error") {
  if (status === "active") return "Activa";
  if (status === "unsupported") return "No soportado";
  if (status === "error") return "Revisar";
  return "Normal";
}
