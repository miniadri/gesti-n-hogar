import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Loader2, Search, ShieldAlert, Store, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { testStoreCatalogSources } from "@/lib/store-products.functions";

type ProbeStatus = "ok" | "blocked" | "empty" | "error";

type ProbeResult = {
  source: string;
  label: string;
  status: ProbeStatus;
  http_status: number | null;
  content_type: string | null;
  endpoint: string | null;
  product_count: number | null;
  sample_names: string[];
  notes: string;
  elapsed_ms: number;
};

const STATUS_META: Record<ProbeStatus, { label: string; className: string }> = {
  ok: { label: "OK", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  blocked: { label: "Bloqueado", className: "border-amber-200 bg-amber-50 text-amber-700" },
  empty: { label: "Sin resultados", className: "border-slate-200 bg-slate-50 text-slate-700" },
  error: { label: "No válido", className: "border-red-200 bg-red-50 text-red-700" },
};

function statusIcon(status: ProbeStatus) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "blocked") return <ShieldAlert className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-muted-foreground" />;
}

export function StoreCatalogSourceExperiment() {
  const runProbe = useServerFn(testStoreCatalogSources);
  const [query, setQuery] = useState("leche");
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testSources = async () => {
    const clean = query.trim();
    if (clean.length < 2) {
      setError("Escribe al menos 2 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: any = await runProbe({ data: { query: clean } });
      setResults(data?.results ?? []);
      setCheckedAt(data?.checked_at ?? new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? "No se pudieron probar las fuentes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" />
          Fuentes de supermercados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void testSources();
            }}
            placeholder="Producto para probar, por ejemplo leche, cola o pañales"
          />
          <Button onClick={testSources} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Probar fuentes
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Prueba desde el servidor de Lovable qué supermercados devuelven catálogo JSON real. Las fuentes bloqueadas o solo HTML no se deberían activar en Compra.
        </p>

        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {checkedAt && <p className="text-xs text-muted-foreground">Última comprobación: {new Date(checkedAt).toLocaleString("es-ES")}</p>}

        <div className="grid gap-3 md:grid-cols-2">
          {results.map((result) => {
            const meta = STATUS_META[result.status];
            return (
              <div key={result.source} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {statusIcon(result.status)}
                      {result.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      HTTP {result.http_status ?? "-"} · {result.elapsed_ms} ms
                    </p>
                  </div>
                  <Badge variant="outline" className={meta.className}>
                    {meta.label}
                  </Badge>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">{result.notes}</p>

                {result.product_count != null && (
                  <p className="mt-2 text-sm">
                    Productos detectados: <span className="font-medium">{result.product_count}</span>
                  </p>
                )}

                {result.sample_names.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Muestras</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {result.sample_names.map((name) => (
                        <li key={name} className="truncate">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.endpoint && (
                  <a
                    href={result.endpoint.startsWith("http") ? result.endpoint : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{result.endpoint}</span>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
