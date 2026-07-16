import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InventoryInput = z.object({
  name: z.string().min(1).max(200),
  category: z.string().optional(),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().optional(),
  min_stock: z.number().nonnegative().default(0),
  location: z.string().optional(),
  expiry_date: z.string().date().optional(),
  last_price: z.number().nonnegative().optional(),
});

const UpdateInventoryInput = InventoryInput.partial().extend({ id: z.string().uuid() });
const DeleteInventoryInput = z.object({ id: z.string().uuid() });

export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("inventory_items")
      .select("*")
      .eq("household_id", householdId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: item, error } = await context.supabase
      .from("inventory_items")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return item;
  });

export const updateInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: item, error } = await context.supabase
      .from("inventory_items")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return item;
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteInventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("inventory_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
