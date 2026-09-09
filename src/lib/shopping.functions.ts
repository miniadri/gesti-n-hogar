import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logHouseholdActivity } from "./activity.functions";



const StoreInput = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const StorePreferencesInput = z.object({
  id: z.string().uuid(),
  is_enabled: z.boolean(),
});

const ReorderStoresInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(60),
});

const ShoppingItemInput = z.object({
  shopping_list_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  category: z.string().optional(),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  manual_price: z.number().nonnegative().optional(),
  image_url: z.string().url().optional(),
  mercadona_id: z.string().max(32).optional(),
  store_product_source: z.enum(["mercadona", "dia", "consum", "carrefour"]).optional(),
  store_product_id: z.string().max(80).optional(),
  store_product_url: z.string().url().optional(),
  store_product_brand: z.string().max(120).optional(),
  linked_inventory_item_id: z.string().uuid().optional(),
  priority: z.enum(["urgente", "normal", "sin_prisa"]).optional(),
  notes: z.string().max(500).optional(),
});

const UpdateItemInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(80).nullable().optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(20).nullable().optional(),
  manual_price: z.number().nonnegative().nullable().optional(),
  priority: z.enum(["urgente", "normal", "sin_prisa"]).optional(),
  notes: z.string().max(500).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  mercadona_id: z.string().max(32).nullable().optional(),
  store_product_source: z.enum(["mercadona", "dia", "consum", "carrefour"]).nullable().optional(),
  store_product_id: z.string().max(80).nullable().optional(),
  store_product_url: z.string().url().nullable().optional(),
  store_product_brand: z.string().max(120).nullable().optional(),
  shopping_list_id: z.string().uuid().optional(),
});

function normalizeProductName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productTokens(value: string): string[] {
  return normalizeProductName(value)
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token, index, tokens) => tokens.indexOf(token) === index)
    .sort();
}

function productTokenScore(left: string, right: string): number {
  const a = productTokens(left);
  const b = productTokens(right);
  if (!a.length || !b.length) return 0;
  const overlap = a.filter((token) => b.includes(token)).length;
  return overlap / Math.max(a.length, b.length);
}

function hasSelectedCatalogProduct(patch: Record<string, unknown>) {
  return Boolean(patch.store_product_source || patch.store_product_id || patch.store_product_url);
}

function applyCatalogProductToPatch(patch: Record<string, unknown>, product: any) {
  patch.name = product.display_name ?? patch.name;
  patch.category = product.category ?? patch.category ?? null;
  patch.manual_price = product.unit_price != null ? Number(product.unit_price) : null;
  patch.image_url = product.thumbnail ?? null;
  patch.mercadona_id = product.source === "mercadona" ? product.id : null;
  patch.store_product_source = product.source ?? null;
  patch.store_product_id = product.id ?? null;
  patch.store_product_url = product.share_url ?? null;
  patch.store_product_brand = product.brand ?? null;
}

function isSearchableStoreProductSource(value: unknown): value is "mercadona" | "dia" | "consum" | "carrefour" {
  return value === "mercadona" || value === "dia" || value === "consum" || value === "carrefour";
}

const UpdateItemPriorityInput = z.object({
  id: z.string().uuid(),
  priority: z.enum(["urgente", "normal", "sin_prisa"]),
});


const ToggleItemInput = z.object({
  id: z.string().uuid(),
  checked: z.boolean(),
});

const DeleteItemInput = z.object({
  id: z.string().uuid(),
});
const AddInventorySuggestionInput = z.object({
  inventory_item_id: z.string().uuid(),
});

const VoiceShoppingItemInput = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  kiosk_member_id: z.string().uuid().optional(),
});

export const listStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("stores")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const listActiveShoppingLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data, error } = await context.supabase
      .from("shopping_lists")
      .select("id, store_id, name")
      .eq("household_id", householdId)
      .eq("is_archived", false);
    if (error) throw error;
    return data ?? [];
  });

export const createStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: store, error } = await context.supabase
      .from("stores")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return store;
  });

export const reorderStores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReorderStoresInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    for (const [index, id] of data.ids.entries()) {
      const { error } = await context.supabase
        .from("stores")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("household_id", householdId);
      if (error) throw error;
    }
    return { ok: true };
  });

export const updateStorePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StorePreferencesInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: store, error } = await context.supabase
      .from("stores")
      .update({ is_enabled: data.is_enabled })
      .eq("id", data.id)
      .eq("household_id", householdId)
      .select()
      .single();
    if (error) throw error;
    return store;
  });

export const ensureDefaultLists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    // Ensure a default "Sin tienda" store exists
    const { data: existing } = await context.supabase
      .from("stores")
      .select("id")
      .eq("household_id", householdId)
      .eq("name", "Sin tienda")
      .maybeSingle();

    if (!existing) {
      await context.supabase
        .from("stores")
        .insert({ household_id: householdId, name: "Sin tienda", is_default: true });
    }

    const officialStores = [
      { name: "Mercadona", official_source: "mercadona", is_enabled: true },
      { name: "Día", official_source: "dia", is_enabled: true },
      { name: "Consum", official_source: "consum", is_enabled: true },
      { name: "Carrefour", official_source: "carrefour", is_enabled: false },
    ];

    for (const official of officialStores) {
      const { data: existingOfficial } = await context.supabase
        .from("stores")
        .select("id")
        .eq("household_id", householdId)
        .eq("official_source", official.official_source)
        .maybeSingle();

      if (!existingOfficial) {
        await context.supabase
          .from("stores")
          .insert({
            household_id: householdId,
            name: official.name,
            official_source: official.official_source,
            is_enabled: official.is_enabled,
          });
      }
    }

    // Ensure each store has a current shopping list
    const { data: stores } = await context.supabase
      .from("stores")
      .select("id, name")
      .eq("household_id", householdId);

    for (const store of stores ?? []) {
      const { data: list } = await context.supabase
        .from("shopping_lists")
        .select("id")
        .eq("household_id", householdId)
        .eq("store_id", store.id)
        .eq("is_archived", false)
        .maybeSingle();

      if (!list) {
        await context.supabase.from("shopping_lists").insert({
          household_id: householdId,
          store_id: store.id,
          name: store.name,
        });
      }
    }

    return { ok: true };
  });

export const listShoppingItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("shopping_list_items")
      .select("*, shopping_list:shopping_list_id(store_id, name, store:store_id(name))")
      .eq("shopping_list.household_id", householdId)
      .eq("checked", false)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listRecentItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("shopping_list_items")
      .select("id, name, category, unit, quantity, updated_at, shopping_list:shopping_list_id(id, store_id, household_id, store:store_id(name))")
      .eq("shopping_list.household_id", householdId)
      .eq("checked", true)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return data ?? [];
  });

export const createShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ShoppingItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await getHouseholdIdForShoppingList(context.supabase, data.shopping_list_id);
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    if (householdId) {
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "shopping",
        action: "created",
        title: `${item.name} añadido a la lista`,
        details: `${item.quantity ?? 0} ${item.unit || "ud."}`,
        entityType: "shopping_list_item",
        entityId: item.id,
        metadata: { quantity: item.quantity, unit: item.unit, category: item.category },
      });
    }
    return item;
  });

/** Changes the urgency label of a pending shopping item. */
export const updateShoppingItemPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateItemPriorityInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .update({ priority: data.priority })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return item;
  });

/** Updates the editable fields of a shopping item (name, amount, price, category, tag, details). */
export const updateShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    let movedStore = false;
    let targetStoreId: string | null = null;
    if (patch.shopping_list_id) {
      const householdId = (await context.supabase.rpc("current_household")).data;
      const { data: targetList, error: targetError } = await context.supabase
        .from("shopping_lists")
        .select("id, store_id, store:store_id(name, official_source)")
        .eq("id", patch.shopping_list_id)
        .eq("household_id", householdId)
        .eq("is_archived", false)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!targetList) throw new Error("La tienda seleccionada no pertenece a este hogar");

      const { data: currentItem, error: currentError } = await context.supabase
        .from("shopping_list_items")
        .select("name, shopping_list:shopping_list_id(store_id)")
        .eq("id", id)
        .single();
      if (currentError) throw currentError;
      const currentStoreId = (currentItem as any)?.shopping_list?.store_id ?? null;
      targetStoreId = targetList.store_id ?? null;
      movedStore = currentStoreId !== targetStoreId;

      // A store move must never leave a price/link belonging to the old store.
      if (movedStore) {
        const selectedProduct = hasSelectedCatalogProduct(patch);
        if (!selectedProduct) {
          (patch as any).manual_price = null;
          (patch as any).image_url = null;
          (patch as any).mercadona_id = null;
          (patch as any).store_product_source = null;
          (patch as any).store_product_id = null;
          (patch as any).store_product_url = null;
          (patch as any).store_product_brand = null;
        }

        // Reuse the latest catalog price for the same household/store/product name.
        const name = String(patch.name ?? (currentItem as any)?.name ?? "");
        const targetSource = (targetList as any)?.store?.official_source;
        if (!selectedProduct && isSearchableStoreProductSource(targetSource) && name) {
          const { searchStoreProducts } = await import("./store-products.server");
          const results = await searchStoreProducts(name, [targetSource], 8);
          const best = results
            .map((product) => ({ product, score: productTokenScore(name, product.display_name) }))
            .filter(({ product, score }) => Number(product.unit_price) > 0 && score >= 0.55)
            .sort((a, b) => b.score - a.score)[0]?.product;
          if (best) applyCatalogProductToPatch(patch, best);
        }
        if (!hasSelectedCatalogProduct(patch) && householdId && targetStoreId && name) {
          const { data: candidates } = await context.supabase
            .from("product_prices")
            .select("last_price, last_seen_at, store_id, products:product_ean(name)")
            .eq("household_id", householdId)
            .eq("store_id", targetStoreId)
            .order("last_seen_at", { ascending: false })
            .limit(200);
          const wanted = normalizeProductName(name);
          const match = (candidates ?? []).find((candidate: any) =>
            (normalizeProductName(candidate.products?.name ?? "") === wanted ||
              productTokenScore(candidate.products?.name ?? "", wanted) >= 0.75) &&
            Number(candidate.last_price) > 0,
          ) as any;
          if (match) (patch as any).manual_price = Number(match.last_price);
        }
      }
    }
    const payload = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .update(payload)
      .eq("id", id)
      .select("*, shopping_list:shopping_list_id(household_id)")
      .single();
    if (error) throw error;
    const householdId = (item as { shopping_list?: { household_id?: string | null } | null })?.shopping_list?.household_id;
    if (householdId) {
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "shopping",
        action: "updated",
        title: `${item.name} actualizado en la lista`,
        details: `${item.quantity ?? 0} ${item.unit || "ud."}`,
        entityType: "shopping_list_item",
        entityId: item.id,
        metadata: payload,
      });
    }
    return item;
  });


export const addInventorySuggestionToShopping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AddInventorySuggestionInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: invItem, error: invError } = await context.supabase
      .from("inventory_items")
      .select("id, name, category, quantity, unit, min_stock")
      .eq("household_id", householdId)
      .eq("id", data.inventory_item_id)
      .single();
    if (invError) throw invError;

    let storeId: string | null = null;
    const { data: defaultStore } = await context.supabase
      .from("stores")
      .select("id")
      .eq("household_id", householdId)
      .eq("is_default", true)
      .maybeSingle();
    storeId = defaultStore?.id ?? null;
    if (!storeId) {
      const { data: created, error } = await context.supabase
        .from("stores")
        .insert({ household_id: householdId, name: "Sin tienda", is_default: true })
        .select("id")
        .single();
      if (error) throw error;
      storeId = created?.id ?? null;
    }
    if (!storeId) throw new Error("No se pudo preparar la lista de compra");

    let listId: string | null = null;
    const { data: list } = await context.supabase
      .from("shopping_lists")
      .select("id")
      .eq("household_id", householdId)
      .eq("store_id", storeId)
      .eq("is_archived", false)
      .maybeSingle();
    if (list) listId = list.id;
    else {
      const { data: newList, error } = await context.supabase
        .from("shopping_lists")
        .insert({ household_id: householdId, store_id: storeId, name: "Sin tienda" })
        .select("id")
        .single();
      if (error) throw error;
      listId = newList?.id ?? null;
    }
    if (!listId) throw new Error("No se pudo preparar la lista de compra");

    const { data: activeItems } = await context.supabase
      .from("shopping_list_items")
      .select("id, name, linked_inventory_item_id")
      .eq("shopping_list_id", listId)
      .eq("checked", false)
      .limit(200);
    const normalizedName = normalizeShoppingName(invItem.name);
    const duplicate = (activeItems ?? []).some(
      (item: any) =>
        item.linked_inventory_item_id === invItem.id ||
        normalizeShoppingName(item.name) === normalizedName,
    );
    if (duplicate) return { added: false, duplicate: true };

    const targetQty = Number(invItem.min_stock ?? 0) > 0
      ? Math.max(1, Number(invItem.min_stock ?? 0) - Number(invItem.quantity ?? 0) + 1)
      : 1;
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .insert({
        shopping_list_id: listId,
        name: invItem.name,
        category: invItem.category ?? null,
        quantity: targetQty,
        unit: invItem.unit ?? null,
        linked_inventory_item_id: invItem.id,
      })
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "shopping",
      action: "suggested_added",
      title: `${item.name} sugerido y añadido a la lista`,
      details: `Motivo: stock crítico o caducidad cercana`,
      entityType: "shopping_list_item",
      entityId: item.id,
      metadata: { inventory_item_id: invItem.id, quantity: targetQty },
    });
    return { added: true, duplicate: false, item };
  });

export const addShoppingItemByName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => VoiceShoppingItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const listId = await getDefaultShoppingListId(context.supabase, householdId);
    const normalizedName = normalizeShoppingName(data.name);

    const { data: activeItems, error: activeError } = await context.supabase
      .from("shopping_list_items")
      .select("id, name, quantity, unit")
      .eq("shopping_list_id", listId)
      .eq("checked", false)
      .limit(200);
    if (activeError) throw activeError;

    const existing = (activeItems ?? []).find((item: any) => normalizeShoppingName(item.name) === normalizedName);
    if (existing) {
      const nextQuantity = Number(existing.quantity ?? 0) + data.quantity;
      const { data: item, error } = await context.supabase
        .from("shopping_list_items")
        .update({ quantity: nextQuantity })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "shopping",
        action: "voice_updated",
        title: `${item.name} actualizado por voz`,
        details: `${item.quantity ?? 0} ${item.unit || "ud."}`,
        entityType: "shopping_list_item",
        entityId: item.id,
        metadata: { voice_command: true, kiosk_member_id: data.kiosk_member_id, quantity: item.quantity },
      });
      return { mode: "updated", item };
    }

    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .insert({ shopping_list_id: listId, name: data.name, quantity: data.quantity })
      .select()
      .single();
    if (error) throw error;

    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "shopping",
      action: "voice_created",
      title: `${item.name} añadido por voz`,
      details: `${item.quantity ?? 0} ${item.unit || "ud."}`,
      entityType: "shopping_list_item",
      entityId: item.id,
      metadata: { voice_command: true, kiosk_member_id: data.kiosk_member_id, quantity: item.quantity },
    });
    return { mode: "created", item };
  });

export const removeShoppingItemByName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: lists, error: listsError } = await context.supabase
      .from("shopping_lists")
      .select("id")
      .eq("household_id", householdId)
      .eq("is_archived", false);
    if (listsError) throw listsError;
    const listIds = (lists ?? []).map((list: any) => list.id);
    if (!listIds.length) return { found: false };

    const { data: items, error: itemsError } = await context.supabase
      .from("shopping_list_items")
      .select("id, name, quantity, unit")
      .in("shopping_list_id", listIds)
      .eq("checked", false)
      .limit(300);
    if (itemsError) throw itemsError;

    const target = normalizeShoppingName(data.name);
    const item = (items ?? []).find((row: any) => normalizeShoppingName(row.name) === target)
      ?? (items ?? []).find((row: any) => normalizeShoppingName(row.name).includes(target) || target.includes(normalizeShoppingName(row.name)));

    if (!item) return { found: false };

    const { error } = await context.supabase.from("shopping_list_items").delete().eq("id", item.id);
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "shopping",
      action: "voice_deleted",
      title: `${item.name} eliminado por voz`,
      details: `${item.quantity ?? 0} ${item.unit || "ud."}`,
      entityType: "shopping_list_item",
      entityId: item.id,
      metadata: { voice_command: true },
    });
    return { found: true, item };
  });

function normalizeShoppingName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getDefaultShoppingListId(supabase: any, householdId: string) {
  let storeId: string | null = null;
  const { data: defaultStore } = await supabase
    .from("stores")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_default", true)
    .maybeSingle();
  storeId = defaultStore?.id ?? null;
  if (!storeId) {
    const { data: createdStore, error } = await supabase
      .from("stores")
      .insert({ household_id: householdId, name: "Sin tienda", is_default: true })
      .select("id")
      .single();
    if (error) throw error;
    storeId = createdStore.id;
  }

  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("store_id", storeId)
    .eq("is_archived", false)
    .maybeSingle();
  if (list?.id) return list.id;

  const { data: createdList, error } = await supabase
    .from("shopping_lists")
    .insert({ household_id: householdId, store_id: storeId, name: "Sin tienda" })
    .select("id")
    .single();
  if (error) throw error;
  return createdList.id;
}

export const toggleShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ToggleItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: before } = await context.supabase
      .from("shopping_list_items")
      .select("id, name, quantity, unit, checked, shopping_list:shopping_list_id(household_id)")
      .eq("id", data.id)
      .maybeSingle();
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .update({ checked: data.checked })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    const householdId = (before as any)?.shopping_list?.household_id;
    if (householdId) {
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "shopping",
        action: data.checked ? "checked" : "unchecked",
        title: data.checked ? `${item.name} marcado como comprado` : `${item.name} devuelto a pendientes`,
        details: `${item.quantity ?? 0} ${item.unit || "ud."}`,
        entityType: "shopping_list_item",
        entityId: item.id,
        metadata: { previous_checked: before?.checked, checked: data.checked },
      });
    }
    return item;
  });

export const deleteShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("shopping_list_items")
      .select("id, name, quantity, unit, shopping_list:shopping_list_id(household_id)")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("shopping_list_items").delete().eq("id", data.id);
    if (error) throw error;
    const householdId = (item as any)?.shopping_list?.household_id;
    if (householdId) {
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "shopping",
        action: "deleted",
        title: `${item?.name ?? "Producto"} eliminado de la lista`,
        details: `${item?.quantity ?? 0} ${item?.unit || "ud."}`,
        entityType: "shopping_list_item",
        entityId: item?.id ?? data.id,
        metadata: item ?? {},
      });
    }
    return { ok: true };
  });

const RestoreShoppingItemInput = z.object({ row: z.record(z.string(), z.any()) });

export const restoreShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RestoreShoppingItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload: Record<string, any> = { ...data.row };
    delete payload.updated_at;
    const householdId = payload.shopping_list_id
      ? await getHouseholdIdForShoppingList(context.supabase, payload.shopping_list_id)
      : null;
    const { data: row, error } = await context.supabase
      .from("shopping_list_items")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    if (householdId) {
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "shopping",
        action: "restored",
        title: `${row.name} restaurado en la lista`,
        details: `${row.quantity ?? 0} ${row.unit || "ud."}`,
        entityType: "shopping_list_item",
        entityId: row.id,
        metadata: { restored_from_undo: true },
      });
    }
    return row;
  });

async function getHouseholdIdForShoppingList(supabase: any, shoppingListId: string) {
  const { data } = await supabase
    .from("shopping_lists")
    .select("household_id")
    .eq("id", shoppingListId)
    .maybeSingle();
  return data?.household_id ?? null;
}
