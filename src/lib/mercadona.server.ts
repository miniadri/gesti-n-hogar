// Server-only helpers to query Mercadona's public catalog.
// Search is powered by their Algolia index; product detail (EAN, ingredients)
// comes from the storefront API.

const ALGOLIA_APP_ID = "7UZJKL1DJ0";
const ALGOLIA_API_KEY = "9d8f2e39e90df472b4f2e559a116fe17";
const ALGOLIA_INDEX = "products_prod_4315_es";
const DEFAULT_WAREHOUSE = "mad1";

export type MercadonaProduct = {
  id: string;
  ean: string | null;
  display_name: string;
  brand: string | null;
  slug: string | null;
  thumbnail: string | null;
  share_url: string | null;
  category: string | null;
  unit_price: number | null;
  bulk_price: number | null;
  reference_price: number | null;
  reference_format: string | null;
  unit_name: string | null;
  unit_size: number | null;
  is_pack: boolean;
  packaging: string | null;
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deepestCategory(categories: any): string | null {
  let node = Array.isArray(categories) ? categories[0] : null;
  let name: string | null = null;
  while (node) {
    name = node.name ?? name;
    node = Array.isArray(node.categories) ? node.categories[0] : null;
  }
  return name;
}

export function normalizeMercadonaHit(hit: any): MercadonaProduct {
  const price = hit?.price_instructions ?? {};
  return {
    id: String(hit.id ?? hit.objectID),
    ean: hit.ean ?? null,
    display_name: hit.display_name ?? "",
    brand: hit.brand ?? null,
    slug: hit.slug ?? null,
    thumbnail: hit.thumbnail ?? hit.photos?.[0]?.regular ?? null,
    share_url:
      hit.share_url ??
      (hit.id && hit.slug ? `https://tienda.mercadona.es/product/${hit.id}/${hit.slug}` : null),
    category: deepestCategory(hit.categories),
    unit_price: num(price.unit_price),
    bulk_price: num(price.bulk_price),
    reference_price: num(price.reference_price),
    reference_format: price.reference_format ?? null,
    unit_name: price.unit_name ?? null,
    unit_size: num(price.unit_size),
    is_pack: Boolean(price.is_pack),
    packaging: hit.packaging ?? null,
  };
}

export async function algoliaSearch(query: string, hits = 8): Promise<MercadonaProduct[]> {
  const response = await fetch(
    `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
    {
      method: "POST",
      headers: {
        "x-algolia-api-key": ALGOLIA_API_KEY,
        "x-algolia-application-id": ALGOLIA_APP_ID,
        "content-type": "application/json",
      },
      body: JSON.stringify({ params: `query=${encodeURIComponent(query)}&hitsPerPage=${hits}` }),
    },
  );
  if (!response.ok) throw new Error(`Mercadona búsqueda devolvió ${response.status}`);
  const json: any = await response.json();
  return (json.hits ?? []).map(normalizeMercadonaHit);
}

export async function fetchMercadonaProduct(
  id: string,
  warehouse = DEFAULT_WAREHOUSE,
): Promise<MercadonaProduct | null> {
  try {
    const response = await fetch(
      `https://tienda.mercadona.es/api/products/${encodeURIComponent(id)}/?lang=es&wh=${warehouse}`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) return null;
    const json: any = await response.json();
    const normalized = normalizeMercadonaHit(json);
    return { ...normalized, ean: json?.ean ?? normalized.ean };
  } catch {
    return null;
  }
}

/** Upserts products into the shared catalog and records today's price point. */
export async function cacheMercadonaProducts(admin: any, products: MercadonaProduct[]) {
  if (products.length === 0) return;
  const now = new Date().toISOString();
  await admin
    .from("mercadona_products")
    .upsert(
      products.map((product) => ({ ...product, updated_at: now, last_seen_at: now })),
      { onConflict: "id" },
    );
  await admin.from("mercadona_price_history").upsert(
    products.map((product) => ({
      product_id: product.id,
      captured_on: now.slice(0, 10),
      unit_price: product.unit_price,
      bulk_price: product.bulk_price,
    })),
    { onConflict: "product_id,captured_on" },
  );
}
