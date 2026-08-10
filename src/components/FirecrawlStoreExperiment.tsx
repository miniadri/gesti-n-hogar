import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Coins, ExternalLink, Flame, Loader2, ShieldAlert, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { probeFirecrawlStoreCatalogs } from "@/lib/firecrawl-stores.functions";

type StoreId = "carrefour" | "eroski" | "el_corte_ingles" | "alcampo" | "mas" | "caprabo";

const STORES: Array<{ id: StoreId; label: string }> = [
  { id: "carrefour", label: "Carrefour" },
  { id: "eroski", label: "Eroski" },
  { id: "el_corte_ingles", label: "El Corte Inglés / Hipercor" },
  { id: "alcampo", label: "Alcampo" },
  { id: "mas", label: "MAS" },
  { id: "caprabo", label: "Caprabo" },
];

// Stealth scrape with structured extraction costs about 9 Firecrawl credits per page.
const CREDITS_PER_PAGE = 9;
const MAX_TERMS = 3;

type Product = {
  name: string;
  brand: string | null;
  price: number | null;
  price_per_unit: string | null;
  image_url: string | null;
  url: string | null;
};

type Probe = {
  store: string;
  label: string;
  query: string;
  url: string;
  status: "ok" | "empty" | "blocked" | "error";
  http_status: number | null;
  credits_used: number;
  elapsed_ms: number;
  notes: string;
  products: Product[];
};

const STATUS_META: Record<Probe["status"], { label: string; className: string }> = {
  ok: { label: "OK", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  blocked: { label: "Bloqueado", className: "border-amber-200 bg-amber-50 text-amber-700" },
  empty: { label: "Sin resultados", className: "border-slate-200 bg-slate-50 text-slate-700" },
  error: { label: "Error", className: "border-red-200 bg-red-50 text-red-700" },
};

function statusIcon(status: Probe["status"]) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "blocked") return <ShieldAlert className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-muted-foreground" />;
}

function parseTerms(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ).slice(0, MAX_TERMS);
}

export function FirecrawlStoreExperiment() {
  const runProbe = useServerFn(probeFirecrawlStoreCatalogs);
  const [rawTerms, setRawTerms] = useState("leche");
  const [selected, setSelected] = useState<StoreId[]>(["carrefour", "eroski"]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const terms = parseTerms(rawTerms);
  const pages = terms.length * selected.length;
  const estimatedCredits = pages * CREDITS_PER_PAGE;

  const toggleStore = (id: StoreId, checked: boolean) => {
    setSelected((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((item) => item !== id)));
  };

  const run = async () => {
    if (terms.length === 0) {
      setError("Escribe al menos un término de 2 caracteres.");
      return;
    }
    if (selected.length === 0) {
      setError("Selecciona al menos una tienda.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: any = await runProbe({ data: { queries: terms, stores: selected } });
      setProbes(data?.probes ?? []);
      setCreditsUsed(data?.credits_used ?? null);
      setCreditsRemaining(data?.credits_remaining ?? null);
      setCheckedAt(data?.checked_at ?? new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? "No se pudo ejecutar la prueba.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Firecrawl · tiendas bloqueadas (prueba aislada)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Ejecución manual y de bajo volumen. Los resultados <strong>no se guardan</strong> en la base de datos y no se
            usan en Lista de compra ni en Inventario hasta validar legalidad y estabilidad.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="firecrawl-terms">Términos (máximo {MAX_TERMS}, separados por comas)</Label>
          <Input
            id="firecrawl-terms"
            value={rawTerms}
            onChange={(event) => setRawTerms(event.target.value)}
            placeholder="leche, pañales"
          />
        </div>

        <div className="space-y-2">
          <Label>Tiendas</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {STORES.map((store) => (
              <label key={store.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox
                  checked={selected.includes(store.id)}
                  onCheckedChange={(checked) => toggleStore(store.id, checked === true)}
                />
                {store.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <span>
            {pages} página(s) · coste estimado <strong>{estimatedCredits}</strong> créditos Firecrawl
          </span>
          {creditsUsed != null && (
            <Badge variant="outline">Último gasto real: {creditsUsed} créditos</Badge>
          )}
          {creditsRemaining != null && <Badge variant="outline">Saldo restante: {creditsRemaining}</Badge>}
        </div>

        <Button onClick={run} disabled={loading || pages === 0}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flame className="mr-2 h-4 w-4" />}
          Ejecutar prueba ({estimatedCredits} créditos aprox.)
        </Button>

        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {checkedAt && (
          <p className="text-xs text-muted-foreground">
            Última ejecución: {new Date(checkedAt).toLocaleString("es-ES")}
          </p>
        )}

        <div className="grid gap-3">
          {probes.map((probe) => {
            const meta = STATUS_META[probe.status];
            return (
              <div key={`${probe.store}-${probe.query}`} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {statusIcon(probe.status)}
                      {probe.label}
                      <span className="text-sm font-normal text-muted-foreground">· “{probe.query}”</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      HTTP {probe.http_status ?? "-"} · {Math.round(probe.elapsed_ms / 100) / 10}s · {probe.credits_used}{" "}
                      créditos
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
                      <li key={`${product.name}-${index}`} className="flex items-center gap-3 rounded-md border p-2">
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

                <a
                  href={probe.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{probe.url}</span>
                </a>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
