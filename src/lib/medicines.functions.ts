import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MedicineInput = z.object({
  name: z.string().min(1).max(200),
  form: z.enum(["pill", "ml", "drops", "inhaler", "patch", "injection", "other"]).nullable().optional(),
  dose_amount: z.number().positive().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  total_quantity: z.number().nonnegative().nullable().optional(),
  current_quantity: z.number().nonnegative().nullable().optional(),
  low_stock_threshold: z.number().nonnegative().nullable().optional(),
  expiry_month: z.number().int().min(1).max(12).nullable().optional(),
  expiry_year: z.number().int().min(2000).max(2100).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  needs_purchase: z.boolean().default(false),
});

const UpdateInput = MedicineInput.partial().extend({ id: z.string().uuid() });
const IdInput = z.object({ id: z.string().uuid() });

export const listMedicines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data, error } = await context.supabase
      .from("medicines")
      .select("*")
      .eq("household_id", householdId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MedicineInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const payload = {
      ...data,
      note: data.note ?? data.notes ?? null,
      notes: data.notes ?? data.note ?? null,
    };
    const { data: item, error } = await context.supabase
      .from("medicines")
      .insert({ ...payload, household_id: householdId })
      .select()
      .single();
    if (error) throw error;

    const medicationPatch = {
      form: payload.form ?? undefined,
      dose_amount: payload.dose_amount ?? undefined,
      unit: payload.unit ?? undefined,
      total_quantity: payload.total_quantity ?? undefined,
      current_quantity: payload.current_quantity ?? undefined,
      low_stock_threshold: payload.low_stock_threshold ?? undefined,
      notes: payload.notes ?? undefined,
    };
    if (Object.values(medicationPatch).some((value) => value !== undefined)) {
      await context.supabase
        .from("medications")
        .update(medicationPatch)
        .eq("household_id", householdId)
        .ilike("name", item.name);
    }
    return item;
  });

export const updateMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: previous } = await context.supabase
      .from("medicines")
      .select("name")
      .eq("id", id)
      .single();

    const payload = { ...rest };
    if ("note" in rest || "notes" in rest) {
      payload.note = rest.note ?? rest.notes ?? null;
      payload.notes = rest.notes ?? rest.note ?? null;
    }
    const { data: item, error } = await context.supabase
      .from("medicines")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    const currentQuantity = payload.current_quantity ?? item.current_quantity;
    const lowStockThreshold = payload.low_stock_threshold ?? item.low_stock_threshold;
    const needsPurchase = payload.needs_purchase ?? (
      lowStockThreshold != null && currentQuantity != null && Number(currentQuantity) <= Number(lowStockThreshold)
        ? true
        : item.needs_purchase
    );

    if (needsPurchase !== item.needs_purchase) {
      await context.supabase.from("medicines").update({ needs_purchase: needsPurchase }).eq("id", item.id);
    }

    const medicationPatch = {
      name: payload.name,
      form: payload.form ?? undefined,
      dose_amount: payload.dose_amount ?? undefined,
      unit: payload.unit ?? undefined,
      total_quantity: payload.total_quantity,
      current_quantity: payload.current_quantity,
      low_stock_threshold: payload.low_stock_threshold,
      notes: payload.notes,
    };
    if (Object.values(medicationPatch).some((value) => value !== undefined)) {
      let query = context.supabase.from("medications").update(medicationPatch).eq("household_id", householdId);
      if (previous?.name && previous.name !== item.name) {
        query = query.or(`name.ilike.${previous.name},name.ilike.${item.name}`);
      } else {
        query = query.ilike("name", item.name);
      }
      await query;
    }
    return item;
  });

export const deleteMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => IdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("medicines").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const RestoreMedicineInput = z.object({ row: z.record(z.string(), z.any()) });

export const restoreMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RestoreMedicineInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const payload: Record<string, any> = { ...data.row, household_id: householdId };
    delete payload.updated_at;
    const { data: row, error } = await context.supabase
      .from("medicines")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });
