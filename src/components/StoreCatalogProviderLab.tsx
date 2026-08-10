import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Database, ExternalLink, Loader2, RefreshCw, Save, Search, Settings2, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getStoreCatalogLabState,
  queueStoreCatalogTerm,
  runStoreCatalogManualProbe,
  runStoreCatalogProviderMatrixProbe,
  updateStoreCatalogProvider,
  updateStoreCatalogSource,
} from "@/lib/store-catalog-admin.functions";

type Provider = {
  provider_key: string;
  name: string;
  enabled: boolean;
  secret_name: string | null;
  weekly_budget_credits: number;
  monthly_budget_credits: number;
  estimated_credits_per_query: number;
  notes: string | null;
};

type Source = {
  store_key: string;
  store_name: string;
  mode: "live" | "cached" | "external";
  enabled: boolean;
  preferred_provider_key: string | null;
  weekly_term_limit: number;
  priority_weight: number;
  external_search_url_template: string | null;
  notes: string | null;
  cache: { count: number; last_captured_at: string | null };
};

type QueueRow = {
  id: string;
  store_key: string;
  provider_key: string | null;
  status: string;
  priority_score: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  term?: { term?: string; search_count?: number };
};

type ManualProbe = {
  store_key: string;
  store_name: string;
  provider_key: string;
  provider_name: string;
  mode: "live" | "cached" | "external";
  query: string;
  url: string | null;
  status: "ok" | "empty" | "blocked" | "error" | "config_needed" | "skipped";
  http_status: number | null;
  elapsed_ms: number;
  credits_used: number | null;
  notes: string;
  products: Array<{
    name: string;
    brand: string | null;
    price: number | null;
    price_per_unit: string | null;
    image_url: string | null;
    url: string | null;
  }>;
};

const PROVIDER_LABELS: Record<string, string> = {
  firecrawl: "Firecrawl",
  apify: "Apify",
  scrapingbee: "ScrapingBee",
  scraperapi: "ScraperAPI",
  scrapedo: "Scrape.do",
  brightdata: "Bright Data",
};

const MODE_LABELS: Record<string, string> = {
  live: "En vivo",
  cached: "Caché",
  external: "Enlace externo",
};

const PROBE_STATUS_META: Record<ManualProbe["status"], { label: string; className: string }> = {
  ok: { label: "OK", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  empty: { label: "Sin resultados", className: "border-slate-200 bg-slate-50 text-slate-700" },
  blocked: { label: "Bloqueado", className: "border-amber-200 bg-amber-50 text-amber-700" },
  error: { label: "Error", className: "border-red-200 bg-red-50 text-red-700" },
  config_needed: { label: "Configurar", className: "border-blue-200 bg-blue-50 text-blue-700" },
  skipped: { label: "Omitido", className: "border-slate-200 bg-slate-50 text-slate-700" },
};

function formatDate(value?: string | null) {
  if (!value) return "Sin captura";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function statusIcon(status: ManualProbe["status"]) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "blocked" || status === "config_needed") return <ShieldAlert className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-muted-foreground" />;
}

export function StoreCatalogProviderLab() {
  const loadState = useServerFn(getStoreCatalogLabState);
  const saveProvider = useServerFn(updateStoreCatalogProvider);
  const saveSource = useServerFn(updateStoreCatalogSource);
  const queueTerm = useServerFn(queueStoreCatalogTerm);
  const runManualProbe = useServerFn(runStoreCatalogManualProbe);
  const runMatrixProbe = useServerFn(runStoreCatalogProviderMatrixProbe);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [manualProbes, setManualProbes] = useState<ManualProbe[]>([]);
  const [manualCheckedAt, setManualCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [term, setTerm] = useState("leche");
  const [queueStore, setQueueStore] = useState("alcampo");
  const [matrixStore, setMatrixStore] = useState("carrefour");

  const cachedSources = useMemo(() => sources.filter((source) => source.mode === "cached"), [sources]);

  const refresh = async () => {
    setLoading(true);
    try {
      const data: any = await loadState();
      setProviders(data?.providers ?? []);
      setSources(data?.sources ?? []);
      setQueue(data?.queue ?? []);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo cargar el laboratorio de catálogo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const updateProviderLocal = (providerKey: string, patch: Partial<Provider>) => {
    setProviders((prev) =>
      prev.map((provider) => (provider.provider_key === providerKey ? { ...provider, ...patch } : provider)),
    );
  };

  const updateSourceLocal = (storeKey: string, patch: Partial<Source>) => {
    setSources((prev) => prev.map((source) => (source.store_key === storeKey ? { ...source, ...patch } : source)));
  };

  const persistProvider = async (provider: Provider) => {
    setSavingKey(`provider:${provider.provider_key}`);
    try {
      await saveProvider({
        data: {
          provider_key: provider.provider_key as any,
          enabled: provider.enabled,
          weekly_budget_credits: Number(provider.weekly_budget_credits) || 0,
          monthly_budget_credits: Number(provider.monthly_budget_credits) || 0,
          estimated_credits_per_query: Number(provider.estimated_credits_per_query) || 0,
        },
      });
      toast.success(`${provider.name} actualizado`);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo guardar el proveedor.");
    } finally {
      setSavingKey(null);
    }
  };

  const persistSource = async (source: Source) => {
    setSavingKey(`source:${source.store_key}`);
    try {
      await saveSource({
        data: {
          store_key: source.store_key as any,
          enabled: source.enabled,
          mode: source.mode,
          preferred_provider_key: (source.preferred_provider_key || null) as any,
          weekly_term_limit: Number(source.weekly_term_limit) || 0,
          priority_weight: Number(source.priority_weight) || 0,
        },
      });
      toast.success(`${source.store_name} actualizado`);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo guardar la tienda.");
    } finally {
      setSavingKey(null);
    }
  };

  const enqueue = async () => {
    const clean = term.trim();
    if (clean.length < 2) {
      toast.error("Escribe un término de al menos 2 caracteres.");
      return;
    }
    setSavingKey("queue");
    try {
      await queueTerm({ data: { term: clean, store_key: queueStore as any } });
      toast.success(`“${clean}” añadido a la cola de ${queueStore}`);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo añadir a la cola.");
    } finally {
      setSavingKey(null);
    }
  };

  const executeManualProbe = async () => {
    const clean = term.trim();
    if (clean.length < 2) {
      toast.error("Escribe un término de al menos 2 caracteres.");
      return;
    }
    setManualLoading(true);
    try {
      const data: any = await runManualProbe({ data: { term: clean } });
      setManualProbes(data?.probes ?? []);
      setManualCheckedAt(data?.checked_at ?? new Date().toISOString());
      toast.success(`Prueba terminada para “${clean}”`);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo ejecutar la prueba manual.");
    } finally {
      setManualLoading(false);
    }
  };

  const executeMatrixProbe = async () => {
    const clean = term.trim();
    if (clean.length < 2) {
      toast.error("Escribe un término de al menos 2 caracteres.");
      return;
    }
    setManualLoading(true);
    try {
      const data: any = await runMatrixProbe({ data: { term: clean, store_key: matrixStore as any } });
      setManualProbes(data?.probes ?? []);
      setManualCheckedAt(data?.checked_at ?? new Date().toISOString());
      const sourceName = sources.find((source) => source.store_key === matrixStore)?.store_name ?? matrixStore;
      toast.success(`Prueba de ${sourceName} terminada para “${clean}”`);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo ejecutar la prueba por proveedor.");
    } finally {
      setManualLoading(false);
    }
  };

  const weeklyBudget = providers.reduce((sum, provider) => sum + (provider.enabled ? Number(provider.weekly_budget_credits) || 0 : 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Catálogo multi-proveedor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Base experimental sin cron automático. Sirve para configurar proveedor por tienda, presupuestos y cola global
          anónima antes de activar capturas programadas.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Presupuesto semanal activo: {weeklyBudget} créditos</Badge>
          <Badge variant="outline">Tiendas cacheadas: {cachedSources.filter((source) => source.enabled).length}</Badge>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Actualizar
          </Button>
        </div>

        <section className="space-y-3">
          <h3 className="font-semibold">Proveedores</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {providers.map((provider) => (
              <div key={provider.provider_key} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">Secret: {provider.secret_name ?? "sin secret"}</p>
                  </div>
                  <Switch
                    checked={provider.enabled}
                    onCheckedChange={(checked) => updateProviderLocal(provider.provider_key, { enabled: checked })}
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Semanal</Label>
                    <Input
                      type="number"
                      min={0}
                      value={provider.weekly_budget_credits}
                      onChange={(event) =>
                        updateProviderLocal(provider.provider_key, { weekly_budget_credits: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mensual</Label>
                    <Input
                      type="number"
                      min={0}
                      value={provider.monthly_budget_credits}
                      onChange={(event) =>
                        updateProviderLocal(provider.provider_key, { monthly_budget_credits: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Créditos/búsqueda</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={provider.estimated_credits_per_query}
                      onChange={(event) =>
                        updateProviderLocal(provider.provider_key, { estimated_credits_per_query: Number(event.target.value) })
                      }
                    />
                  </div>
                </div>
                {provider.notes && <p className="mt-2 text-xs text-muted-foreground">{provider.notes}</p>}
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => persistProvider(provider)}
                  disabled={savingKey === `provider:${provider.provider_key}`}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Tiendas y prioridad</h3>
          <div className="grid gap-3">
            {sources.map((source) => (
              <div key={source.store_key} className="rounded-lg border p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_160px_180px_120px_120px_auto] lg:items-end">
                  <div>
                    <p className="font-medium">{source.store_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {MODE_LABELS[source.mode]} · {source.cache.count} productos · {formatDate(source.cache.last_captured_at)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Modo</Label>
                    <Select value={source.mode} onValueChange={(value) => updateSourceLocal(source.store_key, { mode: value as any })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live">En vivo</SelectItem>
                        <SelectItem value="cached">Caché</SelectItem>
                        <SelectItem value="external">Enlace externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Proveedor</Label>
                    <Select
                      value={source.preferred_provider_key ?? "none"}
                      onValueChange={(value) =>
                        updateSourceLocal(source.store_key, {
                          preferred_provider_key: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin proveedor</SelectItem>
                        {providers.map((provider) => (
                          <SelectItem key={provider.provider_key} value={provider.provider_key}>
                            {PROVIDER_LABELS[provider.provider_key] ?? provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Términos/sem.</Label>
                    <Input
                      type="number"
                      min={0}
                      value={source.weekly_term_limit}
                      onChange={(event) => updateSourceLocal(source.store_key, { weekly_term_limit: Number(event.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Prioridad</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={source.priority_weight}
                      onChange={(event) => updateSourceLocal(source.store_key, { priority_weight: Number(event.target.value) })}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={source.enabled}
                      onCheckedChange={(checked) => updateSourceLocal(source.store_key, { enabled: checked })}
                    />
                    <Button
                      size="sm"
                      onClick={() => persistSource(source)}
                      disabled={savingKey === `source:${source.store_key}`}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
                {source.notes && <p className="mt-2 text-xs text-muted-foreground">{source.notes}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Prueba manual ahora</h3>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Ejecuta el término contra todas las tiendas activas: Mercadona, Día y Consum en vivo; las cacheadas con su
            proveedor configurado, aunque ese proveedor esté desactivado para capturas automáticas. No guarda productos
            ni activa cron.
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="leche, cola, pañales..." />
            <Button onClick={executeManualProbe} disabled={manualLoading}>
              {manualLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar con configuración
            </Button>
          </div>
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[220px_1fr_auto] md:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Tienda para matriz</Label>
              <Select value={matrixStore} onValueChange={setMatrixStore}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((source) => (
                    <SelectItem key={source.store_key} value={source.store_key}>
                      {source.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Prueba una tienda concreta con todos los proveedores configurados. Útil para Carrefour y otras tiendas
              bloqueadas. No cambia el proveedor preferido ni guarda caché.
            </p>
            <Button variant="outline" onClick={executeMatrixProbe} disabled={manualLoading}>
              {manualLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Probar tienda con todos
            </Button>
          </div>
          {manualCheckedAt && (
            <p className="text-xs text-muted-foreground">
              Última prueba: {new Date(manualCheckedAt).toLocaleString("es-ES")}
            </p>
          )}
          {manualProbes.length > 0 && (
            <div className="grid gap-3">
              {manualProbes.map((probe) => {
                const meta = PROBE_STATUS_META[probe.status];
                return (
                  <div key={`${probe.store_key}-${probe.provider_key}`} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-medium">
                          {statusIcon(probe.status)}
                          {probe.store_name}
                          <span className="text-sm font-normal text-muted-foreground">· {probe.provider_name}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {MODE_LABELS[probe.mode]} · HTTP {probe.http_status ?? "-"} ·{" "}
                          {Math.round(probe.elapsed_ms / 100) / 10}s
                          {probe.credits_used != null ? ` · ${probe.credits_used} créditos` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{probe.notes}</p>
                    {probe.products.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {probe.products.map((product, index) => (
                          <li key={`${probe.store_key}-${product.name}-${index}`} className="flex items-center gap-3 rounded-md border p-2">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="h-10 w-10 rounded object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{product.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[product.brand, product.price_per_unit].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </div>
                            <div className="text-right text-sm font-medium">
                              {product.price != null ? `${product.price.toFixed(2)} €` : "—"}
                            </div>
                            {product.url && (
                              <a href={product.url} target="_blank" rel="noreferrer" className="text-primary">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {probe.url && (
                      <a
                        href={probe.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{probe.url}</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Cola manual futura</h3>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Esto solo apunta términos para una captura semanal futura. No ejecuta búsqueda real todavía.
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="leche, aceite, pañales..." />
            <Select value={queueStore} onValueChange={setQueueStore}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sources.map((source) => (
                  <SelectItem key={source.store_key} value={source.store_key}>
                    {source.store_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={enqueue} disabled={savingKey === "queue"}>
              <Search className="mr-2 h-4 w-4" />
              Añadir
            </Button>
          </div>
          <div className="grid gap-2">
            {queue.slice(0, 12).map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span>
                  <span className="font-medium">{row.term?.term ?? "término"}</span>
                  <span className="text-muted-foreground"> · {row.store_key} · {row.provider_key ?? "sin proveedor"}</span>
                </span>
                <Badge variant="outline">{row.status}</Badge>
              </div>
            ))}
            {queue.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Todavía no hay términos en cola.
              </div>
            )}
          </div>
        </section>

        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Database className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Este panel no lanza cron ni capturas automáticas. La siguiente fase será añadir ejecución manual por proveedor
            y tienda, midiendo coste real antes de programar nada semanal.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
