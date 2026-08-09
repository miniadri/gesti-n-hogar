import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StoreProductSourceInput = z.enum(["mercadona", "dia", "carrefour"]);

const SearchInput = z.object({
  query: z.string().min(2).max(120),
  sources: z.array(StoreProductSourceInput).min(1).max(6),
});

export const searchStoreProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const { searchStoreProducts: search } = await import("./store-products.server");
    const results = await search(data.query.trim(), data.sources, 6);
    return { query: data.query, results };
  });
