import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle2,
  Gauge,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Smartphone,
  Wifi,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { triggerSos } from "@/lib/sos.functions";

const LAST_LOCATION_KEY = "homesync:last-sos-location";
const SETTINGS_KEY = "homesync:fall-detection-settings";
const COUNTDOWN_SECONDS = 30;
const STILLNESS_MS = 4500;
const COOLDOWN_MS = 12000;

type DetectorStatus = "idle" | "listening" | "possible_fall" | "countdown" | "sending" | "sent";
type SosLocation =
  | { lat: number; lng: number; accuracy: number; source: "precise" | "fallback" }
  | { lat: number; lng: number; accuracy: number | null; source: "last_known"; error: string }
  | { lat: null; lng: null; accuracy: null; source: "none"; error: string };

type Settings = {
  impactThresholdG: number;
  stillnessThresholdG: number;
  testMode: boolean;
};

type MotionSample = {
  magnitudeG: number | null;
  linearG: number | null;
  tiltDeg: number | null;
  peakG: number;
  samples: number;
  lastImpactAt: number | null;
};

const DEFAULT_SETTINGS: Settings = {
  impactThresholdG: 2.7,
  stillnessThresholdG: 0.18,
  testMode: true,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "");
    return {
      impactThresholdG:
        typeof parsed?.impactThresholdG === "number" ? parsed.impactThresholdG : DEFAULT_SETTINGS.impactThresholdG,
      stillnessThresholdG:
        typeof parsed?.stillnessThresholdG === "number" ? parsed.stillnessThresholdG : DEFAULT_SETTINGS.stillnessThresholdG,
      testMode: typeof parsed?.testMode === "boolean" ? parsed.testMode : DEFAULT_SETTINGS.testMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Local settings only; ignore storage failures.
  }
}

function getMagnitudeG(values: DeviceMotionEventAcceleration | null): number | null {
  const x = values?.x;
  const y = values?.y;
  const z = values?.z;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  return Math.sqrt(x * x + y * y + z * z) / 9.80665;
}

function requestPosition(options: PositionOptions): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      options,
    );
  });
}

async function getLocation(): Promise<SosLocation> {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: null, lng: null, accuracy: null, source: "none", error: "geolocation_unavailable" };
  }

  const precise = await requestPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  if (precise) {
    rememberLocation(precise);
    return {
      lat: precise.coords.latitude,
      lng: precise.coords.longitude,
      accuracy: precise.coords.accuracy,
      source: "precise",
    };
  }

  const fallback = await requestPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 });
  if (fallback) {
    rememberLocation(fallback);
    return {
      lat: fallback.coords.latitude,
      lng: fallback.coords.longitude,
      accuracy: fallback.coords.accuracy,
      source: "fallback",
    };
  }

  const remembered = readLastKnownLocation();
  if (remembered) return remembered;

  return { lat: null, lng: null, accuracy: null, source: "none", error: "location_timeout_or_denied" };
}

function rememberLocation(pos: GeolocationPosition) {
  try {
    window.localStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Best-effort cache only.
  }
}

function readLastKnownLocation(): SosLocation | null {
  try {
    const raw = window.localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat !== "number" || typeof parsed?.lng !== "number") return null;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) return null;
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      accuracy: typeof parsed.accuracy === "number" ? parsed.accuracy : null,
      source: "last_known",
      error: "using_last_known_location",
    };
  } catch {
    return null;
  }
}

async function getBatteryInfo(): Promise<{ battery_level: number | null; battery_charging: boolean | null }> {
  try {
    const getBattery = (navigator as any).getBattery;
    if (typeof getBattery !== "function") return { battery_level: null, battery_charging: null };
    const battery = await getBattery.call(navigator);
    return {
      battery_level: typeof battery?.level === "number" ? Math.round(battery.level * 100) : null,
      battery_charging: typeof battery?.charging === "boolean" ? battery.charging : null,
    };
  } catch {
    return { battery_level: null, battery_charging: null };
  }
}

function getConnectionType(): string | null {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  return connection?.effectiveType || connection?.type || null;
}

function formatG(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} g` : "-";
}

function formatTilt(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°` : "-";
}

export function FallDetectionExperiment() {
  const doTrigger = useServerFn(triggerSos);
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [status, setStatus] = useState<DetectorStatus>("idle");
  const [sensorSupported, setSensorSupported] = useState<boolean | null>(null);
  const [permissionState, setPermissionState] = useState("Sin solicitar");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [lastSendStatus, setLastSendStatus] = useState<string | null>(null);
  const [sample, setSample] = useState<MotionSample>({
    magnitudeG: null,
    linearG: null,
    tiltDeg: null,
    peakG: 0,
    samples: 0,
    lastImpactAt: null,
  });
  const settingsRef = useRef(settings);
  const statusRef = useRef<DetectorStatus>("idle");
  const recentG = useRef<Array<{ t: number; g: number }>>([]);
  const possibleFallAt = useRef<number | null>(null);
  const cooldownUntil = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    setSensorSupported(typeof window !== "undefined" && "DeviceMotionEvent" in window);
  }, []);

  useEffect(() => {
    if (!dialogOpen || status !== "countdown") return;
    if (countdown <= 0) {
      void sendAutomaticSos();
      return;
    }
    const id = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [dialogOpen, status, countdown]);

  const statusLabel = useMemo(() => {
    if (status === "listening") return "Escuchando sensores";
    if (status === "possible_fall") return "Impacto detectado; comprobando inmovilidad";
    if (status === "countdown") return "Cuenta atrás activa";
    if (status === "sending") return "Enviando SOS";
    if (status === "sent") return "SOS enviado";
    return "Detenido";
  }, [status]);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const requestMotionPermission = async () => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setPermissionState("Sensores no disponibles");
      return false;
    }
    const requestPermission = (window.DeviceMotionEvent as any).requestPermission;
    if (typeof requestPermission === "function") {
      try {
        const result = await requestPermission();
        setPermissionState(result === "granted" ? "Concedido" : "Denegado");
        return result === "granted";
      } catch {
        setPermissionState("Error al solicitar");
        return false;
      }
    }
    setPermissionState("No requiere permiso explícito");
    return true;
  };

  const start = async () => {
    const allowed = await requestMotionPermission();
    if (!allowed) return;
    resetRuntime();
    setStatus("listening");
    window.addEventListener("devicemotion", handleMotion);
    window.addEventListener("deviceorientation", handleOrientation);
    setLastEvent("Detector activado");
  };

  const stop = () => {
    window.removeEventListener("devicemotion", handleMotion);
    window.removeEventListener("deviceorientation", handleOrientation);
    setStatus("idle");
    possibleFallAt.current = null;
    setDialogOpen(false);
    setLastEvent("Detector detenido");
  };

  const resetRuntime = () => {
    recentG.current = [];
    possibleFallAt.current = null;
    cooldownUntil.current = 0;
    setCountdown(COUNTDOWN_SECONDS);
    setLastSendStatus(null);
    setSample({
      magnitudeG: null,
      linearG: null,
      tiltDeg: null,
      peakG: 0,
      samples: 0,
      lastImpactAt: null,
    });
  };

  const handleMotion = (event: DeviceMotionEvent) => {
    const now = Date.now();
    const magnitudeG = getMagnitudeG(event.accelerationIncludingGravity);
    const linearG = getMagnitudeG(event.acceleration);
    if (magnitudeG == null && linearG == null) return;

    const observedG = Math.max(magnitudeG ?? 0, linearG ?? 0);
    recentG.current = [...recentG.current, { t: now, g: observedG }].filter((item) => now - item.t <= STILLNESS_MS);

    setSample((prev) => ({
      ...prev,
      magnitudeG,
      linearG,
      peakG: Math.max(prev.peakG, observedG),
      samples: prev.samples + 1,
    }));

    if (statusRef.current !== "listening" && statusRef.current !== "possible_fall") return;
    if (now < cooldownUntil.current) return;

    if (observedG >= settingsRef.current.impactThresholdG) {
      possibleFallAt.current = now;
      setStatus("possible_fall");
      setLastEvent(`Impacto ${observedG.toFixed(2)} g`);
      return;
    }

    if (possibleFallAt.current && now - possibleFallAt.current >= 1800) {
      const values = recentG.current.map((item) => item.g);
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (values.length >= 8 && max - min <= settingsRef.current.stillnessThresholdG) {
        openFallDialog("impacto seguido de inmovilidad");
      } else if (now - possibleFallAt.current > STILLNESS_MS) {
        possibleFallAt.current = null;
        setStatus("listening");
      }
    }
  };

  const handleOrientation = (event: DeviceOrientationEvent) => {
    const beta = typeof event.beta === "number" ? Math.abs(event.beta) : 0;
    const gamma = typeof event.gamma === "number" ? Math.abs(event.gamma) : 0;
    const tiltDeg = Math.max(beta, gamma);
    setSample((prev) => ({ ...prev, tiltDeg }));
  };

  const openFallDialog = (reason: string) => {
    if (statusRef.current === "countdown" || statusRef.current === "sending") return;
    cooldownUntil.current = Date.now() + COOLDOWN_MS;
    possibleFallAt.current = null;
    setCountdown(COUNTDOWN_SECONDS);
    setDialogOpen(true);
    setStatus("countdown");
    setLastEvent(`Posible caída: ${reason}`);
  };

  const simulateFall = () => {
    setSample((prev) => ({ ...prev, peakG: Math.max(prev.peakG, settings.impactThresholdG + 0.4), lastImpactAt: Date.now() }));
    openFallDialog("simulación manual");
  };

  const confirmOk = () => {
    setDialogOpen(false);
    setStatus(statusRef.current === "idle" ? "idle" : "listening");
    setCountdown(COUNTDOWN_SECONDS);
    setLastEvent("Caída descartada por el usuario");
    toast.success("Caída descartada");
  };

  const sendAutomaticSos = async () => {
    if (statusRef.current === "sending") return;
    setStatus("sending");
    setLastSendStatus(null);
    try {
      const [loc, battery] = await Promise.all([getLocation(), getBatteryInfo()]);
      const result: any = await doTrigger({
        data: {
          latitude: loc.lat,
          longitude: loc.lng,
          location_accuracy: loc.accuracy,
          note: settingsRef.current.testMode
            ? "Simulacro automático por detección experimental de caída"
            : "SOS automático por posible caída detectada",
          sos_type: "fall",
          battery_level: battery.battery_level,
          battery_charging: battery.battery_charging,
          connection_type: getConnectionType(),
          location_source: loc.source,
          last_known_location_used: loc.source === "last_known",
          is_test: settingsRef.current.testMode,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["sos-events"] });
      const statusText = result?.notification_status?.ok
        ? "SOS enviado y notificaciones confirmadas"
        : "SOS registrado, pero no se pudo confirmar el envío";
      setLastSendStatus(statusText);
      setLastEvent(statusText);
      setStatus("sent");
      setDialogOpen(false);
      toast[settingsRef.current.testMode ? "success" : "warning"](
        settingsRef.current.testMode ? "Simulacro de caída enviado" : "SOS automático por caída enviado",
      );
    } catch (err: any) {
      setStatus("listening");
      setLastSendStatus(err?.message || "No se pudo enviar el SOS automático");
      toast.error(err?.message || "No se pudo enviar el SOS automático");
    }
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Detección experimental de caída
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{statusLabel}</p>
              <p className="text-sm text-muted-foreground">
                Funciona solo mientras esta pantalla está abierta y el navegador permite sensores de movimiento.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {status === "idle" || status === "sent" ? (
                <Button onClick={() => void start()}>
                  <Play className="mr-2 h-4 w-4" />
                  Activar prueba
                </Button>
              ) : (
                <Button variant="outline" onClick={stop}>
                  Detener
                </Button>
              )}
              <Button variant="secondary" onClick={simulateFall} disabled={status === "sending"}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Simular caída
              </Button>
              <Button variant="ghost" onClick={resetRuntime}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reiniciar lecturas
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Metric icon={Gauge} label="Aceleración" value={formatG(sample.magnitudeG)} />
            <Metric icon={Activity} label="Movimiento" value={formatG(sample.linearG)} />
            <Metric icon={Smartphone} label="Inclinación" value={formatTilt(sample.tiltDeg)} />
            <Metric icon={AlertTriangle} label="Pico detectado" value={formatG(sample.peakG)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Umbral de impacto</p>
                  <p className="text-xs text-muted-foreground">Más bajo detecta antes, pero aumenta falsos positivos.</p>
                </div>
                <Badge variant="outline">{settings.impactThresholdG.toFixed(1)} g</Badge>
              </div>
              <Slider
                className="mt-4"
                min={1.8}
                max={4.2}
                step={0.1}
                value={[settings.impactThresholdG]}
                onValueChange={([value]) => updateSettings({ impactThresholdG: value })}
              />
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Inmovilidad posterior</p>
                  <p className="text-xs text-muted-foreground">Más bajo exige que el teléfono quede más quieto.</p>
                </div>
                <Badge variant="outline">{settings.stillnessThresholdG.toFixed(2)} g</Badge>
              </div>
              <Slider
                className="mt-4"
                min={0.08}
                max={0.45}
                step={0.01}
                value={[settings.stillnessThresholdG]}
                onValueChange={([value]) => updateSettings({ stillnessThresholdG: value })}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StatusTile label="Sensores" value={sensorSupported ? "Disponibles" : sensorSupported === false ? "No disponibles" : "Comprobando"} />
            <StatusTile label="Permiso" value={permissionState} />
            <StatusTile label="Muestras" value={String(sample.samples)} />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="font-medium">SOS prueba caída</p>
              <p className="text-sm text-muted-foreground">
                Si está activo, el SOS automático se marca como simulacro y no genera recordatorios reales.
              </p>
            </div>
            <Switch checked={settings.testMode} onCheckedChange={(checked) => updateSettings({ testMode: checked })} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Info icon={MapPin} label="Ubicación" value="Se pide al enviar SOS" />
            <Info icon={Battery} label="Batería" value="Chrome Android puede exponerla" />
            <Info icon={Wifi} label="Conexión" value="Se adjunta si el navegador la informa" />
          </div>

          {lastEvent && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Último evento</p>
              <p className="text-muted-foreground">{lastEvent}</p>
              {lastSendStatus && <p className="mt-1 text-muted-foreground">{lastSendStatus}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && confirmOk()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Caída detectada
            </DialogTitle>
            <DialogDescription>
              Confirma que estás bien. Si no respondes, se enviará un SOS automático por posible caída.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-4xl font-bold tabular-nums">{countdown}s</p>
              <p className="text-sm text-muted-foreground">
                {settings.testMode ? "Modo simulacro activo" : "Modo real activo"}
              </p>
            </div>
            <Progress value={((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100} />
          </div>
          <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={confirmOk}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Estoy bien
            </Button>
            <Button type="button" variant="destructive" onClick={() => void sendAutomaticSos()} disabled={status === "sending"}>
              {status === "sending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
              Enviar SOS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {label}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{value}</p>
    </div>
  );
}
