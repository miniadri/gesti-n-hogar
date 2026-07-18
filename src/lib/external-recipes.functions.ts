import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Búsqueda e importación de recetas desde Spoonacular (primario) y TheMealDB (fallback).
// Traducción al español opcional vía Lovable AI en el paso de importación.

export type ExternalHit = {
  source: "spoonacular" | "themealdb";
  external_id: string;
  title: string;
  image?: string | null;
  ready_in?: number | null;
  servings?: number | null;
  used_ingredients?: string[];
  missed_ingredients?: string[];
};

const SearchInput = z.object({
  query: z.string().optional(),
  ingredients: z.array(z.string()).optional(),
  meal_type: z.enum(["main course", "breakfast", "dessert", "salad", "soup"]).optional(),
  diet: z.string().optional(),
  number: z.number().int().min(1).max(20).default(10),
});

const ImportInput = z.object({
  source: z.enum(["spoonacular", "themealdb"]),
  external_id: z.string(),
  meal_type: z.enum(["comida", "cena", "ambas"]).default("ambas"),
  translate: z.boolean().default(true),
});

const AutoInput = z.object({
  count: z.number().int().min(1).max(10).default(5),
  meal_type: z.enum(["comida", "cena", "ambas"]).default("ambas"),
});

// ---------- Server Fns ----------

export const searchExternalRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SearchInput.parse(i))
  .handler(async ({ data }): Promise<{ hits: ExternalHit[]; provider: string; note?: string }> => {
    const { findExternalRecipes } = await import("./external-recipes.server");
    return findExternalRecipes(data);
  });

export const importExternalRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ImportInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { importExternalRecipeForHousehold } = await import("./external-recipes.server");
    return importExternalRecipeForHousehold({
      supabase: context.supabase,
      householdId,
      source: data.source,
      external_id: data.external_id,
      meal_type: data.meal_type,
      translate: data.translate,
    });
  });

// Auto-poblado: busca recetas usando los ingredientes del inventario y las importa.
export const autoImportFromInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => AutoInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: inv } = await context.supabase
      .from("inventory_items")
      .select("name, expiry_date")
      .eq("household_id", householdId)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .limit(15);
    const ingredients = (inv ?? [])
      .map((i: { name: string | null }) => (i.name || "").trim())
      .filter(Boolean)
      .slice(0, 5);

    const { autoImportBalancedRecipes } = await import("./external-recipes.server");
    const res = await autoImportBalancedRecipes({
      supabase: context.supabase,
      householdId,
      count: data.count,
      meal_type: data.meal_type,
      ingredients,
    });
    return { ...res, hits_found: res.imported };
  });
