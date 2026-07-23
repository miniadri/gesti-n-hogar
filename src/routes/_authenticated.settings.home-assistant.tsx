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

function isPrivateOrLocalUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local")) return true;
    if (/^127\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

function isInsecureHttp(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === "http:";
  } catch {
    return false;
  }
}

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
  const [saveError, setSaveError] = useState<string | null>(null);

  const doSave = useServerFn(saveHomeAssistantConnection);
  const doDelete = useServerFn(deleteHomeAssistantConnection);
  const doSync = useServerFn(syncHomeAssistantEntities);

  const urlIsPrivate = isPrivateOrLocalUrl(baseUrl);
  const urlIsHttp = isInsecureHttp(baseUrl);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["home-assistant"] });
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseUrl.trim() || !token.trim()) return;
    setSaveError(null);
    setBusy(true);
    try {
      await doSave({ data: { base_url: baseUrl.trim(), token: token.trim() } });
      toast.success("Home Assistant vinculado");
      setToken("");
      setBaseUrl("");
      refresh();
    } catch (err: any) {
      const msg = err?.message ?? "Error al vincular";
      setSaveError(msg);
      toast.error(msg);
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
              Necesitas la URL pública de tu instancia y un{" "}
              <em>Long-Lived Access Token</em> generado en tu perfil de HA (Perfil → Tokens de acceso de
              larga duración).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ha-url">URL base</Label>
                <Input
                  id="ha-url"
                  type="url"
                  placeholder="https://tuha.duckdns.org:8123"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    setSaveError(null);
                  }}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Debe ser una URL pública con HTTPS. HomeSync se ejecuta en la nube, por lo que no puede
                  alcanzar direcciones privadas como 192.168.x.x o homeassistant.local.
                </p>
              </div>

              {(urlIsPrivate || urlIsHttp) && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Esta URL no será accesible desde HomeSync</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      Has introducido una dirección {urlIsPrivate ? "privada/local" : "HTTP sin cifrar"}.
                      El backend de HomeSync está en la nube y no puede llegar a redes locales. Necesitas
                      exponer Home Assistant a internet con HTTPS.
                    </p>
                    <p className="font-medium">Nabu Casa Cloud es de pago (sólo 1 mes de prueba). Opciones 100% gratuitas:</p>
                  </AlertDescription>
                </Alert>
              )}

              {(urlIsPrivate || urlIsHttp || saveError) && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="cloudflare">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Info className="h-4 w-4" /> Opción A: Cloudflare Tunnel (gratuito)
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 text-muted-foreground">
                      <p>
                        Crea un túnel seguro desde tu red local hasta internet sin abrir puertos ni tener IP
                        pública fija.
                      </p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>
                          Crea una cuenta gratuita en{" "}
                          <a
                            href="https://dash.cloudflare.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            Cloudflare
                          </a>{" "}
                          y añade un dominio (puedes usar uno gratuito como .workers.dev o comprar uno).
                        </li>
                        <li>
                          En tu Home Assistant instala el add-on oficial{" "}
                          <em>Cloudflare Tunnel</em> (o el paquete <code>cloudflared</code>).
                        </li>
                        <li>
                          En Cloudflare Zero Trust → Access → Tunnels, crea un túnel y copia el token.
                        </li>
                        <li>
                          Configura el túnel para apuntar a <code>http://homeassistant.local:8123</code> (o
                          la IP interna de HA) con servicio HTTP.
                        </li>
                        <li>
                          Asigna un hostname público, por ejemplo{" "}
                          <code>ha-tucasa.dominio.com</code>. Cloudflare genera el certificado HTTPS
                          automáticamente.
                        </li>
                        <li>Pega aquí la URL pública que empiece por https://.</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="duckdns">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Info className="h-4 w-4" /> Opción B: DuckDNS + Let's Encrypt (100% gratuito)
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 text-muted-foreground">
                      <p>
                        Si ya tienes cuenta en DuckDNS y quieres usar tu propio dominio (o uno de DuckDNS)
                        con certificado gratuito de Let's Encrypt.
                      </p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>
                          En{" "}
                          <a
                            href="https://www.duckdns.org"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            DuckDNS
                          </a>{" "}
                          crea un subdominio gratuito (p. ej. <code>tuha.duckdns.org</code>) y apúntalo a tu
                          IP pública.
                        </li>
                        <li>
                          En tu router redirige el puerto 443 de tu IP pública al puerto 8123 de Home
                          Assistant (o al reverse proxy que uses).
                        </li>
                        <li>
                          En Home Assistant, activa HTTPS con Let's Encrypt. Si usas Home Assistant OS:
                          instala el add-on <em>Let's Encrypt</em> o configura el add-on{" "}
                          <em>DuckDNS</em> (éste actualiza tu IP y obtiene el certificado en uno).
                        </li>
                        <li>
                          Si prefieres hacerlo manualmente, usa un reverse proxy como Nginx Proxy Manager o
                          Traefik con el certificado de Let's Encrypt y redirige a HA.
                        </li>
                        <li>
                          Verifica que puedes abrir <code>https://tuha.duckdns.org:8123</code> desde el
                          móvil fuera de casa.
                        </li>
                        <li>Pega aquí esa URL exacta.</li>
                      </ol>
                      <p className="text-xs">
                        Let's Encrypt es 100% gratuito. Si ya tienes dominio propio, puedes usarlo en vez
                        del subdominio de DuckDNS apuntando su DNS a tu IP y renovando el certificado con
                        Let's Encrypt.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {saveError && !urlIsPrivate && !urlIsHttp && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No se pudo conectar</AlertTitle>
                  <AlertDescription>
                    {saveError}. Comprueba que la URL es pública, que usa HTTPS y que el token es válido. Si
                    la URL es correcta pero sigue fallando, revisa que Home Assistant acepte conexiones desde
                    internet.
                  </AlertDescription>
                </Alert>
              )}

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
              <Button type="submit" disabled={busy || !baseUrl.trim() || !token.trim() || urlIsPrivate}>
                {busy ? "Probando..." : "Probar y guardar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
