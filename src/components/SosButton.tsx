import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { triggerSos } from "@/lib/sos.functions";

const HOLD_MS = 2000;

type SosLocation =
  | { lat: number; lng: number; accuracy: number; source: "precise" | "fallback" }
  | { lat: null; lng: null; accuracy: null; error: string };

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
    return { lat: null, lng: null, accuracy: null, error: "geolocation_unavailable" };
  }

  const precise = await requestPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 30000,
  });
  if (precise) {
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
    return {
      lat: fallback.coords.latitude,
      lng: fallback.coords.longitude,
      accuracy: fallback.coords.accuracy,
      source: "fallback",
    };
  }

  return { lat: null, lng: null, accuracy: null, error: "location_timeout_or_denied" };
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
  const holdStart = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const pointerId = useRef<number | null>(null);

  const stopHold = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    raf.current = null;
    holdTimer.current = null;
    holdStart.current = null;
    pointerId.current = null;
    setProgress(0);
  };

  const fire = async () => {
    if (fired.current || sending) return;
    fired.current = true;
    setSending(true);
    const loc = await getLocation();
    try {
      const result: any = await doTrigger({
        data: {
          latitude: loc.lat,
          longitude: loc.lng,
          location_accuracy: loc.accuracy,
          note: null,
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

      if (!hasLocation) {
        toast.warning("El navegador no entregó ubicación. Revisa permisos de ubicación y que la web esté en HTTPS.");
      }
    } catch (err: any) {
      toast.error(err?.message || "No se pudo enviar el SOS");
    } finally {
      setSending(false);
      setTimeout(() => (fired.current = false), 1500);
    }
  };

  const tick = () => {
    if (holdStart.current == null) return;
    const elapsed = performance.now() - holdStart.current;
    const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
    setProgress(pct);
    if (elapsed >= HOLD_MS) {
      stopHold();
      void fire();
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
      void fire();
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

  if (variant === "compact") {
    return (
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
        <span className="relative">{sending ? "Enviando…" : label}</span>
      </Button>
    );
  }

  return (
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
        {sending ? "Enviando SOS…" : progress > 0 ? "Mantén pulsado…" : "SOS — mantén pulsado 2 s"}
      </span>
    </button>
  );
}
