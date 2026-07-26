import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { triggerSos } from "@/lib/sos.functions";

const HOLD_MS = 2000;

async function getLocation(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        clearTimeout(timeout);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 60000 },
    );
  });
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
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const holdStart = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const fired = useRef(false);

  const stopHold = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    holdStart.current = null;
    setProgress(0);
  };

  const fire = async () => {
    if (fired.current || sending) return;
    fired.current = true;
    setSending(true);
    const loc = await getLocation();
    try {
      await doTrigger({
        data: {
          latitude: loc?.lat ?? null,
          longitude: loc?.lng ?? null,
          location_accuracy: loc?.accuracy ?? null,
          note: null,
        },
      });
      toast.success("🚨 Alerta SOS enviada al hogar");
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
    fired.current = false;
    holdStart.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };

  if (variant === "compact") {
    return (
      <Button
        variant="destructive"
        size="sm"
        className={cn("relative overflow-hidden", className)}
        disabled={sending}
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
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
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border-2 border-destructive bg-destructive text-destructive-foreground shadow-lg",
        "flex items-center justify-center gap-3 px-6 py-6 font-bold text-lg select-none",
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
