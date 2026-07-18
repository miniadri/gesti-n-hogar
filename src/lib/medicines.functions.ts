import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MedicineInput = z.object({
  name: z.string().min(1).max(200),
  expiry_month: z.number().int().min(1).max(12).nullable().optional(),
  expiry_year: z.number().int().min(2000).max(2100).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
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
    const { data: item, error } = await context.supabase
      .from("medicines")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return item;
  });

export const updateMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: item, error } = await context.supabase
      .from("medicines")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
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
