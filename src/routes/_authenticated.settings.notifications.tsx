import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Bell, BellRing, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { subscribePush, unsubscribePush } from "@/lib/push.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({
    meta: [{ title: "Notificaciones - HomeSync" }],
  }),
  component: NotificationsSettingsPage,
});

function NotificationsSettingsPage() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub));
      });
    }
  }, []);

  const doSubscribe = useServerFn(subscribePush);
  const doUnsubscribe = useServerFn(unsubscribePush);

  const handleSubscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Tu navegador no soporta notificaciones push");
      return;
    }
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.VAPID_PUBLIC_KEY || ""),
      });
      await doSubscribe({ data: sub.toJSON() as any });
      setSubscribed(true);
      toast.success("Notificaciones activadas");
    } catch (err: any) {
      toast.error(err.message || "Error al activar notificaciones");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await doUnsubscribe();
      setSubscribed(false);
      toast.success("Notificaciones desactivadas");
    } catch (err: any) {
      toast.error(err.message || "Error al desactivar notificaciones");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notificaciones</h2>
        <p className="text-muted-foreground">Configura alertas y recordatorios</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5" />
            Notificaciones web
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Recibe alertas en tu navegador cuando haya tareas próximas, stock bajo o eventos importantes.
          </p>
          {subscribed ? (
            <Button variant="destructive" onClick={handleUnsubscribe} disabled={loading} className="w-full">
              Desactivar notificaciones
            </Button>
          ) : (
            <Button onClick={handleSubscribe} disabled={loading} className="w-full">
              <Bell className="mr-2 h-4 w-4" />
              Activar notificaciones
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Tipos de alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { id: "tasks", label: "Tareas próximas a vencer" },
            { id: "inventory", label: "Stock bajo" },
            { id: "events", label: "Eventos del calendario" },
            { id: "budget", label: "Presupuesto excedido" },
          ].map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <Label htmlFor={item.id}>{item.label}</Label>
              <Switch id={item.id} defaultChecked />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData.split("").map((c) => c.charCodeAt(0)));
}
