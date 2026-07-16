import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RecipeInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  instructions: z.string().optional(),
  prep_time: z.number().int().nonnegative().optional(),
  cook_time: z.number().int().nonnegative().optional(),
  servings: z.number().int().positive().optional(),
  dietary_tags: z.array(z.string()).default([]),
});

const UpdateRecipeInput = RecipeInput.partial().extend({ id: z.string().uuid() });
const DeleteRecipeInput = z.object({ id: z.string().uuid() });

export const listRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RecipeInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: recipe, error } = await context.supabase
      .from("recipes")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return recipe;
  });

export const updateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateRecipeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: recipe, error } = await context.supabase
      .from("recipes")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return recipe;
  });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteRecipeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("recipes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
