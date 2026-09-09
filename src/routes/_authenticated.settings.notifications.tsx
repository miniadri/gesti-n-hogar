import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellRing, Mail, Send, Loader2, Activity, Smartphone } from "lucide-react";

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
  const [localTestLoading, setLocalTestLoading] = useState(false);
  const [lastPushResult, setLastPushResult] = useState<{
    ok: boolean;
    sent: number;
    attempted: number;
    subscriptions: number;
    reason: string | null;
    details?: Array<{ ok: boolean; endpointHost?: string | null; statusCode?: number | null; error?: string | null }>;
  } | null>(null);
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission | "unsupported";
    serviceWorker: string;
    controller: string;
    browserSubscription: boolean;
    displayMode: string;
    endpointHost: string | null;
    visibility: string;
    online: boolean;
  } | null>(null);
  const queryClient = useQueryClient();
  const { data: telegramProfile } = useSuspenseQuery(telegramQueryOptions);

  const doSubscribe = useServerFn(subscribePush);
  const doUnsubscribe = useServerFn(unsubscribePush);
  const getKey = useServerFn(getVapidPublicKey);
  const doUnlinkTelegram = useServerFn(unlinkTelegram);
  const doLinkTelegram = useServerFn(linkTelegram);
  const doTelegramTest = useServerFn(sendTelegramTest);
  const doPushTest = useServerFn(sendPushTest);

  const inspectPushState = async () => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const displayMode = window.matchMedia("(display-mode: standalone)").matches
      ? "app instalada"
      : "navegador";
    if (!supported) {
      setSubscribed(false);
      setPushStatus({
        supported: false,
        permission: "unsupported",
        serviceWorker: "No soportado",
        controller: "No",
        browserSubscription: false,
        displayMode,
        endpointHost: null,
        visibility: document.visibilityState,
        online: navigator.onLine,
      });
      return;
    }

    try {
      const existing = await navigator.serviceWorker.getRegistration("/");
      const reg = existing ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await navigator.serviceWorker.ready;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await doSubscribe({ data: sub.toJSON() as any });
      }
      setSubscribed(Boolean(sub));
      setPushStatus({
        supported: true,
        permission: Notification.permission,
        serviceWorker: reg.active ? "Activo" : reg.installing ? "Instalando" : reg.waiting ? "Esperando" : "Registrado",
        controller: navigator.serviceWorker.controller ? "Sí" : "Pendiente hasta recargar",
        browserSubscription: Boolean(sub),
        displayMode,
        endpointHost: sub ? safeEndpointHost(sub.endpoint) : null,
        visibility: document.visibilityState,
        online: navigator.onLine,
      });
    } catch (err) {
      console.error("SW register failed", err);
      setSubscribed(false);
      setPushStatus({
        supported: true,
        permission: "Notification" in window ? Notification.permission : "unsupported",
        serviceWorker: err instanceof Error ? err.message : "Error",
        controller: navigator.serviceWorker?.controller ? "Sí" : "No",
        browserSubscription: false,
        displayMode,
        endpointHost: null,
        visibility: document.visibilityState,
        online: navigator.onLine,
      });
    }
  };

  useEffect(() => {
    void inspectPushState();
  }, []);

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
      if (!publicKey) throw new Error("VAPID_PUBLIC_KEY no configurada en Cloudflare");
      const existing = await navigator.serviceWorker.getRegistration("/");
      const reg = existing ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const previousSub = await reg.pushManager.getSubscription();
      if (previousSub) await previousSub.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey.trim()),
      });
      await doSubscribe({ data: sub.toJSON() as any });
      setSubscribed(true);
      await inspectPushState();
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
      await inspectPushState();
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
      setLastPushResult(result as any);
      if (result.ok) {
        toast.success(`Prueba push enviada (${result.sent}/${result.attempted})`);
      } else {
        toast.warning(pushReasonLabel(result.reason));
        await inspectPushState();
      }
    } catch (err: any) {
      toast.error(err.message || "Error al probar push");
    } finally {
      setTestLoading(null);
    }
  };

  const handleLocalNotificationTest = async () => {
    setLocalTestLoading(true);
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        throw new Error("Este navegador no soporta notificaciones web");
      }
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (perm !== "granted") {
        throw new Error("Permiso de notificaciones no concedido para este sitio");
      }
      const existing = await navigator.serviceWorker.getRegistration("/");
      const reg = existing ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;

      if (reg.active) {
        reg.active.postMessage({
          type: "HOMESYNC_SHOW_TEST_NOTIFICATION",
          title: "Prueba local de HomeSync",
          body: "Si ves este aviso, Android/Chrome permite mostrar notificaciones para HomeSync.",
          url: "/settings/notifications",
        });
      } else {
        await reg.showNotification("Prueba local de HomeSync", {
          body: "Si ves este aviso, Android/Chrome permite mostrar notificaciones para HomeSync.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "homesync-local-test",
          renotify: true,
          vibrate: [140, 70, 140],
          data: { url: "/settings/notifications" },
        });
      }
      await inspectPushState();
      toast.success("Prueba local solicitada");
    } catch (err: any) {
      toast.error(err.message || "No se pudo mostrar la notificación local");
      await inspectPushState();
    } finally {
      setLocalTestLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notificaciones</h2>
        <p className="text-muted-foreground">Configura alertas y recordatorios</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <Activity className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Historial común de avisos</p>
              <p className="text-sm text-muted-foreground">
                Revisa SOS, cuadrante, calendario, medicación, compra e inventario en un solo sitio.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link to="/settings/activity">Ver actividad</Link>
          </Button>
        </CardContent>
      </Card>

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
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={handleSubscribe} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reparar suscripción push
            </Button>
            <Button variant="outline" onClick={inspectPushState} disabled={loading} className="w-full">
              <Smartphone className="mr-2 h-4 w-4" />
              Diagnosticar este dispositivo
            </Button>
            <Button variant="outline" onClick={handleLocalNotificationTest} disabled={localTestLoading} className="w-full sm:col-span-2">
              {localTestLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <BellRing className="mr-2 h-4 w-4" />
              Probar notificación local en este dispositivo
            </Button>
          </div>
          {pushStatus && (
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <InfoPill label="Soporte" value={pushStatus.supported ? "Compatible" : "No compatible"} />
              <InfoPill label="Permiso" value={permissionLabel(pushStatus.permission)} />
              <InfoPill label="Service worker" value={pushStatus.serviceWorker} />
              <InfoPill label="Control SW" value={pushStatus.controller} />
              <InfoPill label="Suscripción local" value={pushStatus.browserSubscription ? "Existe" : "No existe"} />
              <InfoPill label="Modo" value={pushStatus.displayMode} />
              <InfoPill label="Proveedor push" value={pushStatus.endpointHost ?? "Sin endpoint"} />
              <InfoPill label="Conexión" value={pushStatus.online ? "Online" : "Offline"} />
              <InfoPill label="Estado pantalla" value={pushStatus.visibility} />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Primero prueba la notificación local. Si no aparece, revisa permisos de Android/Chrome para este sitio. Si aparece pero falla “Probar push”, el problema está en VAPID, suscripción o envío del servidor.
              </p>
            </div>
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
          {lastPushResult && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2">
              <p className="font-medium">
                Última prueba push: {lastPushResult.ok ? "enviada" : "fallida"}
              </p>
              <p className="text-muted-foreground">
                Enviadas: {lastPushResult.sent} · Intentos: {lastPushResult.attempted} · Suscripciones: {lastPushResult.subscriptions}
              </p>
              {lastPushResult.reason && (
                <p className="mt-1 text-muted-foreground">Motivo: {pushReasonLabel(lastPushResult.reason)}</p>
              )}
              {lastPushResult.details?.length ? (
                <div className="mt-2 space-y-1">
                  {lastPushResult.details.map((detail, index) => (
                    <p key={index} className="break-words text-xs text-muted-foreground">
                      {detail.endpointHost ?? "endpoint"}: {detail.ok ? "OK" : `Error ${detail.statusCode ?? ""} ${detail.error ?? ""}`.trim()}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          )}
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words">{value}</p>
    </div>
  );
}

function permissionLabel(permission: NotificationPermission | "unsupported") {
  if (permission === "granted") return "Concedido";
  if (permission === "denied") return "Denegado";
  if (permission === "default") return "Sin decidir";
  return "No soportado";
}

function safeEndpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "endpoint no legible";
  }
}

function pushReasonLabel(reason: string | null | undefined) {
  switch (reason) {
    case "no_users":
      return "No hay usuario autenticado para enviar la prueba.";
    case "vapid_missing":
      return "Faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en Cloudflare.";
    case "vapid_invalid":
      return "Las claves VAPID no son válidas o no coinciden.";
    case "no_subscriptions":
      return "No hay suscripción push guardada. Pulsa Reparar suscripción push.";
    case "delivery_failed":
      return "El servidor intentó enviar la push, pero el proveedor la rechazó.";
    default:
      return "No se pudo enviar la prueba push.";
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData.split("").map((c) => c.charCodeAt(0)));
}
