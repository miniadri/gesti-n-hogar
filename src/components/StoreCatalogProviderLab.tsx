import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
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
  content_type?: string | null;
  response_bytes?: number | null;
  page_title?: string | null;
  response_sample?: string | null;
  products: Array<{
    name: string;
    brand: string | null;
    price: number | null;
    price_per_unit: string | null;
    image_url: string | null;
    url: string | null;
  }>;
};

type ProbeRun = {
  id: string;
  kind: "configured" | "matrix";
  term: string;
  store_key: string | null;
  checked_at: string;
  probes: ManualProbe[];
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

const LAB_HISTORY_KEY = "homesync.storeCatalogProviderLab.history.v1";

function formatDate(value?: string | null) {
  if (!value) return "Sin captura";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function statusIcon(status: ManualProbe["status"]) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "blocked" || status === "config_needed") return <ShieldAlert className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-muted-foreground" />;
}

function buildRunSummary(probes: ManualProbe[]) {
  const total = probes.length;
  const ok = probes.filter((probe) => probe.status === "ok").length;
  const empty = probes.filter((probe) => probe.status === "empty").length;
  const blocked = probes.filter((probe) => probe.status === "blocked").length;
  const config = probes.filter((probe) => probe.status === "config_needed").length;
  const errors = probes.filter((probe) => probe.status === "error").length;
  const products = probes.reduce((sum, probe) => sum + probe.products.length, 0);
  return { total, ok, empty, blocked, config, errors, products };
}

function probeRowsToTsv(runs: ProbeRun[]) {
  const header = [
    "Fecha",
    "Tipo",
    "Tienda",
    "Proveedor",
    "Termino",
    "Estado",
    "HTTP",
    "Tiempo_ms",
    "Productos",
    "Creditos",
    "Content_type",
    "Bytes",
    "Titulo",
    "Notas",
    "Muestra",
    "URL",
    "Muestras",
  ];
  const rows = runs.flatMap((run) =>
    run.probes.map((probe) => [
      new Date(run.checked_at).toLocaleString("es-ES"),
      run.kind === "configured" ? "configuracion" : "matriz",
      probe.store_name,
      probe.provider_name,
      probe.query,
      probe.status,
      probe.http_status ?? "",
      probe.elapsed_ms,
      probe.products.length,
      probe.credits_used ?? "",
      probe.content_type ?? "",
      probe.response_bytes ?? "",
      probe.page_title ?? "",
      probe.notes.replace(/\s+/g, " ").trim(),
      (probe.response_sample ?? "").replace(/\s+/g, " ").trim(),
      probe.url ?? "",
      probe.products
        .slice(0, 3)
        .map((product) => product.name)
        .join(" | "),
    ]),
  );
  return [header, ...rows].map((row) => row.map((cell) => String(cell).replace(/\t/g, " ")).join("\t")).join("\n");
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  const [probeHistory, setProbeHistory] = useState<ProbeRun[]>([]);
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setProbeHistory(parsed.slice(0, 50));
    } catch {
      setProbeHistory([]);
    }
  }, []);

  const rememberRun = (run: ProbeRun) => {
    setProbeHistory((prev) => {
      const next = [run, ...prev].slice(0, 50);
      try {
        localStorage.setItem(LAB_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Local history is only a testing convenience.
      }
      return next;
    });
  };

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
      const probes = data?.probes ?? [];
      const checkedAt = data?.checked_at ?? new Date().toISOString();
      setManualProbes(probes);
      setManualCheckedAt(checkedAt);
      rememberRun({
        id: `${checkedAt}:configured:${clean}`,
        kind: "configured",
        term: clean,
        store_key: null,
        checked_at: checkedAt,
        probes,
      });
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
      const probes = data?.probes ?? [];
      const checkedAt = data?.checked_at ?? new Date().toISOString();
      setManualProbes(probes);
      setManualCheckedAt(checkedAt);
      rememberRun({
        id: `${checkedAt}:matrix:${matrixStore}:${clean}`,
        kind: "matrix",
        term: clean,
        store_key: matrixStore,
        checked_at: checkedAt,
        probes,
      });
      const sourceName = sources.find((source) => source.store_key === matrixStore)?.store_name ?? matrixStore;
      toast.success(`Prueba de ${sourceName} terminada para “${clean}”`);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo ejecutar la prueba por proveedor.");
    } finally {
      setManualLoading(false);
    }
  };

  const weeklyBudget = providers.reduce((sum, provider) => sum + (provider.enabled ? Number(provider.weekly_budget_credits) || 0 : 0), 0);
  const currentSummary = buildRunSummary(manualProbes);
  const historySummary = buildRunSummary(probeHistory.flatMap((run) => run.probes));

  const copyCurrentResults = async () => {
    if (manualProbes.length === 0) return;
    const run: ProbeRun = {
      id: "current",
      kind: "configured",
      term: term.trim(),
      store_key: null,
      checked_at: manualCheckedAt ?? new Date().toISOString(),
      probes: manualProbes,
    };
    await navigator.clipboard.writeText(probeRowsToTsv([run]));
    toast.success("Tabla de la última prueba copiada");
  };

  const exportHistory = () => {
    if (probeHistory.length === 0) return;
    downloadText(`homesync-laboratorio-tiendas-${new Date().toISOString().slice(0, 10)}.tsv`, probeRowsToTsv(probeHistory));
  };

  const clearHistory = () => {
    setProbeHistory([]);
    localStorage.removeItem(LAB_HISTORY_KEY);
    toast.success("Historial local del laboratorio borrado");
  };

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
          <Badge variant="outline">Historial local: {probeHistory.length} pruebas</Badge>
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Última prueba: {new Date(manualCheckedAt).toLocaleString("es-ES")}</span>
              <Badge variant="outline">OK: {currentSummary.ok}</Badge>
              <Badge variant="outline">Sin extracción: {currentSummary.empty}</Badge>
              <Badge variant="outline">Bloqueadas: {currentSummary.blocked}</Badge>
              <Badge variant="outline">Configurar: {currentSummary.config}</Badge>
              <Badge variant="outline">Productos: {currentSummary.products}</Badge>
              <Button variant="outline" size="sm" onClick={copyCurrentResults} disabled={manualProbes.length === 0}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar tabla
              </Button>
            </div>
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
                    {(probe.page_title || probe.content_type || probe.response_bytes || probe.response_sample) && (
                      <div className="mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {probe.page_title && <span>Título: {probe.page_title}</span>}
                          {probe.content_type && <span>Tipo: {probe.content_type}</span>}
                          {probe.response_bytes != null && <span>Tamaño: {probe.response_bytes} bytes</span>}
                        </div>
                        {probe.response_sample && (
                          <p className="mt-1 line-clamp-3 break-words">Muestra: {probe.response_sample}</p>
                        )}
                      </div>
                    )}
                    {probe.status === "empty" && probe.http_status && probe.http_status >= 200 && probe.http_status < 300 && (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                        Acceso correcto, extracción pendiente. Esta combinación puede servir, pero necesita un extractor
                        específico para reconocer productos, precios e imágenes en la respuesta del proveedor.
                      </div>
                    )}
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
          <h3 className="font-semibold">Historial local de pruebas</h3>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Se guarda solo en este navegador para acelerar las pruebas. No sube datos a la base ni activa capturas.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Pruebas: {probeHistory.length}</Badge>
            <Badge variant="outline">OK: {historySummary.ok}</Badge>
            <Badge variant="outline">Sin extracción: {historySummary.empty}</Badge>
            <Badge variant="outline">Bloqueadas: {historySummary.blocked}</Badge>
            <Badge variant="outline">Errores: {historySummary.errors}</Badge>
            <Badge variant="outline">Productos detectados: {historySummary.products}</Badge>
            <Button variant="outline" size="sm" onClick={exportHistory} disabled={probeHistory.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportar TSV
            </Button>
            <Button variant="outline" size="sm" onClick={clearHistory} disabled={probeHistory.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              Borrar historial
            </Button>
          </div>
          <div className="grid gap-2">
            {probeHistory.slice(0, 8).map((run) => {
              const summary = buildRunSummary(run.probes);
              const storeName = run.store_key
                ? sources.find((source) => source.store_key === run.store_key)?.store_name ?? run.store_key
                : "tiendas activas";
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => {
                    setManualProbes(run.probes);
                    setManualCheckedAt(run.checked_at);
                    setTerm(run.term);
                    if (run.store_key) setMatrixStore(run.store_key);
                  }}
                  className="rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {run.term} · {run.kind === "configured" ? "configuración" : `matriz ${storeName}`}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(run.checked_at).toLocaleString("es-ES")}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    OK {summary.ok} · Sin extracción {summary.empty} · Bloqueadas {summary.blocked} · Configurar{" "}
                    {summary.config} · Productos {summary.products}
                  </p>
                </button>
              );
            })}
            {probeHistory.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Ejecuta una prueba manual para empezar a guardar resultados locales.
              </div>
            )}
          </div>
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
