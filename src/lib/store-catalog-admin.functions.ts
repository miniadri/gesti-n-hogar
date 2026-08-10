import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EXPERIMENTAL_ADMIN_EMAILS = new Set(["adri.miniadri@gmail.com", "adriturcafamiliar@gmail.com"]);

const ProviderKey = z.enum(["firecrawl", "apify", "scrapingbee", "scraperapi", "scrapedo", "brightdata"]);
const StoreKey = z.enum([
  "carrefour",
  "eroski",
  "el_corte_ingles",
  "alcampo",
  "mas",
  "caprabo",
  "consum",
  "mercadona",
  "dia",
]);

const UpdateProviderInput = z.object({
  provider_key: ProviderKey,
  enabled: z.boolean(),
  weekly_budget_credits: z.number().int().min(0).max(100000),
  monthly_budget_credits: z.number().int().min(0).max(1000000),
  estimated_credits_per_query: z.number().min(0).max(10000),
});

const UpdateSourceInput = z.object({
  store_key: StoreKey,
  enabled: z.boolean(),
  mode: z.enum(["live", "cached", "external"]),
  preferred_provider_key: ProviderKey.nullable(),
  weekly_term_limit: z.number().int().min(0).max(1000),
  priority_weight: z.number().int().min(0).max(100),
});

const QueueTermInput = z.object({
  term: z.string().min(2).max(80),
  store_key: StoreKey,
});

const ManualProbeInput = z.object({
  term: z.string().min(2).max(80),
});

const ManualMatrixProbeInput = z.object({
  term: z.string().min(2).max(80),
  store_key: StoreKey,
});

function assertExperimentalAdmin(context: any) {
  const email =
    String(context?.claims?.email ?? context?.claims?.user_metadata?.email ?? "")
      .trim()
      .toLowerCase();
  if (!EXPERIMENTAL_ADMIN_EMAILS.has(email)) {
    throw new Error("No autorizado para funciones experimentales.");
  }
}

function normalizeTerm(term: string) {
  return term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const getStoreCatalogLabState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertExperimentalAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [providers, sources, queue, products] = await Promise.all([
      admin.from("store_scrape_providers").select("*").order("name"),
      admin.from("store_catalog_source_settings").select("*").order("store_name"),
      admin
        .from("store_catalog_refresh_queue")
        .select("*, term:store_catalog_terms(term, search_count)")
        .order("priority_score", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(40),
      admin
        .from("store_catalog_products")
        .select("store_key, provider_key, captured_at")
        .eq("is_active", true)
        .order("captured_at", { ascending: false })
        .limit(500),
    ]);

    for (const result of [providers, sources, queue, products]) {
      if (result.error) throw result.error;
    }

    const cacheSummary = new Map<string, { count: number; last_captured_at: string | null }>();
    for (const row of products.data ?? []) {
      const key = row.store_key;
      const current = cacheSummary.get(key) ?? { count: 0, last_captured_at: null };
      current.count += 1;
      if (!current.last_captured_at || row.captured_at > current.last_captured_at) {
        current.last_captured_at = row.captured_at;
      }
      cacheSummary.set(key, current);
    }

    return {
      providers: providers.data ?? [],
      sources: (sources.data ?? []).map((source: any) => ({
        ...source,
        cache: cacheSummary.get(source.store_key) ?? { count: 0, last_captured_at: null },
      })),
      queue: queue.data ?? [],
      checked_at: new Date().toISOString(),
    };
  });

export const updateStoreCatalogProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateProviderInput.parse(input))
  .handler(async ({ data, context }) => {
    assertExperimentalAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row, error } = await admin
      .from("store_scrape_providers")
      .update({
        enabled: data.enabled,
        weekly_budget_credits: data.weekly_budget_credits,
        monthly_budget_credits: data.monthly_budget_credits,
        estimated_credits_per_query: data.estimated_credits_per_query,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_key", data.provider_key)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateStoreCatalogSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSourceInput.parse(input))
  .handler(async ({ data, context }) => {
    assertExperimentalAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row, error } = await admin
      .from("store_catalog_source_settings")
      .update({
        enabled: data.enabled,
        mode: data.mode,
        preferred_provider_key: data.preferred_provider_key,
        weekly_term_limit: data.weekly_term_limit,
        priority_weight: data.priority_weight,
        updated_at: new Date().toISOString(),
      })
      .eq("store_key", data.store_key)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const queueStoreCatalogTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => QueueTermInput.parse(input))
  .handler(async ({ data, context }) => {
    assertExperimentalAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const normalized = normalizeTerm(data.term);

    const { data: term, error: termError } = await admin
      .from("store_catalog_terms")
      .upsert(
        {
          term: data.term.trim(),
          normalized_term: normalized,
          search_count: 1,
          last_added_at: new Date().toISOString(),
        },
        { onConflict: "normalized_term" },
      )
      .select()
      .single();
    if (termError) throw termError;

    const { data: source, error: sourceError } = await admin
      .from("store_catalog_source_settings")
      .select("preferred_provider_key, priority_weight")
      .eq("store_key", data.store_key)
      .single();
    if (sourceError) throw sourceError;

    const { data: queued, error: queueError } = await admin
      .from("store_catalog_refresh_queue")
      .upsert(
        {
          term_id: term.id,
          store_key: data.store_key,
          provider_key: source.preferred_provider_key,
          priority_score: source.priority_weight,
          status: "queued",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "term_id,store_key" },
      )
      .select()
      .single();
    if (queueError) throw queueError;
    return queued;
  });

export const runStoreCatalogManualProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ManualProbeInput.parse(input))
  .handler(async ({ data, context }) => {
    assertExperimentalAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runConfiguredStoreCatalogProbe } = await import("./store-catalog-providers.server");
    const admin = supabaseAdmin as any;

    const [providers, sources] = await Promise.all([
      admin.from("store_scrape_providers").select("*").order("name"),
      admin.from("store_catalog_source_settings").select("*").order("priority_weight", { ascending: false }),
    ]);
    if (providers.error) throw providers.error;
    if (sources.error) throw sources.error;

    const probes = await runConfiguredStoreCatalogProbe(data.term.trim(), sources.data ?? [], providers.data ?? []);
    return {
      term: data.term.trim(),
      probes,
      checked_at: new Date().toISOString(),
    };
  });

export const runStoreCatalogProviderMatrixProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ManualMatrixProbeInput.parse(input))
  .handler(async ({ data, context }) => {
    assertExperimentalAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runStoreCatalogProviderMatrixProbe } = await import("./store-catalog-providers.server");
    const admin = supabaseAdmin as any;

    const [providers, sources] = await Promise.all([
      admin.from("store_scrape_providers").select("*").order("name"),
      admin.from("store_catalog_source_settings").select("*").order("store_name"),
    ]);
    if (providers.error) throw providers.error;
    if (sources.error) throw sources.error;

    const probes = await runStoreCatalogProviderMatrixProbe(
      data.term.trim(),
      sources.data ?? [],
      providers.data ?? [],
      data.store_key,
    );
    return {
      term: data.term.trim(),
      store_key: data.store_key,
      probes,
      checked_at: new Date().toISOString(),
    };
  });
