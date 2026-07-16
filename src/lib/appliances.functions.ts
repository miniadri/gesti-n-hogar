import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const APPLIANCE_TYPES = [
  "gas",
  "induccion",
  "vitroceramica",
  "horno",
  "airfryer",
  "microondas",
  "olla_expres",
  "procesador",
  "manual",
  "otro",
] as const;

export type ApplianceType = (typeof APPLIANCE_TYPES)[number];

export const APPLIANCE_LABELS: Record<ApplianceType, string> = {
  gas: "Gas",
  induccion: "Inducción",
  vitroceramica: "Vitrocerámica",
  horno: "Horno",
  airfryer: "Air Fryer",
  microondas: "Microondas",
  olla_expres: "Olla exprés",
  procesador: "Procesador",
  manual: "Manual",
  otro: "Otro",
};

const ApplianceInput = z.object({
  type: z.enum(APPLIANCE_TYPES),
  name: z.string().min(1).max(60),
  is_default: z.boolean().optional(),
});

const UpdateInput = ApplianceInput.partial().extend({ id: z.string().uuid() });
const DeleteInput = z.object({ id: z.string().uuid() });

export const listAppliances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data, error } = await context.supabase
      .from("appliances")
      .select("*")
      .eq("household_id", householdId)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ApplianceInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    if (data.is_default) {
      await context.supabase
        .from("appliances")
        .update({ is_default: false })
        .eq("household_id", householdId);
    }
    const { data: row, error } = await context.supabase
      .from("appliances")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    const { id, ...rest } = data;
    if (rest.is_default && householdId) {
      await context.supabase
        .from("appliances")
        .update({ is_default: false })
        .eq("household_id", householdId);
    }
    const { data: row, error } = await context.supabase
      .from("appliances")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("appliances").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
