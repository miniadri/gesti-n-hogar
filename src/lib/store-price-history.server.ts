import type { SupabaseClient } from "@supabase/supabase-js";

export type StorePriceWindow = {
  currentPrice: number | null;
  minimumPrice30d: number | null;
  minimumCapturedAt: string | null;
};

const DAYS_30 = 30;

function sinceIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Reads the current price and rolling 30-day minimum for the shared catalog. */
export async function getSharedStorePriceWindow(
  admin: SupabaseClient,
  storeKey: string,
  externalId: string,
): Promise<StorePriceWindow> {
  const { data: product, error: productError } = await admin
    .from("store_catalog_products")
    .select("id, price")
    .eq("store_key", storeKey)
    .eq("external_id", externalId)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) return { currentPrice: null, minimumPrice30d: null, minimumCapturedAt: null };

  const { data: history, error: historyError } = await admin
    .from("store_catalog_price_history")
    .select("price, captured_at")
    .eq("store_catalog_product_id", product.id)
    .gte("captured_at", sinceIso(DAYS_30))
    .not("price", "is", null)
    .order("price", { ascending: true })
    .order("captured_at", { ascending: false });
  if (historyError) throw historyError;

  const minimum = history?.[0] ?? null;
  return {
    currentPrice: product.price == null ? null : Number(product.price),
    minimumPrice30d: minimum?.price == null ? null : Number(minimum.price),
    minimumCapturedAt: minimum?.captured_at ?? null,
  };
}

/** Reads Mercadona's equivalent rolling window using its legacy history table. */
export async function getMercadonaPriceWindow(
  admin: SupabaseClient,
  productId: string,
): Promise<StorePriceWindow> {
  const { data: history, error } = await admin
    .from("mercadona_price_history")
    .select("unit_price, captured_on")
    .eq("product_id", productId)
    .gte("captured_on", sinceIso(DAYS_30).slice(0, 10))
    .not("unit_price", "is", null)
    .order("unit_price", { ascending: true })
    .order("captured_on", { ascending: false });
  if (error) throw error;
  const minimum = history?.[0] ?? null;
  const latest = [...(history ?? [])].sort((a, b) => String(b.captured_on).localeCompare(String(a.captured_on)))[0] ?? null;
  return {
    currentPrice: latest?.unit_price == null ? null : Number(latest.unit_price),
    minimumPrice30d: minimum?.unit_price == null ? null : Number(minimum.unit_price),
    minimumCapturedAt: minimum?.captured_on ?? null,
  };
}
