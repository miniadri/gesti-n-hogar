import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface Props {
  onDetected: (ean: string) => void;
  active?: boolean;
  paused?: boolean;
  /** Camera permission is more reliable when requested by an explicit tap. */
  requireUserGesture?: boolean;
}

/**
 * Live camera barcode scanner using @zxing/browser.
 * Uses the rear camera on mobile when available.
 */
export function BarcodeScanner({ onDetected, active = true, paused = false, requireUserGesture = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const generationRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [requested, setRequested] = useState(!requireUserGesture);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stopCamera = useCallback(() => {
    generationRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRunning(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (startingRef.current || controlsRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite usar la cámara");
      return;
    }

    startingRef.current = true;
    const generation = generationRef.current;
    setError(null);
    try {
      // Request the stream directly. Enumerating cameras before asking for it
      // fails on some Android/PWA combinations even when camera access works.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (generation !== generationRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        // Debounce duplicate detections within 2s.
        if (code === lastRef.current.code && now - lastRef.current.at < 2000) return;
        lastRef.current = { code, at: now };
        onDetectedRef.current(code);
      });
      if (generation !== generationRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setRunning(true);
    } catch (e: any) {
      setError(e?.message || "No se pudo acceder a la cámara");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } finally {
      startingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (active && !paused && requested) {
      void startCamera();
    } else {
      stopCamera();
    }
  }, [active, paused, requested, startCamera, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  const requestCamera = useCallback(() => {
    setError(null);
    setRequested(true);
    // Start in the tap handler itself: mobile browsers can require this user
    // gesture for getUserMedia, rather than a later React effect.
    if (active && !paused) void startCamera();
  }, [active, paused, startCamera]);

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
      {(!requested || error) && (
        <Button type="button" className="w-full" onClick={requestCamera}>
          <Camera className="mr-2 h-4 w-4" /> {requested ? "Reintentar cámara" : "Activar cámara"}
        </Button>
      )}
    </div>
  );
}
