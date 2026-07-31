import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { triggerSos } from "@/lib/sos.functions";

const HOLD_MS = 2000;
const AUTO_SEND_SECONDS = 6;
const LAST_LOCATION_KEY = "homesync:last-sos-location";

type SosType = "urgency" | "medical" | "fall" | "unsafe" | "other";

const SOS_TYPES: Array<{ value: SosType; label: string }> = [
  { value: "urgency", label: "Urgencia" },
  { value: "medical", label: "Médico" },
  { value: "fall", label: "Caída" },
  { value: "unsafe", label: "Inseguridad" },
  { value: "other", label: "Otro" },
];

const QUICK_NOTES = ["Me encuentro mal", "Me he caído", "Necesito ayuda", "Voy solo/a"];

type SosLocation =
  | { lat: number; lng: number; accuracy: number; source: "precise" | "fallback" }
  | { lat: number; lng: number; accuracy: number | null; source: "last_known"; error: string }
  | { lat: null; lng: null; accuracy: null; source: "none"; error: string };

type PendingSosPayload = {
  location: SosLocation;
  battery_level: number | null;
  battery_charging: boolean | null;
  connection_type: string | null;
};

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

  const precise = await requestPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 30000,
  });
  if (precise) {
    rememberLocation(precise);
    return {
      lat: precise.coords.latitude,
      lng: precise.coords.longitude,
      accuracy: precise.coords.accuracy,
      source: "precise",
    };
  }

  const fallback = await requestPosition({
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 5 * 60 * 1000,
  });
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
    const maxAgeMs = 24 * 60 * 60 * 1000;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > maxAgeMs) return null;
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
    if (typeof getBattery !== "function") {
      return { battery_level: null, battery_charging: null };
    }
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

export function SosButton({
  className,
  variant = "solid",
  label = "SOS",
}: {
  className?: string;
  variant?: "solid" | "compact";
  label?: string;
}) {
  const doTrigger = useServerFn(triggerSos);
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_SEND_SECONDS);
  const [sosType, setSosType] = useState<SosType>("urgency");
  const [note, setNote] = useState("");
  const [pendingPayload, setPendingPayload] = useState<PendingSosPayload | null>(null);
  const holdStart = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const pointerId = useRef<number | null>(null);
  const sentRef = useRef(false);

  const stopHold = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    raf.current = null;
    holdTimer.current = null;
    holdStart.current = null;
    pointerId.current = null;
    setProgress(0);
  };

  const beginSos = async () => {
    if (fired.current || sending) return;
    fired.current = true;
    setSending(true);
    const [loc, battery] = await Promise.all([getLocation(), getBatteryInfo()]);
    setPendingPayload({
      location: loc,
      battery_level: battery.battery_level,
      battery_charging: battery.battery_charging,
      connection_type: getConnectionType(),
    });
    setSosType("urgency");
    setNote("");
    setCountdown(AUTO_SEND_SECONDS);
    sentRef.current = false;
    setConfirmOpen(true);
  };

  const resetAfterSos = () => {
    setSending(false);
    setConfirmOpen(false);
    setPendingPayload(null);
    setTimeout(() => (fired.current = false), 1500);
  };

  const sendSos = async () => {
    if (!pendingPayload || sentRef.current) return;
    sentRef.current = true;
    const loc = pendingPayload.location;
    try {
      const result: any = await doTrigger({
        data: {
          latitude: loc.lat,
          longitude: loc.lng,
          location_accuracy: loc.accuracy,
          note: note.trim() || null,
          sos_type: sosType,
          battery_level: pendingPayload.battery_level,
          battery_charging: pendingPayload.battery_charging,
          connection_type: pendingPayload.connection_type,
          location_source: loc.source,
          last_known_location_used: loc.source === "last_known",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["sos-events"] });

      const status = result?.notification_status;
      const hasLocation = loc.lat != null && loc.lng != null;
      if (status?.ok) {
        const channels = [
          status.telegramSent ? `${status.telegramSent} Telegram` : null,
          status.pushSent ? "push" : null,
        ].filter(Boolean).join(" + ");
        toast.success(
          `🚨 SOS enviado${channels ? ` por ${channels}` : ""}${hasLocation ? " con ubicación" : " sin ubicación"}`,
        );
      } else {
        toast.warning(
          `SOS registrado${hasLocation ? " con ubicación" : " sin ubicación"}, pero no se pudo confirmar el envío de notificaciones.`,
        );
      }

      if (loc.source === "last_known") {
        toast.warning("No se obtuvo ubicación nueva; se ha enviado la última ubicación conocida.");
      } else if (!hasLocation) {
        toast.warning("El navegador no entregó ubicación. Revisa permisos de ubicación y que la web esté en HTTPS.");
      }
    } catch (err: any) {
      toast.error(err?.message || "No se pudo enviar el SOS");
    } finally {
      resetAfterSos();
    }
  };

  const tick = () => {
    if (holdStart.current == null) return;
    const elapsed = performance.now() - holdStart.current;
    const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
    setProgress(pct);
    if (elapsed >= HOLD_MS) {
      stopHold();
      void beginSos();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const startHold = (e: React.PointerEvent) => {
    e.preventDefault();
    if (sending) return;
    if (holdStart.current != null) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointerId.current = e.pointerId;
    fired.current = false;
    holdStart.current = performance.now();
    raf.current = requestAnimationFrame(tick);
    holdTimer.current = setTimeout(() => {
      stopHold();
      void beginSos();
    }, HOLD_MS);
  };

  const endHold = (e: React.PointerEvent) => {
    if (pointerId.current === e.pointerId) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    stopHold();
  };

  const handleClick = () => {
    if (!sending && progress === 0) {
      toast.info("Mantén pulsado el botón SOS durante 2 segundos para enviarlo.");
    }
  };

  useEffect(() => {
    const cancel = () => stopHold();
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
      stopHold();
    };
  }, []);

  useEffect(() => {
    if (!confirmOpen || sentRef.current) return;
    if (countdown <= 0) {
      void sendSos();
      return;
    }
    const id = window.setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => window.clearTimeout(id);
  }, [confirmOpen, countdown, pendingPayload, sosType, note]);

  const dialog = (
    <Dialog
      open={confirmOpen}
      onOpenChange={(open) => {
        if (open || sentRef.current) return;
        resetAfterSos();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar SOS</DialogTitle>
          <DialogDescription>
            Se enviará automáticamente como urgencia en {countdown}s si no eliges otro tipo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {SOS_TYPES.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={sosType === item.value ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  setSosType(item.value);
                  setCountdown(AUTO_SEND_SECONDS);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_NOTES.map((item) => (
              <Button
                key={item}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setNote(item);
                  setCountdown(AUTO_SEND_SECONDS);
                }}
              >
                {item}
              </Button>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setCountdown(AUTO_SEND_SECONDS);
            }}
            maxLength={500}
            placeholder="Nota opcional para quien reciba el aviso"
          />
          <p className="text-xs text-muted-foreground">
            {pendingPayload?.battery_level != null
              ? `Batería detectada: ${pendingPayload.battery_level}%${pendingPayload.battery_charging ? " · cargando" : ""}. `
              : "Batería no disponible en este navegador. "}
            {pendingPayload?.location.source === "last_known"
              ? "Se usará la última ubicación conocida."
              : pendingPayload?.location.lat != null
                ? "Ubicación actual detectada."
                : "Sin ubicación disponible."}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={resetAfterSos}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={() => void sendSos()}>
            Enviar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === "compact") {
    return (
      <>
        <Button
          variant="destructive"
          size="sm"
          className={cn("relative touch-none overflow-hidden", className)}
          disabled={sending}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onClick={handleClick}
          title="Mantén pulsado 2 s para enviar SOS"
        >
          <span
            className="absolute inset-0 bg-white/25"
            style={{ width: `${progress}%`, transition: "width 60ms linear" }}
          />
          <AlertTriangle className="mr-2 h-4 w-4 relative" />
          <span className="relative">{sending ? "Preparando…" : label}</span>
        </Button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Botón SOS"
        disabled={sending}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onClick={handleClick}
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border-2 border-destructive bg-destructive text-destructive-foreground shadow-lg",
          "flex touch-none items-center justify-center gap-3 px-6 py-6 font-bold text-lg select-none",
          "transition-transform active:scale-[0.98] disabled:opacity-70",
          className,
        )}
      >
        <span
          className="absolute inset-0 bg-white/25"
          style={{ width: `${progress}%`, transition: "width 60ms linear" }}
        />
        <AlertTriangle className="relative h-6 w-6" />
        <span className="relative">
          {sending ? "Preparando SOS…" : progress > 0 ? "Mantén pulsado…" : "SOS — mantén pulsado 2 s"}
        </span>
      </button>
      {dialog}
    </>
  );
}
