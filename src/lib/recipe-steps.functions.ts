import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ApplianceType } from "./appliances.functions";

// Factores por técnica y aparato (multiplicador sobre base_minutes).
// base = referencia gas/manual.
const FACTORS: Record<string, Partial<Record<ApplianceType, number>>> = {
  saltear: { induccion: 0.9, gas: 1, vitroceramica: 1.1, airfryer: 0.7 },
  cocer: { induccion: 0.85, gas: 1, vitroceramica: 1.1, olla_expres: 0.4 },
  freir: { airfryer: 0.6, induccion: 0.9, gas: 1 },
  hornear: { horno: 1, airfryer: 0.6, microondas: 0.4 },
  asar: { horno: 1, airfryer: 0.65 },
  calentar: { microondas: 0.3, horno: 1, gas: 1 },
  corte: { procesador: 0.2, manual: 1 },
  marinar: {},
};

export function adjustMinutes(
  baseMinutes: number,
  technique: string | null | undefined,
  appliance: ApplianceType | null | undefined,
  override?: number | null,
): number {
  if (override != null) return override;
  if (!baseMinutes || !technique || !appliance) return baseMinutes;
  const map = FACTORS[technique];
  const factor = map?.[appliance];
  if (factor == null) return baseMinutes;
  return Math.max(1, Math.round(baseMinutes * factor));
}

const StepInput = z.object({
  recipe_id: z.string().uuid(),
  step_order: z.number().int().nonnegative(),
  text: z.string().min(1),
  base_minutes: z.number().int().nonnegative().optional(),
  technique: z.string().optional(),
  is_prep_ahead: z.boolean().optional(),
});

const UpdateStepInput = StepInput.partial().extend({ id: z.string().uuid() });
const DeleteStepInput = z.object({ id: z.string().uuid() });
const ListStepsInput = z.object({ recipe_id: z.string().uuid() });

export const listSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListStepsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: steps, error } = await context.supabase
      .from("recipe_steps")
      .select("*, recipe_step_appliance_times(appliance_type, minutes)")
      .eq("recipe_id", data.recipe_id)
      .order("step_order");
    if (error) throw error;
    return steps ?? [];
  });

export const createStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => StepInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("recipe_steps")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateStepInput.parse(i))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("recipe_steps")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteStepInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("recipe_steps").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
