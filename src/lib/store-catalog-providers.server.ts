import { FIRECRAWL_STORE_TARGETS, probeFirecrawlStores, type FirecrawlStoreId } from "./firecrawl-stores.server";
import { searchStoreProducts, type StoreProductSource, type StoreProductSuggestion } from "./store-products.server";

export type StoreCatalogManualProvider =
  | "direct"
  | "firecrawl"
  | "apify"
  | "scrapingbee"
  | "scraperapi"
  | "scrapedo"
  | "brightdata";

export type StoreCatalogManualStore =
  | "mercadona"
  | "dia"
  | "consum"
  | "carrefour"
  | "eroski"
  | "el_corte_ingles"
  | "alcampo"
  | "mas"
  | "caprabo";

export type StoreCatalogManualProduct = {
  name: string;
  brand: string | null;
  price: number | null;
  price_per_unit: string | null;
  image_url: string | null;
  url: string | null;
};

export type StoreCatalogManualProbe = {
  store_key: StoreCatalogManualStore;
  store_name: string;
  provider_key: StoreCatalogManualProvider;
  provider_name: string;
  mode: "live" | "cached" | "external";
  query: string;
  url: string | null;
  status: "ok" | "empty" | "blocked" | "error" | "config_needed" | "skipped";
  http_status: number | null;
  elapsed_ms: number;
  credits_used: number | null;
  notes: string;
  products: StoreCatalogManualProduct[];
};

type SourceRow = {
  store_key: StoreCatalogManualStore;
  store_name: string;
  mode: "live" | "cached" | "external";
  enabled: boolean;
  preferred_provider_key: StoreCatalogManualProvider | null;
  external_search_url_template: string | null;
};

type ProviderRow = {
  provider_key: StoreCatalogManualProvider;
  name: string;
  enabled: boolean;
  secret_name: string | null;
};

const LIVE_SOURCES = new Set<StoreCatalogManualStore>(["mercadona", "dia", "consum"]);

const STORE_URLS: Record<StoreCatalogManualStore, (query: string) => string> = {
  mercadona: (query) => `https://tienda.mercadona.es/search-results?query=${encodeURIComponent(query)}`,
  dia: (query) => `https://www.dia.es/search?q=${encodeURIComponent(query)}`,
  consum: (query) => `https://tienda.consum.es/es/search?q=${encodeURIComponent(query)}`,
  carrefour: (query) => `https://www.carrefour.es/?query=${encodeURIComponent(query)}`,
  eroski: (query) => `https://supermercado.eroski.es/es/search/results/?q=${encodeURIComponent(query)}`,
  el_corte_ingles: (query) => `https://www.elcorteingles.es/supermercado/buscar/?term=${encodeURIComponent(query)}`,
  alcampo: (query) => `https://www.compraonline.alcampo.es/search?q=${encodeURIComponent(query)}`,
  mas: (query) => `https://www.supermercadosmas.com/catalogsearch/result/?q=${encodeURIComponent(query)}`,
  caprabo: (query) => `https://www.capraboacasa.com/es/search?text=${encodeURIComponent(query)}`,
};

function env(name: string | null | undefined) {
  if (!name) return "";
  return process.env[name] ?? "";
}

function elapsed(started: number) {
  return Date.now() - started;
}

function productFromSuggestion(product: StoreProductSuggestion): StoreCatalogManualProduct {
  return {
    name: product.display_name,
    brand: product.brand,
    price: product.unit_price,
    price_per_unit:
      product.reference_price != null
        ? [product.reference_price.toFixed(2), product.reference_format].filter(Boolean).join(" / ")
        : null,
    image_url: product.thumbnail,
    url: product.share_url,
  };
}

function providerLabel(provider: ProviderRow | null, fallback: StoreCatalogManualProvider) {
  if (fallback === "direct") return "API directa";
  return provider?.name ?? fallback;
}

function configuredUrl(source: SourceRow, query: string) {
  const template = source.external_search_url_template;
  if (template?.includes("{{query}}")) return template.replace("{{query}}", encodeURIComponent(query));
  return STORE_URLS[source.store_key]?.(query) ?? null;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function readLdJsonProducts(html: string, baseUrl: string): StoreCatalogManualProduct[] {
  const products: StoreCatalogManualProduct[] = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) {
        const graph = Array.isArray(value?.["@graph"]) ? value["@graph"] : [value];
        for (const node of graph) {
          const list = Array.isArray(node?.itemListElement)
            ? node.itemListElement.map((item: any) => item?.item ?? item)
            : [node];
          for (const item of list) {
            const type = Array.isArray(item?.["@type"]) ? item["@type"].join(" ") : String(item?.["@type"] ?? "");
            if (!/Product/i.test(type) && !item?.offers) continue;
            const name = typeof item?.name === "string" ? normalizeWhitespace(item.name) : "";
            if (!name) continue;
            const offer = Array.isArray(item?.offers) ? item.offers[0] : item?.offers;
            const image = Array.isArray(item?.image) ? item.image[0] : item?.image;
            const url = typeof item?.url === "string" ? new URL(item.url, baseUrl).toString() : null;
            products.push({
              name,
              brand: typeof item?.brand?.name === "string" ? item.brand.name : typeof item?.brand === "string" ? item.brand : null,
              price: Number.isFinite(Number(offer?.price)) ? Number(offer.price) : null,
              price_per_unit: null,
              image_url: typeof image === "string" ? new URL(image, baseUrl).toString() : null,
              url,
            });
          }
        }
      }
    } catch {
      // Ignore invalid embedded JSON-LD blocks.
    }
  }
  return dedupeProducts(products).slice(0, 5);
}

function dedupeProducts(products: StoreCatalogManualProduct[]) {
  const seen = new Set<string>();
  const out: StoreCatalogManualProduct[] = [];
  for (const product of products) {
    const key = `${product.name}|${product.url ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(product);
  }
  return out;
}

async function readHtmlProducts(response: Response, targetUrl: string) {
  const text = await response.text();
  return readLdJsonProducts(text, targetUrl);
}

async function fetchViaScrapingBee(targetUrl: string, apiKey: string) {
  const url = new URL("https://app.scrapingbee.com/api/v1/");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("country_code", "es");
  url.searchParams.set("render_js", "false");
  return fetch(url);
}

async function fetchViaScraperApi(targetUrl: string, apiKey: string) {
  const url = new URL("https://api.scraperapi.com/");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("country_code", "es");
  return fetch(url);
}

async function fetchViaScrapeDo(targetUrl: string, token: string) {
  const url = new URL("https://api.scrape.do/");
  url.searchParams.set("token", token);
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("geoCode", "es");
  return fetch(url);
}

async function probeHtmlProvider(
  source: SourceRow,
  provider: ProviderRow,
  query: string,
): Promise<StoreCatalogManualProbe> {
  const started = Date.now();
  const targetUrl = configuredUrl(source, query);
  if (!targetUrl) {
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: provider.provider_key,
      provider_name: provider.name,
      mode: source.mode,
      query,
      url: null,
      status: "config_needed",
      http_status: null,
      elapsed_ms: elapsed(started),
      credits_used: null,
      notes: "No hay URL de búsqueda configurada para esta tienda.",
      products: [],
    };
  }
  const key = env(provider.secret_name);
  if (!key) {
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: provider.provider_key,
      provider_name: provider.name,
      mode: source.mode,
      query,
      url: targetUrl,
      status: "config_needed",
      http_status: null,
      elapsed_ms: elapsed(started),
      credits_used: null,
      notes: `Falta configurar el secret ${provider.secret_name}.`,
      products: [],
    };
  }

  try {
    let response: Response;
    if (provider.provider_key === "scrapingbee") response = await fetchViaScrapingBee(targetUrl, key);
    else if (provider.provider_key === "scraperapi") response = await fetchViaScraperApi(targetUrl, key);
    else if (provider.provider_key === "scrapedo") response = await fetchViaScrapeDo(targetUrl, key);
    else {
      return {
        store_key: source.store_key,
        store_name: source.store_name,
        provider_key: provider.provider_key,
        provider_name: provider.name,
        mode: source.mode,
        query,
        url: targetUrl,
        status: "config_needed",
        http_status: null,
        elapsed_ms: elapsed(started),
        credits_used: null,
        notes:
          provider.provider_key === "apify"
            ? "Apify necesita elegir un actor concreto antes de poder ejecutar esta prueba."
            : "Este proveedor necesita configuración adicional antes de poder ejecutar esta prueba.",
        products: [],
      };
    }

    const products = response.ok ? await readHtmlProducts(response, targetUrl) : [];
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: provider.provider_key,
      provider_name: provider.name,
      mode: source.mode,
      query,
      url: targetUrl,
      status: response.ok ? (products.length > 0 ? "ok" : "empty") : response.status === 401 || response.status === 403 || response.status === 429 ? "blocked" : "error",
      http_status: response.status,
      elapsed_ms: elapsed(started),
      credits_used: null,
      notes: response.ok
        ? products.length > 0
          ? "El proveedor devolvió página accesible y se detectaron productos estructurados."
          : "El proveedor devolvió página accesible, pero no se detectaron productos estructurados automáticamente."
        : `El proveedor devolvió HTTP ${response.status}.`,
      products,
    };
  } catch (error: any) {
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: provider.provider_key,
      provider_name: provider.name,
      mode: source.mode,
      query,
      url: targetUrl,
      status: "error",
      http_status: null,
      elapsed_ms: elapsed(started),
      credits_used: null,
      notes: error?.message ?? "Error ejecutando el proveedor.",
      products: [],
    };
  }
}

async function probeFirecrawlSource(source: SourceRow, provider: ProviderRow, query: string) {
  const isFirecrawlStore = FIRECRAWL_STORE_TARGETS.some((target) => target.id === source.store_key);
  if (!isFirecrawlStore) {
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: "firecrawl" as const,
      provider_name: provider.name,
      mode: source.mode,
      query,
      url: configuredUrl(source, query),
      status: "config_needed" as const,
      http_status: null,
      elapsed_ms: 0,
      credits_used: null,
      notes: "Esta tienda no tiene URL Firecrawl configurada.",
      products: [],
    };
  }
  const result = await probeFirecrawlStores([query], [source.store_key as FirecrawlStoreId], 5);
  const probe = result.probes[0];
  return {
    store_key: source.store_key,
    store_name: source.store_name,
    provider_key: "firecrawl" as const,
    provider_name: provider.name,
    mode: source.mode,
    query,
    url: probe?.url ?? configuredUrl(source, query),
    status: probe?.status ?? "error",
    http_status: probe?.http_status ?? null,
    elapsed_ms: probe?.elapsed_ms ?? 0,
    credits_used: probe?.credits_used ?? null,
    notes: probe?.notes ?? "Firecrawl no devolvió resultado.",
    products: (probe?.products ?? []).map((product) => ({
      name: product.name,
      brand: product.brand,
      price: product.price,
      price_per_unit: product.price_per_unit,
      image_url: product.image_url,
      url: product.url,
    })),
  } satisfies StoreCatalogManualProbe;
}

async function probeLiveSource(source: SourceRow, query: string): Promise<StoreCatalogManualProbe> {
  const started = Date.now();
  const liveSource = source.store_key as StoreProductSource;
  try {
    const products = await searchStoreProducts(query, [liveSource], 5);
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: "direct",
      provider_name: "API directa",
      mode: "live",
      query,
      url: configuredUrl(source, query),
      status: products.length > 0 ? "ok" : "empty",
      http_status: 200,
      elapsed_ms: elapsed(started),
      credits_used: 0,
      notes: products.length > 0 ? "Búsqueda en vivo correcta." : "La fuente respondió sin resultados.",
      products: products.map(productFromSuggestion),
    };
  } catch (error: any) {
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: "direct",
      provider_name: "API directa",
      mode: "live",
      query,
      url: configuredUrl(source, query),
      status: "error",
      http_status: null,
      elapsed_ms: elapsed(started),
      credits_used: 0,
      notes: error?.message ?? "Error en búsqueda en vivo.",
      products: [],
    };
  }
}

async function probeSourceWithProvider(
  source: SourceRow,
  provider: ProviderRow,
  query: string,
): Promise<StoreCatalogManualProbe> {
  if (provider.provider_key === "firecrawl") {
    return probeFirecrawlSource(source, provider, query);
  }
  return probeHtmlProvider(source, provider, query);
}

export async function runConfiguredStoreCatalogProbe(
  query: string,
  sources: SourceRow[],
  providers: ProviderRow[],
): Promise<StoreCatalogManualProbe[]> {
  const providerByKey = new Map(providers.map((provider) => [provider.provider_key, provider]));
  const enabledSources = sources.filter((source) => source.enabled);
  const probes: StoreCatalogManualProbe[] = [];

  for (const source of enabledSources) {
    if (source.mode === "live" && LIVE_SOURCES.has(source.store_key)) {
      probes.push(await probeLiveSource(source, query));
      continue;
    }

    if (source.mode === "external") {
      probes.push({
        store_key: source.store_key,
        store_name: source.store_name,
        provider_key: "direct",
        provider_name: "Enlace externo",
        mode: "external",
        query,
        url: configuredUrl(source, query),
        status: "skipped",
        http_status: null,
        elapsed_ms: 0,
        credits_used: 0,
        notes: "Tienda configurada como enlace externo. No se consulta automáticamente.",
        products: [],
      });
      continue;
    }

    const provider = source.preferred_provider_key ? providerByKey.get(source.preferred_provider_key) : null;
    if (!provider) {
      probes.push({
        store_key: source.store_key,
        store_name: source.store_name,
        provider_key: source.preferred_provider_key ?? "direct",
        provider_name: providerLabel(provider ?? null, source.preferred_provider_key ?? "direct"),
        mode: source.mode,
        query,
        url: configuredUrl(source, query),
        status: "config_needed",
        http_status: null,
        elapsed_ms: 0,
        credits_used: null,
        notes: "La tienda no tiene proveedor asignado.",
        products: [],
      });
      continue;
    }

    probes.push(await probeSourceWithProvider(source, provider, query));
  }

  return probes;
}

export async function runStoreCatalogProviderMatrixProbe(
  query: string,
  sources: SourceRow[],
  providers: ProviderRow[],
  storeKey: StoreCatalogManualStore,
): Promise<StoreCatalogManualProbe[]> {
  const source = sources.find((item) => item.store_key === storeKey);
  if (!source) return [];

  const probes: StoreCatalogManualProbe[] = [];
  if (source.mode === "live" && LIVE_SOURCES.has(source.store_key)) {
    probes.push(await probeLiveSource(source, query));
  }

  for (const provider of providers) {
    probes.push(await probeSourceWithProvider(source, provider, query));
  }

  return probes;
}
