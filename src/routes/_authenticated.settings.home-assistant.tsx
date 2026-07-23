import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { HomeIcon, RefreshCw, Trash2, Plug, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getHomeAssistantConnection,
  saveHomeAssistantConnection,
  deleteHomeAssistantConnection,
  syncHomeAssistantEntities,
} from "@/lib/home-assistant.functions";

const haQueryOptions = queryOptions({
  queryKey: ["home-assistant", "connection"],
  queryFn: () => getHomeAssistantConnection(),
});

export const Route = createFileRoute("/_authenticated/settings/home-assistant")({
  loader: ({ context }) => context.queryClient.ensureQueryData(haQueryOptions),
  head: () => ({
    meta: [
      { title: "Home Assistant - HomeSync" },
      {
        name: "description",
        content: "Vincula tu instancia de Home Assistant para controlar dispositivos del hogar desde HomeSync.",
      },
    ],
  }),
  component: HomeAssistantSettingsPage,
});

function HomeAssistantSettingsPage() {
  const queryClient = useQueryClient();
  const { data: connection } = useSuspenseQuery(haQueryOptions);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const doSave = useServerFn(saveHomeAssistantConnection);
  const doDelete = useServerFn(deleteHomeAssistantConnection);
  const doSync = useServerFn(syncHomeAssistantEntities);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["home-assistant"] });
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseUrl.trim() || !token.trim()) return;
    setBusy(true);
    try {
      await doSave({ data: { base_url: baseUrl.trim(), token: token.trim() } });
      toast.success("Home Assistant vinculado");
      setToken("");
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al vincular");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const res = (await doSync()) as { count: number };
      toast.success(`Sincronizados ${res.count} dispositivos`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al sincronizar");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("¿Desvincular Home Assistant? Se eliminarán los dispositivos importados.")) return;
    setBusy(true);
    try {
      await doDelete();
      toast.success("Desvinculado");
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al desvincular");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HomeIcon className="h-6 w-6" /> Home Assistant
        </h2>
        <p className="text-muted-foreground">
          Vincula tu instancia de Home Assistant para controlar luces, enchufes, termostatos y sensores desde HomeSync.
        </p>
      </div>

      {connection ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4" /> Estado de la conexión
              <Badge variant={connection.status === "connected" ? "default" : "destructive"}>
                {connection.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              {connection.base_url_masked}
              {connection.last_synced_at && (
                <> · última sincronización {new Date(connection.last_synced_at).toLocaleString()}</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connection.last_error && (
              <Alert variant="destructive">
                <AlertTitle>Último error</AlertTitle>
                <AlertDescription>{connection.last_error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSync} disabled={busy}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sincronizar entidades
              </Button>
              <Button variant="outline" onClick={handleDisconnect} disabled={busy}>
                <Trash2 className="mr-2 h-4 w-4" />
                Desvincular
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Para reemplazar la URL o el token, desvincula y vuelve a conectar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Conectar Home Assistant</CardTitle>
            <CardDescription>
              Necesitas la URL de tu instancia y un <em>Long-Lived Access Token</em> generado en tu perfil de HA
              (Perfil → Tokens de acceso de larga duración).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ha-url">URL base</Label>
                <Input
                  id="ha-url"
                  type="url"
                  placeholder="https://homeassistant.local:8123"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Debe ser accesible desde internet (Nabu Casa Cloud, dominio propio con HTTPS, etc.).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ha-token">Token de acceso</Label>
                <Input
                  id="ha-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  El token se guarda cifrado y nunca se muestra de nuevo.
                </p>
              </div>
              <Button type="submit" disabled={busy || !baseUrl.trim() || !token.trim()}>
                {busy ? "Probando..." : "Probar y guardar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
