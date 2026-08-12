// Experimental Firecrawl probe for supermarkets whose catalogues block direct
// server requests (Cloudflare / Akamai). Nothing here is persisted: results are
// returned to the Experimental settings screen only, so we can validate
// legality and stability before wiring anything into Compra / Inventario.

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

export type FirecrawlStoreId =
  | "carrefour"
  | "eroski"
  | "el_corte_ingles"
  | "alcampo"
  | "mas"
  | "caprabo"
  | "lidl";

type StoreTarget = {
  id: FirecrawlStoreId;
  label: string;
  buildUrl: (query: string) => string;
};

export const FIRECRAWL_STORE_TARGETS: StoreTarget[] = [
  {
    id: "carrefour",
    label: "Carrefour",
    buildUrl: (q) => `https://www.carrefour.es/supermercado/search/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "eroski",
    label: "Eroski",
    buildUrl: (q) => `https://supermercado.eroski.es/es/search/results/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "el_corte_ingles",
    label: "El Corte Inglés / Hipercor",
    buildUrl: (q) => `https://www.elcorteingles.es/supermercado/buscar/?term=${encodeURIComponent(q)}`,
  },
  {
    id: "alcampo",
    label: "Alcampo",
    buildUrl: (q) => `https://www.compraonline.alcampo.es/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "mas",
    label: "MAS",
    buildUrl: (q) => `https://www.supermercadosmas.com/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "caprabo",
    label: "Caprabo",
    buildUrl: (q) => `https://www.capraboacasa.com/es/search?text=${encodeURIComponent(q)}`,
  },
  {
    id: "lidl",
    label: "Lidl",
    buildUrl: (q) => `https://www.lidl.es/search?query=${encodeURIComponent(q)}`,
  },
];

export const FIRECRAWL_STORE_LABELS: Record<FirecrawlStoreId, string> = Object.fromEntries(
  FIRECRAWL_STORE_TARGETS.map((target) => [target.id, target.label]),
) as Record<FirecrawlStoreId, string>;

export type FirecrawlProduct = {
  name: string;
  brand: string | null;
  price: number | null;
  price_per_unit: string | null;
  image_url: string | null;
  url: string | null;
};

export type FirecrawlStoreProbe = {
  store: FirecrawlStoreId;
  label: string;
  query: string;
  url: string;
  status: "ok" | "empty" | "blocked" | "error";
  http_status: number | null;
  credits_used: number;
  elapsed_ms: number;
  notes: string;
  products: FirecrawlProduct[];
};

const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          brand: { type: "string" },
          price: { type: "number" },
          price_per_unit: { type: "string" },
          image_url: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
} as const;

function apiKey() {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) throw new Error("FIRECRAWL_API_KEY no está configurada.");
  return key;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

export async function getFirecrawlCredits(): Promise<{ remaining: number | null; plan: number | null }> {
  const response = await fetch(`${FIRECRAWL_V2}/team/credit-usage`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!response.ok) return { remaining: null, plan: null };
  const json: any = await response.json();
  return {
    remaining: num(json?.data?.remainingCredits),
    plan: num(json?.data?.planCredits),
  };
}

async function scrapeStore(target: StoreTarget, query: string, maxProducts: number): Promise<FirecrawlStoreProbe> {
  const started = Date.now();
  const url = target.buildUrl(query);
  const base = {
    store: target.id,
    label: target.label,
    query,
    url,
  };

  try {
    const response = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        proxy: "stealth",
        waitFor: 6000,
        onlyMainContent: true,
        location: { country: "ES", languages: ["es"] },
        formats: [
          {
            type: "json",
            prompt: `Extract up to ${maxProducts} grocery products shown in the search results for "${query}" with name, brand, price in EUR, price per unit, image url and product url. Return an empty list if the page shows no products.`,
            schema: PRODUCT_SCHEMA,
          },
        ],
      }),
    });

    const json: any = await response.json().catch(() => null);
    const metadata = json?.data?.metadata ?? {};
    const creditsUsed = num(metadata.creditsUsed) ?? 0;
    const httpStatus = num(metadata.statusCode);

    if (!response.ok || json?.success === false) {
      return {
        ...base,
        status: "error",
        http_status: httpStatus,
        credits_used: creditsUsed,
        elapsed_ms: Date.now() - started,
        notes: json?.error ?? `Firecrawl respondió ${response.status}.`,
        products: [],
      };
    }

    const rawProducts: any[] = Array.isArray(json?.data?.json?.products) ? json.data.json.products : [];
    const products: FirecrawlProduct[] = rawProducts
      .map((item) => ({
        name: str(item?.name) ?? "",
        brand: str(item?.brand),
        price: num(item?.price),
        price_per_unit: str(item?.price_per_unit),
        image_url: str(item?.image_url),
        url: str(item?.url),
      }))
      .filter((item) => item.name.length > 0)
      .slice(0, maxProducts);

    const blocked = httpStatus != null && (httpStatus === 403 || httpStatus === 429 || httpStatus >= 500);

    return {
      ...base,
      status: products.length > 0 ? "ok" : blocked ? "blocked" : "empty",
      http_status: httpStatus,
      credits_used: creditsUsed,
      elapsed_ms: Date.now() - started,
      notes:
        products.length > 0
          ? "Extracción correcta. Datos solo en pantalla, no se guarda nada."
          : blocked
            ? `La tienda respondió ${httpStatus} (anti-bot). No es viable ni con navegador real.`
            : "La página cargó pero no se detectaron productos con este término.",
      products,
    };
  } catch (error: any) {
    return {
      ...base,
      status: "error",
      http_status: null,
      credits_used: 0,
      elapsed_ms: Date.now() - started,
      notes: error?.message ?? "Error desconocido llamando a Firecrawl.",
      products: [],
    };
  }
}

export async function probeFirecrawlStores(
  queries: string[],
  stores: FirecrawlStoreId[],
  maxProducts = 4,
): Promise<{ probes: FirecrawlStoreProbe[]; credits_used: number; credits_remaining: number | null }> {
  const targets = FIRECRAWL_STORE_TARGETS.filter((target) => stores.includes(target.id));
  const probes: FirecrawlStoreProbe[] = [];

  // Sequential on purpose: keeps credit spend predictable and avoids
  // concurrency limits on the Firecrawl plan.
  for (const query of queries) {
    for (const target of targets) {
      probes.push(await scrapeStore(target, query, maxProducts));
    }
  }

  const credits = await getFirecrawlCredits().catch(() => ({ remaining: null, plan: null }));

  return {
    probes,
    credits_used: probes.reduce((sum, probe) => sum + probe.credits_used, 0),
    credits_remaining: credits.remaining,
  };
}
