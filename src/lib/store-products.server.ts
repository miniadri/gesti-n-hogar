import { algoliaSearch, type MercadonaProduct } from "./mercadona.server";

export type StoreProductSource = "mercadona" | "dia" | "consum" | "carrefour";

export type StoreCatalogProbeSource =
  | StoreProductSource
  | "alcampo"
  | "consum"
  | "el_corte_ingles"
  | "eroski"
  | "mas"
  | "caprabo"
  | "superalba";

export type StoreCatalogProbeResult = {
  source: StoreCatalogProbeSource;
  label: string;
  status: "ok" | "blocked" | "empty" | "error";
  http_status: number | null;
  content_type: string | null;
  endpoint: string | null;
  product_count: number | null;
  sample_names: string[];
  notes: string;
  elapsed_ms: number;
};

export type StoreProductSuggestion = {
  source: StoreProductSource;
  source_label: string;
  id: string;
  ean: string | null;
  display_name: string;
  brand: string | null;
  thumbnail: string | null;
  share_url: string | null;
  category: string | null;
  unit_price: number | null;
  reference_price: number | null;
  reference_format: string | null;
  packaging: string | null;
};

const SOURCE_LABELS: Record<StoreProductSource, string> = {
  mercadona: "Mercadona",
  dia: "Día",
  consum: "Consum",
  carrefour: "Carrefour",
};

const PROBE_SOURCE_LABELS: Record<StoreCatalogProbeSource, string> = {
  mercadona: "Mercadona",
  dia: "Día",
  carrefour: "Carrefour",
  alcampo: "Alcampo",
  consum: "Consum",
  el_corte_ingles: "El Corte Inglés / Hipercor",
  eroski: "Eroski",
  mas: "MAS",
  caprabo: "Caprabo",
  superalba: "SuperAlba",
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function absUrl(base: string, value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${base}${value}`;
  return `${base}/${value}`;
}

function fromMercadona(product: MercadonaProduct): StoreProductSuggestion {
  return {
    source: "mercadona",
    source_label: SOURCE_LABELS.mercadona,
    id: product.id,
    ean: product.ean,
    display_name: product.display_name,
    brand: product.brand,
    thumbnail: product.thumbnail,
    share_url: product.share_url ?? `https://tienda.mercadona.es/product/${product.id}`,
    category: product.category,
    unit_price: product.unit_price,
    reference_price: product.reference_price ?? product.bulk_price,
    reference_format: product.reference_format,
    packaging: product.packaging,
  };
}

function fromDia(item: any): StoreProductSuggestion {
  const prices = item?.prices ?? {};
  const id = String(item?.sku_id ?? item?.object_id ?? "");
  return {
    source: "dia",
    source_label: SOURCE_LABELS.dia,
    id,
    ean: item?.ean ?? item?.ean_code ?? null,
    display_name: item?.display_name ?? item?.name ?? "",
    brand: item?.brand ?? item?.brand_description ?? null,
    thumbnail: absUrl("https://www.dia.es", item?.image),
    share_url: absUrl("https://www.dia.es", item?.url) ?? (id ? `https://www.dia.es/search?q=${encodeURIComponent(id)}` : null),
    category: item?.l2_category_description ?? item?.l1_category_description ?? null,
    unit_price: num(prices.price),
    reference_price: num(prices.price_per_unit),
    reference_format: prices.measure_unit ?? null,
    packaging: item?.packaging ?? null,
  };
}

function fromConsum(item: any): StoreProductSuggestion {
  const product = item?.productData ?? item ?? {};
  const id = String(product?.id ?? product?.sku ?? product?.code ?? item?.id ?? "");
  const name = product?.name ?? product?.description ?? item?.name ?? "";
  const price = item?.priceData?.prices?.[0]?.value?.centAmount ?? item?.priceData?.value?.centAmount ?? product?.price;
  const priceNumber = typeof price === "number" && price > 100 ? price / 100 : price;
  const image =
    product?.images?.[0]?.url ??
    product?.imageUrl ??
    product?.image ??
    item?.imageUrl ??
    item?.image;
  return {
    source: "consum",
    source_label: SOURCE_LABELS.consum,
    id,
    ean: product?.ean ?? product?.gtin ?? product?.barcode ?? null,
    display_name: name,
    brand: product?.brand ?? product?.brandName ?? null,
    thumbnail: absUrl("https://tienda.consum.es", image),
    share_url: product?.slug
      ? `https://tienda.consum.es/es/p/${product.slug}`
      : `https://tienda.consum.es/es/search?q=${encodeURIComponent(name || id)}`,
    category: product?.categoryName ?? product?.category ?? item?.categoryName ?? null,
    unit_price: num(priceNumber),
    reference_price: num(product?.pricePerUnit ?? product?.unitPrice ?? item?.pricePerUnit),
    reference_format: product?.unit ?? product?.unitMeasure ?? null,
    packaging: product?.packaging ?? product?.format ?? null,
  };
}

function dedupeProducts(products: StoreProductSuggestion[]) {
  const seen = new Set<string>();
  const out: StoreProductSuggestion[] = [];
  for (const product of products) {
    const key = product.ean || `${product.source}:${product.id}` || `${product.source}:${product.display_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(product);
  }
  return out;
}

function compactQuery(query: string) {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildQueryVariants(query: string) {
  const normalized = compactQuery(query);
  const variants = [query];

  // Store catalogues often prioritise one category for broad terms such as
  // "cola". These variants are provider-agnostic so every current and future
  // source can surface nearby products without forcing exact catalogue wording.
  if (/^(cola|fresa|limon|limonada|naranja|chocolate|vainilla|nata|coco|sandia|melon)$/.test(normalized)) {
    variants.push(
      `helado ${query}`,
      `helados ${query}`,
      `polo ${query}`,
      `polos ${query}`,
      `sabor ${query}`,
    );
  }
  if (/^helado(s)?$|^polo(s)?$|^hielo$/.test(normalized)) {
    variants.push(
      `${query} cola`,
      `${query} fresa`,
      `${query} limon`,
      `${query} naranja`,
      `${query} chocolate`,
    );
  }
  if (/^(sin lactosa|lactosa)$/.test(normalized)) {
    variants.push(`leche ${query}`, `yogur ${query}`, `queso ${query}`);
  }
  if (/^(integral|fibra)$/.test(normalized)) {
    variants.push(`pan ${query}`, `galletas ${query}`, `cereales ${query}`);
  }

  return Array.from(new Set(variants));
}

function rankStoreResults(products: StoreProductSuggestion[], query: string) {
  const tokens = compactQuery(query).split(" ").filter(Boolean);
  return products
    .map((product, index) => {
      const haystack = compactQuery(
        [
          product.display_name,
          product.brand,
          product.category,
          product.packaging,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
      const frozenBoost = /helado|polo|hielo|congelado/.test(haystack) ? 1 : 0;
      const exactBoost = tokens.length > 0 && tokens.every((token) => haystack.includes(token)) ? 5 : 0;
      return { product, score: tokenMatches * 10 + exactBoost + frozenBoost - index / 1000 };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
}

function uniqueStrings(values: Array<unknown>, limit = 5) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function readPath(value: any, path: string) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), value);
}

function arrayAtFirstPath(json: any, paths: string[]) {
  for (const path of paths) {
    const value = readPath(json, path);
    if (Array.isArray(value)) return value;
  }
  return null;
}

function genericJsonSamples(json: any) {
  const items =
    arrayAtFirstPath(json, ["results", "items", "products", "search_items", "data.products", "data.items", "hits", "hits.hits"]) ?? [];
  const names = items.flatMap((item: any) => [
    item?.display_name,
    item?.name,
    item?.title,
    item?.productName,
    item?.productData?.name,
    item?._source?.name,
    item?._source?.title,
  ]);
  return {
    count: num(json?.total) ?? num(json?.totalCount) ?? num(json?.count) ?? num(json?.nbHits) ?? items.length,
    sampleNames: uniqueStrings(names),
  };
}

function consumSamples(json: any) {
  const products = Array.isArray(json?.products) ? json.products : [];
  return {
    count: num(json?.totalCount) ?? products.length,
    sampleNames: uniqueStrings(products.map((item: any) => item?.productData?.name ?? item?.productData?.description)),
  };
}

function diaSamples(json: any) {
  const products = Array.isArray(json?.search_items) ? json.search_items : [];
  return {
    count: products.length,
    sampleNames: uniqueStrings(products.map((item: any) => item?.display_name ?? item?.name)),
  };
}

async function fetchProbe(
  source: StoreCatalogProbeSource,
  endpoint: string,
  parser: (json: any) => { count: number | null; sampleNames: string[] } = genericJsonSamples,
): Promise<StoreCatalogProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "accept-language": "es-ES,es;q=0.9",
        "user-agent": "Mozilla/5.0 HomeSync supermarket source probe",
      },
    });
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
      return {
        source,
        label: PROBE_SOURCE_LABELS[source],
        status: response.status === 401 || response.status === 403 || response.status === 429 ? "blocked" : "error",
        http_status: response.status,
        content_type: contentType,
        endpoint,
        product_count: null,
        sample_names: [],
        notes:
          response.status === 401 || response.status === 403 || response.status === 429
            ? "El servidor bloquea la petición o exige sesión/captcha."
            : `Respuesta HTTP ${response.status}.`,
        elapsed_ms: Date.now() - started,
      };
    }

    const text = await response.text();
    if (!/json/i.test(contentType ?? "")) {
      return {
        source,
        label: PROBE_SOURCE_LABELS[source],
        status: "error",
        http_status: response.status,
        content_type: contentType,
        endpoint,
        product_count: null,
        sample_names: [],
        notes: "Respondió, pero no parece JSON de catálogo.",
        elapsed_ms: Date.now() - started,
      };
    }

    const parsed = parser(JSON.parse(text));
    return {
      source,
      label: PROBE_SOURCE_LABELS[source],
      status: (parsed.count ?? 0) > 0 || parsed.sampleNames.length > 0 ? "ok" : "empty",
      http_status: response.status,
      content_type: contentType,
      endpoint,
      product_count: parsed.count,
      sample_names: parsed.sampleNames,
      notes:
        parsed.sampleNames.length > 0
          ? "Endpoint JSON accesible. Revisa si los resultados son relevantes para la búsqueda."
          : "Endpoint JSON accesible, pero no devolvió productos para esta búsqueda.",
      elapsed_ms: Date.now() - started,
    };
  } catch (error: any) {
    return {
      source,
      label: PROBE_SOURCE_LABELS[source],
      status: "error",
      http_status: null,
      content_type: null,
      endpoint,
      product_count: null,
      sample_names: [],
      notes: error?.name === "AbortError" ? "Timeout al consultar la fuente." : error?.message ?? "Error desconocido.",
      elapsed_ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fromCarrefour(item: any): StoreProductSuggestion | null {
  const id = String(item?.id ?? item?.productId ?? item?.code ?? item?.sku ?? "");
  const name = item?.name ?? item?.title ?? item?.display_name ?? item?.productName ?? "";
  if (!id || !name) return null;
  const price = item?.price ?? item?.salePrice ?? item?.current_price ?? item?.currentPrice;
  const reference = item?.pricePerUnit ?? item?.price_per_unit ?? item?.unitPrice;
  return {
    source: "carrefour",
    source_label: SOURCE_LABELS.carrefour,
    id,
    ean: item?.ean ?? item?.gtin ?? null,
    display_name: name,
    brand: item?.brand ?? item?.brandName ?? null,
    thumbnail: absUrl("https://www.carrefour.es", item?.image ?? item?.imageUrl ?? item?.thumbnail),
    share_url: absUrl("https://www.carrefour.es", item?.url ?? item?.productUrl) ?? `https://www.carrefour.es/search?query=${encodeURIComponent(name)}`,
    category: item?.category ?? item?.categoryName ?? null,
    unit_price: num(typeof price === "object" ? price?.value : price),
    reference_price: num(typeof reference === "object" ? reference?.value : reference),
    reference_format: item?.unit ?? item?.unitMeasure ?? null,
    packaging: item?.packaging ?? null,
  };
}

async function searchMercadona(query: string, limit: number) {
  const results: StoreProductSuggestion[] = [];
  for (const variant of buildQueryVariants(query)) {
    results.push(...(await algoliaSearch(variant, limit)).map(fromMercadona));
  }
  return rankStoreResults(dedupeProducts(results), query).slice(0, limit);
}

async function searchDia(query: string, limit: number) {
  const results: StoreProductSuggestion[] = [];
  for (const variant of buildQueryVariants(query)) {
    const url = new URL("https://www.dia.es/api/v1/search-back/search/reduced");
    url.searchParams.set("q", variant);
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 HomeSync product search",
      },
    });
    if (!response.ok) throw new Error(`Día búsqueda devolvió ${response.status}`);
    const json: any = await response.json();
    results.push(
      ...(json.search_items ?? [])
        .map(fromDia)
        .filter((item: StoreProductSuggestion) => item.id && item.display_name),
    );
  }
  return rankStoreResults(dedupeProducts(results), query).slice(0, limit);
}

async function searchConsum(query: string, limit: number) {
  const results: StoreProductSuggestion[] = [];
  for (const variant of buildQueryVariants(query)) {
    const url = new URL("https://tienda.consum.es/api/rest/V1.0/catalog/product");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", "0");
    url.searchParams.set("q", variant);
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-language": "es-ES,es;q=0.9",
        "user-agent": "Mozilla/5.0 HomeSync product search",
      },
    });
    if (!response.ok) throw new Error(`Consum búsqueda devolvió ${response.status}`);
    const json: any = await response.json();
    const products = Array.isArray(json?.products) ? json.products : [];
    results.push(
      ...products
        .map(fromConsum)
        .filter((item: StoreProductSuggestion) => item.id && item.display_name),
    );
  }
  return rankStoreResults(dedupeProducts(results), query).slice(0, limit);
}

async function searchCarrefour(query: string, limit: number) {
  const results: StoreProductSuggestion[] = [];
  for (const variant of buildQueryVariants(query)) {
    const endpoints = [
      `https://www.carrefour.es/search-api/query/v1/search?query=${encodeURIComponent(variant)}`,
      `https://www.carrefour.es/supermercado/api/v1/search?query=${encodeURIComponent(variant)}`,
    ];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            accept: "application/json",
            "user-agent": "Mozilla/5.0 HomeSync product search",
          },
        });
        if (!response.ok) continue;
        const json: any = await response.json();
        const candidates =
          json.products ??
          json.items ??
          json.results ??
          json.data?.products ??
          json.data?.items ??
          [];
        results.push(...candidates.map(fromCarrefour).filter(Boolean));
      } catch {
        // Try the next known endpoint. Carrefour can block server-side catalog calls.
      }
    }
  }
  return rankStoreResults(dedupeProducts(results), query).slice(0, limit);
}

export async function searchStoreProducts(
  query: string,
  sources: StoreProductSource[],
  limitPerSource = 10,
): Promise<StoreProductSuggestion[]> {
  const uniqueSources = Array.from(new Set(sources));
  const settled = await Promise.allSettled(
    uniqueSources.map(async (source) => {
      if (source === "mercadona") return searchMercadona(query, limitPerSource);
      if (source === "dia") return searchDia(query, limitPerSource);
      if (source === "consum") return searchConsum(query, limitPerSource);
      if (source === "carrefour") return searchCarrefour(query, limitPerSource);
      return [];
    }),
  );
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

export async function testStoreCatalogSources(query: string): Promise<StoreCatalogProbeResult[]> {
  const trimmed = query.trim() || "leche";
  const encoded = encodeURIComponent(trimmed);

  const started = Date.now();
  const mercadona = algoliaSearch(trimmed, 5)
    .then((items) => ({
      source: "mercadona" as const,
      label: PROBE_SOURCE_LABELS.mercadona,
      status: items.length > 0 ? ("ok" as const) : ("empty" as const),
      http_status: 200,
      content_type: "application/json",
      endpoint: "Mercadona Algolia",
      product_count: items.length,
      sample_names: uniqueStrings(items.map((item) => item.display_name)),
      notes: items.length > 0 ? "Fuente actual funcional." : "La fuente respondió sin resultados.",
      elapsed_ms: Date.now() - started,
    }))
    .catch((error: any) => ({
      source: "mercadona" as const,
      label: PROBE_SOURCE_LABELS.mercadona,
      status: "error" as const,
      http_status: null,
      content_type: null,
      endpoint: "Mercadona Algolia",
      product_count: null,
      sample_names: [],
      notes: error?.message ?? "Error en Mercadona.",
      elapsed_ms: Date.now() - started,
    }));

  return Promise.all([
    mercadona,
    fetchProbe("dia", `https://www.dia.es/api/v1/search-back/search/reduced?q=${encoded}`, diaSamples),
    fetchProbe("consum", `https://tienda.consum.es/api/rest/V1.0/catalog/product?limit=8&offset=0&q=${encoded}`, consumSamples),
    fetchProbe("carrefour", `https://www.carrefour.es/search-api/query/v1/search?query=${encoded}`),
    fetchProbe("alcampo", `https://www.compraonline.alcampo.es/search?q=${encoded}`),
    fetchProbe("el_corte_ingles", `https://www.elcorteingles.es/supermercado/search/?term=${encoded}`),
    fetchProbe("eroski", `https://supermercado.eroski.es/es/search/results/?q=${encoded}`),
    fetchProbe("mas", `https://www.supermercadosmas.com/?s=${encoded}`),
    fetchProbe("caprabo", `https://www.capraboacasa.com/es/search?text=${encoded}`),
    fetchProbe("superalba", `https://superalba.es/?s=${encoded}`),
  ]);
}
