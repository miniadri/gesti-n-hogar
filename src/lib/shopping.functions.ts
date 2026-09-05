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
});

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
      .insert(data as ShoppingItemInsert)
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
    const payload = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .update(payload as ShoppingItemUpdate)
      .eq("id", id)
      .select("*, shopping_list:shopping_list_id(household_id)")
      .single();
    if (error) throw error;
    const householdId = (item as ShoppingItemWithHousehold)?.shopping_list?.household_id;
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
