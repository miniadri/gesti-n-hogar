import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StoreId = z.enum(["carrefour", "eroski", "el_corte_ingles", "alcampo", "mas", "caprabo"]);

// Deliberately small caps: this is a manual, low-volume experiment.
const ProbeInput = z.object({
  queries: z.array(z.string().min(2).max(60)).min(1).max(3),
  stores: z.array(StoreId).min(1).max(6),
});

export const probeFirecrawlStoreCatalogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProbeInput.parse(input))
  .handler(async ({ data }) => {
    const { probeFirecrawlStores } = await import("./firecrawl-stores.server");
    const queries = Array.from(new Set(data.queries.map((query) => query.trim()).filter(Boolean)));
    const result = await probeFirecrawlStores(queries, data.stores);
    return { ...result, checked_at: new Date().toISOString() };
  });

export const getFirecrawlCreditBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getFirecrawlCredits } = await import("./firecrawl-stores.server");
    return getFirecrawlCredits();
  });
