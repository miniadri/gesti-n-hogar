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
  | "caprabo"
  | "lidl";

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
  content_type?: string | null;
  response_bytes?: number | null;
  page_title?: string | null;
  response_sample?: string | null;
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
  lidl: (query) => `https://www.lidl.es/search?query=${encodeURIComponent(query)}`,
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
  if (fallback === "direct") return "API/Web directa";
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

function asAbsoluteUrl(baseUrl: string, value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function findPageTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeWhitespace(match[1].replace(/&amp;/g, "&")) : null;
}

function plainTextSample(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const clean = normalizeWhitespace(text);
  return clean ? clean.slice(0, 500) : null;
}

function productFromUnknownNode(node: any, baseUrl: string): StoreCatalogManualProduct | null {
  if (!node || typeof node !== "object") return null;
  const name =
    node.name ??
    node.title ??
    node.display_name ??
    node.displayName ??
    node.productName ??
    node.product?.name ??
    node.productData?.name ??
    node.productData?.description ??
    node._source?.name ??
    node._source?.title;
  if (typeof name !== "string" || !name.trim()) return null;

  const price =
    node.price ??
    node.currentPrice ??
    node.current_price ??
    node.salePrice ??
    node.priceValue ??
    node.price_data?.price ??
    node.priceData?.price ??
    node.priceData?.value?.centAmount ??
    node.offers?.price ??
    node.product?.price;
  const priceNumber = typeof price === "number" && price > 1000 ? price / 100 : price;
  const image =
    node.image ??
    node.imageUrl ??
    node.thumbnail ??
    node.thumbnailUrl ??
    node.productImage ??
    node.images?.[0]?.url ??
    node.productData?.images?.[0]?.url ??
    node.offers?.image;
  const url = node.url ?? node.productUrl ?? node.link ?? node.href ?? node.product?.url;

  return {
    name: normalizeWhitespace(name),
    brand:
      typeof node.brand?.name === "string"
        ? node.brand.name
        : typeof node.brand === "string"
          ? node.brand
          : typeof node.brandName === "string"
            ? node.brandName
            : null,
    price: Number.isFinite(Number(priceNumber)) ? Number(priceNumber) : null,
    price_per_unit:
      typeof node.pricePerUnit === "string"
        ? node.pricePerUnit
        : typeof node.unitPrice === "string"
          ? node.unitPrice
          : null,
    image_url: asAbsoluteUrl(baseUrl, image),
    url: asAbsoluteUrl(baseUrl, url),
  };
}

function collectProductLikeNodes(value: any, baseUrl: string, out: StoreCatalogManualProduct[], visited = new Set<any>()) {
  if (out.length >= 12 || value == null) return;
  if (typeof value !== "object") return;
  if (visited.has(value)) return;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectProductLikeNodes(item, baseUrl, out, visited);
    return;
  }

  const maybe = productFromUnknownNode(value, baseUrl);
  if (maybe) out.push(maybe);

  for (const key of Object.keys(value)) {
    if (out.length >= 12) break;
    const child = value[key];
    if (child && typeof child === "object") collectProductLikeNodes(child, baseUrl, out, visited);
  }
}

function readJsonScriptProducts(html: string, baseUrl: string): StoreCatalogManualProduct[] {
  const products: StoreCatalogManualProduct[] = [];
  const scripts = html.match(/<script[^>]*(?:id=["']__NEXT_DATA__["'][^>]*)?[^>]*type=["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      collectProductLikeNodes(JSON.parse(raw), baseUrl, products);
    } catch {
      // Ignore non-JSON script contents.
    }
  }
  return products;
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
            const url = asAbsoluteUrl(baseUrl, item?.url);
            products.push({
              name,
              brand: typeof item?.brand?.name === "string" ? item.brand.name : typeof item?.brand === "string" ? item.brand : null,
              price: Number.isFinite(Number(offer?.price)) ? Number(offer.price) : null,
              price_per_unit: null,
              image_url: asAbsoluteUrl(baseUrl, image),
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

function readHtmlProducts(html: string, targetUrl: string) {
  return dedupeProducts([...readLdJsonProducts(html, targetUrl), ...readJsonScriptProducts(html, targetUrl)]).slice(0, 5);
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

async function probeDirectWebSource(source: SourceRow, query: string): Promise<StoreCatalogManualProbe> {
  const started = Date.now();
  const targetUrl = configuredUrl(source, query);
  if (!targetUrl) {
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: "direct",
      provider_name: "Web directa",
      mode: source.mode,
      query,
      url: null,
      status: "config_needed",
      http_status: null,
      elapsed_ms: elapsed(started),
      credits_used: 0,
      notes: "No hay URL de búsqueda configurada para esta tienda.",
      products: [],
    };
  }

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    const products = response.ok ? readHtmlProducts(text, targetUrl) : [];
    const pageTitle = /html/i.test(contentType ?? "") ? findPageTitle(text) : null;
    const sample = /html/i.test(contentType ?? "") ? plainTextSample(text) : text.slice(0, 500);
    const blocked = response.status === 401 || response.status === 403 || response.status === 429;

    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: "direct",
      provider_name: "Web directa",
      mode: source.mode,
      query,
      url: targetUrl,
      status: response.ok ? (products.length > 0 ? "ok" : "empty") : blocked ? "blocked" : "error",
      http_status: response.status,
      elapsed_ms: elapsed(started),
      credits_used: 0,
      content_type: contentType,
      response_bytes: text.length,
      page_title: pageTitle,
      response_sample: sample,
      notes: response.ok
        ? products.length > 0
          ? "La web pública respondió y se detectaron productos estructurados."
          : "La web pública respondió, pero no se detectaron productos estructurados automáticamente."
        : `La web pública devolvió HTTP ${response.status}.`,
      products,
    };
  } catch (error: any) {
    return {
      store_key: source.store_key,
      store_name: source.store_name,
      provider_key: "direct",
      provider_name: "Web directa",
      mode: source.mode,
      query,
      url: targetUrl,
      status: "error",
      http_status: null,
      elapsed_ms: elapsed(started),
      credits_used: 0,
      notes: error?.message ?? "Error consultando la web pública.",
      products: [],
    };
  }
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

    const contentType = response.headers.get("content-type");
    const text = await response.text();
    const products = response.ok ? readHtmlProducts(text, targetUrl) : [];
    const pageTitle = /html/i.test(contentType ?? "") ? findPageTitle(text) : null;
    const sample = /html/i.test(contentType ?? "") ? plainTextSample(text) : text.slice(0, 500);
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
      content_type: contentType,
      response_bytes: text.length,
      page_title: pageTitle,
      response_sample: sample,
      notes: response.ok
        ? products.length > 0
          ? "El proveedor devolvió página accesible y se detectaron productos estructurados."
          : "El proveedor devolvió página accesible, pero no se detectaron productos estructurados automáticamente. Revisa título y muestra para saber si cargó buscador, bloqueo o página vacía."
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
  } else {
    probes.push(await probeDirectWebSource(source, query));
  }

  for (const provider of providers) {
    probes.push(await probeSourceWithProvider(source, provider, query));
  }

  return probes;
}
