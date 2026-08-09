import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SearchInput = z.object({ query: z.string().min(2).max(120) });
const HistoryInput = z.object({ productId: z.string().min(1).max(32), limit: z.number().int().min(1).max(60).default(30) });

export const searchMercadonaProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const { algoliaSearch, cacheMercadonaProducts } = await import("./mercadona.server");
    const results = await algoliaSearch(data.query.trim(), 8);
    if (results.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await cacheMercadonaProducts(supabaseAdmin, results);
      } catch {
        // Caching is best-effort; search must still work.
      }
    }
    return { query: data.query, results };
  });

export const getMercadonaPriceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => HistoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mercadona_price_history")
      .select("captured_on, unit_price, bulk_price")
      .eq("product_id", data.productId)
      .order("captured_on", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

const ProductInput = z.object({ id: z.string().min(1).max(32) });

export const getMercadonaProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProductInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchMercadonaProduct, cacheMercadonaProducts } = await import("./mercadona.server");
    const product = await fetchMercadonaProduct(data.id);
    if (product) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await cacheMercadonaProducts(supabaseAdmin, [product]);
      } catch {
        // best-effort cache
      }
    }
    return product;
  });
