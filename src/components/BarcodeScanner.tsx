import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface Props {
  onDetected: (ean: string) => void;
  active?: boolean;
  paused?: boolean;
}

/**
 * Live camera barcode scanner using @zxing/browser.
 * Uses the rear camera on mobile when available.
 */
export function BarcodeScanner({ onDetected, active = true, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    if (!active || paused) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        // Prefer rear camera
        const rear =
          devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        if (!rear) {
          setError("No se ha encontrado ninguna cámara");
          return;
        }
        if (!videoRef.current || cancelled) return;
        const controls = await reader.decodeFromVideoDevice(
          rear.deviceId,
          videoRef.current,
          (result) => {
            if (!result) return;
            const code = result.getText();
            const now = Date.now();
            // Debounce duplicate detections within 2s
            if (code === lastRef.current.code && now - lastRef.current.at < 2000) return;
            lastRef.current = { code, at: now };
            onDetected(code);
          },
        );
        controlsRef.current = controls;
        setRunning(true);
      } catch (e: any) {
        setError(e?.message || "No se pudo acceder a la cámara");
      }
    };
    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setRunning(false);
    };
  }, [active, paused, onDetected]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border bg-black aspect-[4/3]">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        {running && (
          <span className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            <Camera className="h-3 w-3" /> Escaneando
          </span>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <CameraOff className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}
