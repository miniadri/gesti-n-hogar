import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellRing, Mail, Send, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { subscribePush, unsubscribePush, getVapidPublicKey } from "@/lib/push.functions";
import { getTelegramProfile, unlinkTelegram, linkTelegram } from "@/lib/medications.functions";
import { sendPushTest, sendTelegramTest } from "@/lib/notification-tests.functions";
import { toast } from "sonner";

const telegramQueryOptions = queryOptions({
  queryKey: ["telegram-profile"],
  queryFn: () => getTelegramProfile(),
});

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({
    meta: [{ title: "Notificaciones - HomeSync" }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(telegramQueryOptions);
  },
  component: NotificationsSettingsPage,
});

function NotificationsSettingsPage() {
  const { t } = useTranslation();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [testLoading, setTestLoading] = useState<"telegram" | "push" | null>(null);
  const queryClient = useQueryClient();
  const { data: telegramProfile } = useSuspenseQuery(telegramQueryOptions);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration("/sw.js");
        const reg = existing ?? (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
        void reg;
      } catch (err) {
        console.error("SW register failed", err);
      }
    })();
  }, []);

  const doSubscribe = useServerFn(subscribePush);
  const doUnsubscribe = useServerFn(unsubscribePush);
  const getKey = useServerFn(getVapidPublicKey);
  const doUnlinkTelegram = useServerFn(unlinkTelegram);
  const doLinkTelegram = useServerFn(linkTelegram);
  const doTelegramTest = useServerFn(sendTelegramTest);
  const doPushTest = useServerFn(sendPushTest);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("telegram_token");
    if (!token) return;
    doLinkTelegram({ data: { token } })
      .then(() => {
        toast.success("Telegram vinculado correctamente");
        queryClient.invalidateQueries({ queryKey: ["telegram-profile"] });
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch((err: any) => toast.error(err.message || "Error al vincular Telegram"));
  }, []);

  const handleSubscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Tu navegador no soporta notificaciones push");
      return;
    }
    setLoading(true);
    try {
      if (window.top !== window.self) {
        toast.warning("Abre la vista previa en una pestaña nueva para poder activar las notificaciones (el iframe bloquea el permiso).");
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        throw new Error(
          perm === "denied"
            ? "Permiso denegado. Actívalo en el candado de la barra de direcciones para este sitio."
            : "Permiso no concedido",
        );
      }
      const { publicKey } = await getKey();
      if (!publicKey) throw new Error("VAPID key no configurada");
      const existing = await navigator.serviceWorker.getRegistration("/sw.js");
      const reg = existing ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
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

  const handleUnlinkTelegram = async () => {
    setTelegramLoading(true);
    try {
      await doUnlinkTelegram();
      toast.success("Telegram desvinculado");
      queryClient.invalidateQueries({ queryKey: ["telegram-profile"] });
    } catch (err: any) {
      toast.error(err.message || "Error al desvincular Telegram");
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleTelegramTest = async () => {
    setTestLoading("telegram");
    try {
      const result = await doTelegramTest();
      if (result.ok) {
        toast.success("Prueba enviada por Telegram");
      } else {
        toast.warning("No se pudo confirmar el envío por Telegram");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al probar Telegram");
    } finally {
      setTestLoading(null);
    }
  };

  const handlePushTest = async () => {
    setTestLoading("push");
    try {
      const result = await doPushTest();
      if (result.ok) {
        toast.success("Prueba push enviada");
      } else {
        toast.warning("No se encontró una suscripción push activa para este usuario");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al probar push");
    } finally {
      setTestLoading(null);
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
            <BellRing className="h-5 w-5" />
            Pruebas de aviso
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={handleTelegramTest}
            disabled={testLoading !== null || !telegramProfile}
          >
            {testLoading === "telegram" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4" />
            Probar Telegram
          </Button>
          <Button
            variant="outline"
            onClick={handlePushTest}
            disabled={testLoading !== null || !subscribed}
          >
            {testLoading === "push" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Bell className="mr-2 h-4 w-4" />
            Probar push
          </Button>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Las pruebas se envían solo a tu usuario actual. Sirven para comprobar el canal antes de depender de
            recordatorios o alertas reales.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t("medications.telegram.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("medications.telegram.description")}</p>
          <p className="text-sm">{t("medications.telegram.instructions")}</p>
          {telegramProfile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                <Send className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">{t("medications.telegram.linked")}: {telegramProfile.chat_id}</span>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleUnlinkTelegram}
                disabled={telegramLoading}
              >
                {telegramLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("medications.telegram.unlink")}
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              asChild
            >
              <a
                href="https://t.me/HogarSync_bot?start=homesync"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="mr-2 h-4 w-4" />
                {t("medications.telegram.link")}
              </a>
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
            { id: "medications", label: "Tomar medicación" },
            { id: "sos", label: "Alertas SOS" },
            { id: "food_expiry", label: "Alimentos próximos a caducar" },
            { id: "medicine_expiry", label: "Medicinas próximas a caducar" },
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
