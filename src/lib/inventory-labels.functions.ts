import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVENTORY_LABEL_TYPES } from "./inventory-labels";
import { logHouseholdActivity } from "./activity.functions";

const LabelType = z.enum(INVENTORY_LABEL_TYPES);

export const listInventoryLabels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data, error } = await context.supabase
      .from("inventory_labels")
      .select("*, inventory_items(id, name, quantity, unit, location, min_stock)")
      .eq("household_id", householdId)
      .order("code");
    if (error) throw error;
    return data ?? [];
  });

export const generateInventoryLabelBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ label_type: LabelType, count: z.number().int().min(1).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: labels, error } = await context.supabase.rpc("create_inventory_label_batch", {
      p_label_type: data.label_type,
      p_count: data.count,
    });
    if (error) throw error;
    return labels ?? [];
  });

export const getInventoryLabel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().regex(/^HS-(FRI|CON|PAN|MED|GEN)-\d{4,}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: label, error } = await context.supabase
      .from("inventory_labels")
      .select("*, inventory_items(id, name, quantity, unit, location, min_stock, expiry_date)")
      .eq("household_id", householdId)
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw error;
    return label;
  });

export const assignInventoryLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), inventory_item_id: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: label, error } = await context.supabase
      .from("inventory_labels")
      .update({ inventory_item_id: data.inventory_item_id })
      .eq("id", data.id)
      .eq("household_id", householdId)
      .select("*, inventory_items(id, name, quantity, unit, location, min_stock, expiry_date)")
      .single();
    if (error) throw error;
    return label;
  });

export const adjustInventoryFromLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ label_id: z.string().uuid(), delta: z.number().finite().refine((n) => n !== 0) }).parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: label, error: labelError } = await context.supabase
      .from("inventory_labels")
      .select("inventory_item_id")
      .eq("id", data.label_id).eq("household_id", householdId).single();
    if (labelError || !label?.inventory_item_id) throw new Error("La etiqueta no está vinculada a un producto");
    const { data: item, error: itemError } = await context.supabase
      .from("inventory_items").select("*").eq("id", label.inventory_item_id).eq("household_id", householdId).single();
    if (itemError) throw itemError;
    const quantity = Math.max(0, Number(item.quantity ?? 0) + data.delta);
    const { data: updated, error } = await context.supabase
      .from("inventory_items").update({ quantity }).eq("id", item.id).select().single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "inventory", action: "updated", title: `${updated.name} actualizado desde etiqueta`,
      details: `Cantidad: ${item.quantity ?? 0} -> ${updated.quantity ?? 0}`,
      entityType: "inventory_item", entityId: updated.id,
      metadata: { source: "inventory_label", label_id: data.label_id, previous_quantity: item.quantity, quantity: updated.quantity },
    });
    return updated;
  });
