import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BALANCED_PROTEIN_TARGETS, inferRecipeMeta, recipeFamily } from "./recipe-balance";

// Devuelve el lunes de la semana actual (YYYY-MM-DD).
export function currentWeekStart(base = new Date()): string {
  const d = new Date(base);
  const day = d.getDay(); // 0 dom - 6 sab
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function dateForDayOfWeek(weekStart: string, dow: number): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + dow);
  return d.toISOString().slice(0, 10);
}

const WeekInput = z.object({ week_start: z.string().date().optional() });
const GenerateInput = z.object({
  week_start: z.string().date().optional(),
  servings: z.number().int().positive().default(2),
});
const UpdateSlotInput = z.object({
  day_id: z.string().uuid(),
  slot: z.enum(["lunch", "dinner"]),
  recipe_id: z.string().uuid().nullable().optional(),
  manual: z.string().nullable().optional(),
  skipped: z.boolean().optional(),
  lock: z.boolean().optional(),
});

async function getOrCreatePlan(
  supabase: any,
  householdId: string,
  weekStart: string,
) {
  const { data: existing } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from("meal_plans")
    .insert({ household_id: householdId, week_start: weekStart })
    .select()
    .single();
  if (error) throw error;
  // seed 7 días
  const rows = Array.from({ length: 7 }, (_, i) => ({
    meal_plan_id: created.id,
    day_of_week: i,
  }));
  await supabase.from("meal_plan_days").insert(rows);
  return created;
}

export const getWeekPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => WeekInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const weekStart = data.week_start ?? currentWeekStart();
    const plan = await getOrCreatePlan(context.supabase, householdId, weekStart);
    const { data: days } = await context.supabase
      .from("meal_plan_days")
      .select(
        "*, lunch:lunch_recipe_id(id,title,protein_group,has_main_veg), dinner:dinner_recipe_id(id,title,protein_group,has_main_veg)",
      )
      .eq("meal_plan_id", plan.id)
      .order("day_of_week");
    return { plan, days: days ?? [], week_start: weekStart };
  });

// Algoritmo simple: prioriza recetas cuyos ingredientes están en el inventario y a punto de caducar,
// alterna grupos de proteína y evita repetir la misma receta en la semana.
export const generateWeekPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => GenerateInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const weekStart = data.week_start ?? currentWeekStart();
    const plan = await getOrCreatePlan(context.supabase, householdId, weekStart);

    let { data: recipes } = await context.supabase
      .from("recipes")
      .select(
        "id,title,meal_type,protein_group,has_main_veg,recipe_ingredients(name,quantity,unit)",
      )
      .eq("household_id", householdId);

    const { data: inventory } = await context.supabase
      .from("inventory_items")
      .select("name, expiry_date, updated_at")
      .eq("household_id", householdId)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    const invMap = new Map<string, { expiry: string | null; updated: string }>();
    for (const it of inventory ?? []) {
      invMap.set((it.name || "").toLowerCase().trim(), {
        expiry: it.expiry_date,
        updated: it.updated_at,
      });
    }

    const now = Date.now();
    const recipeMeta = (r: any) => {
      const ingredientNames = (r.recipe_ingredients ?? []).map((ing: any) => ing.name).filter(Boolean);
      const inferred = inferRecipeMeta(r.title, ingredientNames);
      return {
        protein: r.protein_group || inferred.protein_group,
        family: recipeFamily(r.title, ingredientNames) || inferred.family,
        hasVeg: Boolean(r.has_main_veg || inferred.has_main_veg),
      };
    };
    const hasBalancedCatalog = (rows: any[]) => {
      if (rows.length < 12) return false;
      const proteins = new Set(rows.map((r) => recipeMeta(r).protein).filter((p) => p && p !== "otro"));
      const families = new Set(rows.map((r) => recipeMeta(r).family).filter(Boolean));
      return proteins.size >= 4 && families.size >= 6;
    };

    let autoImported = 0;
    if (!hasBalancedCatalog(recipes ?? [])) {
      const ingredients = (inventory ?? [])
        .map((i: { name: string | null }) => (i.name || "").trim())
        .filter(Boolean)
        .slice(0, 5);
      const needed = Math.min(10, Math.max(6, 14 - (recipes ?? []).length));
      const { autoImportBalancedRecipes } = await import("./external-recipes.server");
      const importResult = await autoImportBalancedRecipes({
        supabase: context.supabase,
        householdId,
        count: needed,
        meal_type: "ambas",
        ingredients,
      });
      autoImported = importResult.imported;
      const refreshed = await context.supabase
        .from("recipes")
        .select(
          "id,title,meal_type,protein_group,has_main_veg,recipe_ingredients(name,quantity,unit)",
        )
        .eq("household_id", householdId);
      recipes = refreshed.data ?? recipes ?? [];
    }

    const scoreRecipe = (r: any) => {
      let covered = 0;
      let expiryBonus = 0;
      for (const ing of r.recipe_ingredients ?? []) {
        const key = (ing.name || "").toLowerCase().trim();
        const hit = invMap.get(key);
        if (hit) {
          covered++;
          if (hit.expiry) {
            const daysLeft = (new Date(hit.expiry).getTime() - now) / 86400000;
            if (daysLeft <= 3) expiryBonus += 5;
            else if (daysLeft <= 7) expiryBonus += 2;
          }
        }
      }
      return covered * 10 + expiryBonus;
    };

    const { data: days } = await context.supabase
      .from("meal_plan_days")
      .select("*")
      .eq("meal_plan_id", plan.id)
      .order("day_of_week");

    const usedRecipeIds = new Set<string>();
    const familyCount = new Map<string, number>();
    const proteinCount = new Map<string, number>();
    let lastFamily: string | null = null;
    let lastProtein: string | null = null;

    let slotIndex = 0;
    const pickForSlot = (slot: "comida" | "cena"): { recipe_id: string | null; protein: string | null; family: string | null } => {
      const targetProtein = BALANCED_PROTEIN_TARGETS[slotIndex % BALANCED_PROTEIN_TARGETS.length];
      slotIndex++;
      const candidates = (recipes ?? [])
        .filter((r: any) => r.meal_type === slot || r.meal_type === "ambas" || !r.meal_type)
        .filter((r: any) => !usedRecipeIds.has(r.id))
        .map((r: any) => {
          const meta = recipeMeta(r);
          const fam = meta.family;
          const protein = meta.protein;
          let score = scoreRecipe(r);
          if (protein === targetProtein) score += 18;
          else if (protein === lastProtein) score -= 14;
          else if (protein && protein !== "otro") score += 5;
          // Variedad de proteína
          if (protein && protein !== lastProtein) score += 3;
          if (protein) score -= (proteinCount.get(protein) ?? 0) * 7;
          // Variedad de familia (evita 3 pastas seguidas)
          if (fam && fam === lastFamily) score -= 30;
          if (fam) score -= (familyCount.get(fam) ?? 0) * 8;
          if (meta.hasVeg) score += 2;
          // Ruido pequeño para desempatar (evita orden estable trivial)
          score += Math.random() * 2;
          return { r, score, fam, protein };
        });
      const viableCandidates = candidates.filter((candidate) => {
        if (candidate.fam && candidate.fam === lastFamily) return false;
        if (candidate.fam && (familyCount.get(candidate.fam) ?? 0) >= 2) return false;
        return true;
      });
      const ranked = (viableCandidates.length > 0 ? viableCandidates : candidates)
        .sort((a, b) => b.score - a.score);
      const chosen = ranked[0];
      if (!viableCandidates.length && chosen?.fam && (chosen.fam === lastFamily || (familyCount.get(chosen.fam) ?? 0) >= 2)) {
        return { recipe_id: null, protein: null, family: null };
      }
      if (!chosen) return { recipe_id: null, protein: null, family: null };
      usedRecipeIds.add(chosen.r.id);
      if (chosen.fam) familyCount.set(chosen.fam, (familyCount.get(chosen.fam) ?? 0) + 1);
      if (chosen.protein)
        proteinCount.set(chosen.protein, (proteinCount.get(chosen.protein) ?? 0) + 1);
      return { recipe_id: chosen.r.id, protein: chosen.protein, family: chosen.fam };
    };

    let assigned = 0;
    for (const day of days ?? []) {
      const update: any = {};
      if (!day.lunch_locked && !day.lunch_skipped && !day.lunch_manual) {
        const p = pickForSlot("comida");
        update.lunch_recipe_id = p.recipe_id;
        if (p.recipe_id) assigned++;
        if (p.protein) lastProtein = p.protein;
        if (p.family) lastFamily = p.family;
        if (!p.recipe_id) lastFamily = null;
      }
      if (!day.dinner_locked && !day.dinner_skipped && !day.dinner_manual) {
        const p = pickForSlot("cena");
        update.dinner_recipe_id = p.recipe_id;
        if (p.recipe_id) assigned++;
        if (p.protein) lastProtein = p.protein;
        if (p.family) lastFamily = p.family;
        if (!p.recipe_id) lastFamily = null;
      }
      if (Object.keys(update).length > 0) {
        await context.supabase.from("meal_plan_days").update(update).eq("id", day.id);
      }
    }

    return {
      ok: true,
      week_start: weekStart,
      assigned,
      recipes_available: (recipes ?? []).length,
      auto_imported: autoImported,
    };
  });


export const updateMealSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateSlotInput.parse(i))
  .handler(async ({ data, context }) => {
    const prefix = data.slot;
    const update: any = { [`${prefix}_locked`]: data.lock ?? true };
    if (data.recipe_id !== undefined) update[`${prefix}_recipe_id`] = data.recipe_id;
    if (data.manual !== undefined) {
      update[`${prefix}_manual`] = data.manual;
      if (data.manual) update[`${prefix}_recipe_id`] = null;
    }
    if (data.skipped !== undefined) {
      update[`${prefix}_skipped`] = data.skipped;
      if (data.skipped) {
        update[`${prefix}_recipe_id`] = null;
        update[`${prefix}_manual`] = null;
      }
    }
    const { data: row, error } = await context.supabase
      .from("meal_plan_days")
      .update(update)
      .eq("id", data.day_id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

// Devuelve lo que falta para las recetas de la semana comparado con inventario.
export const getMissingIngredients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => WeekInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const weekStart = data.week_start ?? currentWeekStart();
    const { data: plan } = await context.supabase
      .from("meal_plans")
      .select("id")
      .eq("household_id", householdId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (!plan) return [];
    const { data: days } = await context.supabase
      .from("meal_plan_days")
      .select("lunch_recipe_id, dinner_recipe_id, servings")
      .eq("meal_plan_id", plan.id);
    const recipeIds = Array.from(
      new Set(
        (days ?? [])
          .flatMap((d: any) => [d.lunch_recipe_id, d.dinner_recipe_id])
          .filter(Boolean),
      ),
    ) as string[];
    if (recipeIds.length === 0) return [];
    const { data: ings } = await context.supabase
      .from("recipe_ingredients")
      .select("name, quantity, unit, is_optional, recipe_id")
      .in("recipe_id", recipeIds);
    const { data: inv } = await context.supabase
      .from("inventory_items")
      .select("name, quantity")
      .eq("household_id", householdId);
    const invMap = new Map<string, number>();
    for (const it of inv ?? []) invMap.set((it.name || "").toLowerCase().trim(), Number(it.quantity || 0));
    const need = new Map<string, { name: string; unit: string | null; qty: number }>();
    for (const ing of ings ?? []) {
      if (ing.is_optional) continue;
      const key = (ing.name || "").toLowerCase().trim();
      const have = invMap.get(key) ?? 0;
      const missing = Number(ing.quantity || 1) - have;
      if (missing > 0) {
        const prev = need.get(key);
        need.set(key, {
          name: ing.name,
          unit: ing.unit,
          qty: (prev?.qty ?? 0) + missing,
        });
      }
    }
    return Array.from(need.values());
  });

// Devuelve pasos "prep ahead" para las recetas de mañana.
export const getPrepAheadForTomorrow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) return [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = currentWeekStart(tomorrow);
    const { data: plan } = await context.supabase
      .from("meal_plans")
      .select("id")
      .eq("household_id", householdId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (!plan) return [];
    const dow = (tomorrow.getDay() + 6) % 7;
    const { data: day } = await context.supabase
      .from("meal_plan_days")
      .select("lunch_recipe_id, dinner_recipe_id")
      .eq("meal_plan_id", plan.id)
      .eq("day_of_week", dow)
      .maybeSingle();
    if (!day) return [];
    const recipeIds = [day.lunch_recipe_id, day.dinner_recipe_id].filter(Boolean) as string[];
    if (recipeIds.length === 0) return [];
    const { data: steps } = await context.supabase
      .from("recipe_steps")
      .select("id, text, base_minutes, recipe_id, recipes(title)")
      .in("recipe_id", recipeIds)
      .eq("is_prep_ahead", true)
      .order("step_order");
    return steps ?? [];
  });
