import { useEffect, useRef, useState } from "react";
import {
  Battery,
  Bell,
  Camera,
  CheckCircle2,
  LocateFixed,
  Mic,
  Radio,
  Smartphone,
  Volume2,
  Wifi,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Capability = {
  key: string;
  label: string;
  available: boolean;
  status: string;
};

function getConnectionLabel() {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!connection) return "No expuesta";
  return [connection.effectiveType, connection.type, connection.downlink ? `${connection.downlink} Mbps` : null]
    .filter(Boolean)
    .join(" · ");
}

function formatPosition(pos: GeolocationPosition) {
  const lat = pos.coords.latitude.toFixed(6);
  const lng = pos.coords.longitude.toFixed(6);
  const accuracy = Math.round(pos.coords.accuracy);
  return `${lat}, ${lng} · precisión ${accuracy} m`;
}

export function DeviceCapabilityExperiment() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [lastResult, setLastResult] = useState<string>("Sin pruebas ejecutadas");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setCapabilities([
      {
        key: "motion",
        label: "Movimiento / acelerómetro",
        available: "DeviceMotionEvent" in window,
        status: "Útil solo con pantalla activa en navegador",
      },
      {
        key: "orientation",
        label: "Orientación / inclinación",
        available: "DeviceOrientationEvent" in window,
        status: "Depende de permisos del navegador",
      },
      {
        key: "battery",
        label: "Batería",
        available: typeof (navigator as any).getBattery === "function",
        status: "Suele funcionar en Chrome Android; no en iPhone/Safari",
      },
      {
        key: "location",
        label: "Ubicación",
        available: "geolocation" in navigator,
        status: "Requiere permiso y HTTPS",
      },
      {
        key: "push",
        label: "Notificación local",
        available: "Notification" in window,
        status: "Prueba permiso del navegador, no Telegram",
      },
      {
        key: "camera",
        label: "Cámara",
        available: !!navigator.mediaDevices?.getUserMedia,
        status: "Requiere permiso activo",
      },
      {
        key: "microphone",
        label: "Micrófono",
        available: !!navigator.mediaDevices?.getUserMedia,
        status: "Requiere permiso activo",
      },
      {
        key: "speaker",
        label: "Altavoz",
        available: typeof (window as any).AudioContext !== "undefined" || typeof (window as any).webkitAudioContext !== "undefined",
        status: "El volumen/No molestar lo controla el sistema",
      },
      {
        key: "network",
        label: "Conexión",
        available: "onLine" in navigator,
        status: navigator.onLine ? `Online · ${getConnectionLabel()}` : "Offline",
      },
    ]);

    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
      micStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
      micStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream, micStream]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const testBattery = async () => {
    try {
      const battery = await (navigator as any).getBattery?.();
      if (!battery) throw new Error("Battery API no disponible");
      setLastResult(`Batería: ${Math.round(battery.level * 100)}% · ${battery.charging ? "cargando" : "sin cargar"}`);
    } catch (err: any) {
      setLastResult(err?.message || "No se pudo leer batería");
    }
  };

  const testLocation = () => {
    if (!navigator.geolocation) {
      setLastResult("Ubicación no disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLastResult(`Ubicación: ${formatPosition(pos)}`),
      (err) => setLastResult(`Ubicación falló: ${err.message}`),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const testNotification = async () => {
    if (!("Notification" in window)) {
      setLastResult("Notificaciones no disponibles");
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      setLastResult(`Notificación no permitida: ${permission}`);
      return;
    }
    new Notification("HomeSync prueba", {
      body: "Notificación local del navegador recibida.",
      requireInteraction: true,
    });
    setLastResult("Notificación local lanzada");
  };

  const testCamera = async () => {
    try {
      cameraStream?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setCameraStream(stream);
      setLastResult("Cámara activa");
    } catch (err: any) {
      setLastResult(err?.message || "No se pudo abrir cámara");
    }
  };

  const testMic = async () => {
    try {
      micStream?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setMicStream(stream);
      setLastResult("Micrófono activo; permiso concedido");
    } catch (err: any) {
      setLastResult(err?.message || "No se pudo abrir micrófono");
    }
  };

  const stopMedia = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    micStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setMicStream(null);
    setLastResult("Cámara y micrófono detenidos");
  };

  const testSpeaker = async () => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      window.setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => {});
      }, 420);
      setLastResult("Sonido de prueba emitido");
    } catch (err: any) {
      setLastResult(err?.message || "No se pudo emitir sonido");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Capacidades del dispositivo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((item) => (
            <div key={item.key} className="rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                {item.available ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                {item.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.status}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={testBattery}>
            <Battery className="mr-2 h-4 w-4" />
            Batería
          </Button>
          <Button variant="outline" onClick={testLocation}>
            <LocateFixed className="mr-2 h-4 w-4" />
            Ubicación
          </Button>
          <Button variant="outline" onClick={() => void testNotification()}>
            <Bell className="mr-2 h-4 w-4" />
            Notificación
          </Button>
          <Button variant="outline" onClick={() => void testCamera()}>
            <Camera className="mr-2 h-4 w-4" />
            Cámara
          </Button>
          <Button variant="outline" onClick={() => void testMic()}>
            <Mic className="mr-2 h-4 w-4" />
            Micrófono
          </Button>
          <Button variant="outline" onClick={() => void testSpeaker()}>
            <Volume2 className="mr-2 h-4 w-4" />
            Altavoz
          </Button>
          <Button variant="outline" onClick={() => setLastResult(`Red: ${navigator.onLine ? "online" : "offline"} · ${getConnectionLabel()}`)}>
            <Wifi className="mr-2 h-4 w-4" />
            Red
          </Button>
          <Button variant="secondary" onClick={stopMedia}>
            <Radio className="mr-2 h-4 w-4" />
            Detener medios
          </Button>
        </div>

        {cameraStream && (
          <video ref={videoRef} autoPlay playsInline muted className="max-h-72 w-full rounded-lg border bg-black object-contain" />
        )}

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Último resultado</p>
          <p className="mt-1 text-muted-foreground">{lastResult}</p>
        </div>
      </CardContent>
    </Card>
  );
}
