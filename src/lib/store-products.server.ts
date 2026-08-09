import { algoliaSearch, type MercadonaProduct } from "./mercadona.server";

export type StoreProductSource = "mercadona" | "dia" | "carrefour";

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
  carrefour: "Carrefour",
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
      if (source === "carrefour") return searchCarrefour(query, limitPerSource);
      return [];
    }),
  );
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}
