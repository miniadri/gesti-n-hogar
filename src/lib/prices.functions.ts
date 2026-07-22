import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type PriceQuote = {
  store_id: string | null;
  store_name: string;
  price: number;
  date: string; // ISO
  source: "receipt" | "catalog";
};

export type PriceComparison = Record<string, PriceQuote[]>;

const Input = z.object({ names: z.array(z.string().min(1)).max(200) });

export const comparePrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<PriceComparison> => {
    const householdId = (await context.supabase.rpc("current_household")).data as string | null;
    if (!householdId) return {};

    const wanted = new Set(data.names.map(normalize).filter(Boolean));
    if (wanted.size === 0) return {};

    // 1) Receipt items across household receipts
    const { data: receipts } = await context.supabase
      .from("receipts")
      .select("id, receipt_date, store_id, store:store_id(id, name)")
      .eq("household_id", householdId)
      .order("receipt_date", { ascending: false })
      .limit(500);

    const receiptMap = new Map<string, { date: string; store_id: string | null; store_name: string }>();
    for (const r of receipts ?? []) {
      const s: any = (r as any).store;
      receiptMap.set(r.id, {
        date: (r as any).receipt_date ?? (r as any).created_at ?? new Date().toISOString(),
        store_id: r.store_id ?? null,
        store_name: s?.name ?? "Sin tienda",
      });
    }

    const result: PriceComparison = {};
    const push = (key: string, q: PriceQuote) => {
      if (!result[key]) result[key] = [];
      // keep best price per store: replace if cheaper OR more recent tie
      const existing = result[key].find((x) => (x.store_id ?? "") === (q.store_id ?? ""));
      if (!existing) {
        result[key].push(q);
      } else if (q.price < existing.price || (q.price === existing.price && q.date > existing.date)) {
        existing.price = q.price;
        existing.date = q.date;
        existing.source = q.source;
        existing.store_name = q.store_name;
      }
    };

    const receiptIds = Array.from(receiptMap.keys());
    if (receiptIds.length > 0) {
      const { data: items } = await context.supabase
        .from("receipt_items")
        .select("receipt_id, name, unit_price, total_price, quantity")
        .in("receipt_id", receiptIds);

      for (const it of items ?? []) {
        const key = normalize(it.name ?? "");
        if (!key || !wanted.has(key)) continue;
        const meta = receiptMap.get(it.receipt_id);
        if (!meta) continue;
        const unit = Number(it.unit_price ?? 0);
        const qty = Number(it.quantity ?? 1);
        const total = Number(it.total_price ?? 0);
        const price = unit > 0 ? unit : qty > 0 && total > 0 ? total / qty : total;
        if (!(price > 0)) continue;
        push(key, {
          store_id: meta.store_id,
          store_name: meta.store_name,
          price: Math.round(price * 100) / 100,
          date: meta.date,
          source: "receipt",
        });
      }
    }

    // 2) product_prices catalog: match via products.name
    const { data: pprices } = await context.supabase
      .from("product_prices")
      .select("last_price, last_seen_at, store_id, store:store_id(id, name), product_ean, products:product_ean(name)")
      .eq("household_id", householdId);

    for (const p of pprices ?? []) {
      const prod: any = (p as any).products;
      const key = normalize(prod?.name ?? "");
      if (!key || !wanted.has(key)) continue;
      const s: any = (p as any).store;
      const price = Number((p as any).last_price ?? 0);
      if (!(price > 0)) continue;
      push(key, {
        store_id: (p as any).store_id ?? null,
        store_name: s?.name ?? "Sin tienda",
        price: Math.round(price * 100) / 100,
        date: (p as any).last_seen_at ?? new Date().toISOString(),
        source: "catalog",
      });
    }

    // sort each list asc by price
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => a.price - b.price || (a.date < b.date ? 1 : -1));
    }
    return result;
  });
