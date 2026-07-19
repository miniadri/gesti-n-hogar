import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


// ---------- schemas ----------
const EAN = z.string().min(6).max(32);

const ProductUpsertInput = z.object({
  ean: EAN,
  name: z.string().min(1).max(200),
  brand: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  size_value: z.number().positive().optional(),
  size_unit: z.string().max(20).optional(),
  image_url: z.string().url().optional(),
  default_location: z.string().max(40).optional(),
});

const PriceUpsertInput = z.object({
  ean: EAN,
  store_id: z.string().uuid().nullable().optional(),
  last_price: z.number().nonnegative(),
  last_quantity: z.number().positive().optional(),
  last_unit: z.string().max(20).optional(),
});

// ---------- helpers ----------
function toKilos(qty: number, unit?: string): number | null {
  if (!qty || !unit) return null;
  const u = unit.toLowerCase().trim();
  if (u === "kg" || u === "kilo" || u === "kilos") return qty;
  if (u === "g" || u === "gr" || u === "gramos") return qty / 1000;
  if (u === "l" || u === "litro" || u === "litros") return qty; // treat L as kg for price ratio
  if (u === "ml") return qty / 1000;
  return null;
}

// ---------- product lookup / upsert ----------
export const lookupProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ean: EAN }).parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data as string | null;

    // Household inventory match by EAN takes precedence: this is the user's
    // "known" name for this barcode and should win over the global catalog.
    let invItem: any = null;
    if (householdId) {
      const { data: inv } = await context.supabase
        .from("inventory_items")
        .select("id, name, quantity, min_stock, location, expiry_date, ean")
        .eq("household_id", householdId)
        .eq("ean", data.ean)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      invItem = inv;
    }

    const { data: product } = await context.supabase
      .from("products")
      .select("*")
      .eq("ean", data.ean)
      .maybeSingle();

    if (product || invItem) {
      let prices: any[] = [];
      if (householdId && product) {
        const { data: p } = await context.supabase
          .from("product_prices")
          .select("*, store:store_id(id, name)")
          .eq("household_id", householdId)
          .eq("product_ean", data.ean)
          .order("last_seen_at", { ascending: false });
        prices = p ?? [];
      }
      // Prefer inventory name (the household's chosen name) for display
      const merged = product
        ? { ...product, name: invItem?.name ?? product.name }
        : {
            ean: data.ean,
            name: invItem.name,
            brand: null,
            category: null,
            size_value: null,
            size_unit: null,
            image_url: null,
            default_location: invItem.location ?? null,
          };
      return { product: merged, inventory: invItem, prices, from: "db" as const };
    }

    // Try Open Food Facts as a fallback
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(data.ean)}.json`,
        { headers: { "User-Agent": "HomeSync/1.0" } },
      );
      if (res.ok) {
        const json: any = await res.json();
        if (json?.status === 1 && json.product) {
          const p = json.product;
          const suggestion = {
            ean: data.ean,
            name: p.product_name_es || p.product_name || `Producto ${data.ean}`,
            brand: p.brands?.split(",")[0]?.trim() ?? null,
            category: p.categories_tags?.[0]?.replace(/^[a-z]{2}:/, "") ?? null,
            image_url: p.image_front_url || p.image_url || null,
            size_value: null,
            size_unit: null,
          };
          return { product: null, inventory: null, suggestion, prices: [], from: "openfoodfacts" as const };
        }
      }
    } catch (e) {
      console.warn("OpenFoodFacts lookup failed", e);
    }

    return { product: null, inventory: null, suggestion: null, prices: [], from: "none" as const };
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProductUpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("products")
      .select("ean")
      .eq("ean", data.ean)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await context.supabase
        .from("products")
        .update({
          name: data.name,
          brand: data.brand ?? null,
          category: data.category ?? null,
          size_value: data.size_value ?? null,
          size_unit: data.size_unit ?? null,
          image_url: data.image_url ?? null,
          default_location: data.default_location ?? null,
        })
        .eq("ean", data.ean)
        .select()
        .single();
      if (error) throw error;
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("products")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return inserted;
  });

export const upsertProductPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PriceUpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data as string;
    if (!householdId) throw new Error("No household");

    // Try to enrich price/kg using the product size if quantity/unit weren't given
    let kilos = toKilos(data.last_quantity ?? 0, data.last_unit);
    if (!kilos) {
      const { data: prod } = await context.supabase
        .from("products")
        .select("size_value, size_unit")
        .eq("ean", data.ean)
        .maybeSingle();
      if (prod?.size_value && prod.size_unit) {
        kilos = toKilos(Number(prod.size_value), prod.size_unit);
      }
    }
    const pricePerKg = kilos && kilos > 0 ? Math.round((data.last_price / kilos) * 100) / 100 : null;

    const payload = {
      household_id: householdId,
      product_ean: data.ean,
      store_id: data.store_id ?? null,
      last_price: data.last_price,
      last_quantity: data.last_quantity ?? null,
      last_unit: data.last_unit ?? null,
      price_per_kg: pricePerKg,
      last_seen_at: new Date().toISOString(),
    };

    const { data: row, error } = await context.supabase
      .from("product_prices")
      .upsert(payload, { onConflict: "household_id,product_ean,store_id" })
      .select("*, store:store_id(id, name)")
      .single();
    if (error) throw error;
    return row;
  });

// ---------- STOCK CONTROL ----------
// Scan-to-consume in the kitchen. Decrements inventory by qty (default 1).
// If the resulting stock is <= min_stock (and > 0 alarm avoided), auto-add to shopping list.
const ConsumeInput = z.object({
  ean: EAN,
  qty: z.number().positive().default(1),
});

export const consumeByBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConsumeInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data as string;
    if (!householdId) throw new Error("No household");

    // Look up product name (for fallback shopping-list entries)
    const { data: product } = await context.supabase
      .from("products")
      .select("ean, name, default_location, category")
      .eq("ean", data.ean)
      .maybeSingle();

    // 1) Prefer inventory match by EAN
    const { data: invByEan } = await context.supabase
      .from("inventory_items")
      .select("*")
      .eq("household_id", householdId)
      .eq("ean", data.ean)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    let invItem: any = invByEan;

    // 2) Fall back to matching by product name (case-insensitive) and backfill the EAN
    if (!invItem && product?.name) {
      const { data: byName } = await context.supabase
        .from("inventory_items")
        .select("*")
        .eq("household_id", householdId)
        .ilike("name", product.name)
        .is("ean", null)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (byName) {
        await context.supabase
          .from("inventory_items")
          .update({ ean: data.ean })
          .eq("id", byName.id);
        invItem = { ...byName, ean: data.ean };
      }
    }

    let newQty: number | null = null;
    let addedToShopping = false;
    // Household-chosen name wins over the global catalog name
    let itemName = invItem?.name ?? product?.name ?? `Producto ${data.ean}`;

    if (invItem) {
      newQty = Math.max(0, Number(invItem.quantity ?? 0) - data.qty);
      const { error } = await context.supabase
        .from("inventory_items")
        .update({ quantity: newQty })
        .eq("id", invItem.id);
      if (error) throw error;
      itemName = invItem.name;
    }

    // Auto-add to shopping list when we run out (or hit min_stock)
    const minStock = Number(invItem?.min_stock ?? 0);
    const shouldReorder = newQty !== null && newQty <= minStock;
    if (shouldReorder || !invItem) {
      // ensure "Sin tienda" list exists
      let storeId: string | null = null;
      const { data: defaultStore } = await context.supabase
        .from("stores")
        .select("id")
        .eq("household_id", householdId)
        .eq("is_default", true)
        .maybeSingle();
      storeId = defaultStore?.id ?? null;
      if (!storeId) {
        const { data: created } = await context.supabase
          .from("stores")
          .insert({ household_id: householdId, name: "Sin tienda", is_default: true })
          .select("id")
          .single();
        storeId = created?.id ?? null;
      }
      let listId: string | null = null;
      if (storeId) {
        const { data: list } = await context.supabase
          .from("shopping_lists")
          .select("id")
          .eq("household_id", householdId)
          .eq("store_id", storeId)
          .eq("is_archived", false)
          .maybeSingle();
        if (list) listId = list.id;
        else {
          const { data: newList } = await context.supabase
            .from("shopping_lists")
            .insert({ household_id: householdId, store_id: storeId, name: "Sin tienda" })
            .select("id")
            .single();
          listId = newList?.id ?? null;
        }
      }

      if (listId) {
        // Avoid duplicates: same name unchecked in the list
        const { data: dup } = await context.supabase
          .from("shopping_list_items")
          .select("id, quantity")
          .eq("shopping_list_id", listId)
          .eq("checked", false)
          .ilike("name", itemName)
          .maybeSingle();
        if (!dup) {
          await context.supabase.from("shopping_list_items").insert({
            shopping_list_id: listId,
            name: itemName,
            quantity: 1,
            category: product?.category ?? null,
          });
          addedToShopping = true;
        }
      }
    }

    return {
      ok: true,
      matched: !!invItem,
      product_name: itemName,
      new_quantity: newQty,
      added_to_shopping: addedToShopping,
    };
  });
