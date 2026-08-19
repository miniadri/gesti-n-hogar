import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAdminEnv } from "@/integrations/supabase/env.server";
import { cacheMercadonaProducts, fetchMercadonaProduct } from "@/lib/mercadona.server";

// Daily pg_cron job: refreshes prices for every cached Mercadona product
// so price changes are tracked in mercadona_price_history.
export const Route = createFileRoute("/api/public/hooks/mercadona-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_BEARER ?? "";
        if (!expected || bearer !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { url, serviceRoleKey } = requireSupabaseAdminEnv();
        const supabase = createClient(url, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: cached } = await supabase
          .from("mercadona_products")
          .select("id")
          .order("last_seen_at", { ascending: false })
          .limit(400);

        let refreshed = 0;
        for (const row of cached ?? []) {
          const product = await fetchMercadonaProduct(row.id);
          if (!product) continue;
          await cacheMercadonaProducts(supabase, [product]);
          refreshed++;
        }

        return Response.json({ ok: true, refreshed, total: cached?.length ?? 0 });
      },
    },
  },
});
