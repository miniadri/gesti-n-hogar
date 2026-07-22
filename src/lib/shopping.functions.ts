import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StoreInput = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const ShoppingItemInput = z.object({
  shopping_list_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  category: z.string().optional(),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  manual_price: z.number().nonnegative().optional(),
  image_url: z.string().url().optional(),
  linked_inventory_item_id: z.string().uuid().optional(),
});

const ToggleItemInput = z.object({
  id: z.string().uuid(),
  checked: z.boolean(),
});

const DeleteItemInput = z.object({
  id: z.string().uuid(),
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
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return item;
  });

export const toggleShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ToggleItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("shopping_list_items")
      .update({ checked: data.checked })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return item;
  });

export const deleteShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shopping_list_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const RestoreShoppingItemInput = z.object({ row: z.record(z.string(), z.any()) });

export const restoreShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RestoreShoppingItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload: Record<string, any> = { ...data.row };
    delete payload.updated_at;
    const { data: row, error } = await context.supabase
      .from("shopping_list_items")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });
