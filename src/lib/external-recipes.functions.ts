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

// ---------- Spoonacular ----------

async function spoonacularSearch(params: {
  apiKey: string;
  query?: string;
  ingredients?: string[];
  type?: string;
  diet?: string;
  number: number;
}): Promise<ExternalHit[]> {
  const url = new URL("https://api.spoonacular.com/recipes/complexSearch");
  url.searchParams.set("apiKey", params.apiKey);
  url.searchParams.set("number", String(params.number));
  url.searchParams.set("addRecipeInformation", "true");
  url.searchParams.set("fillIngredients", "true");
  if (params.query) url.searchParams.set("query", params.query);
  if (params.ingredients?.length)
    url.searchParams.set("includeIngredients", params.ingredients.join(","));
  if (params.type) url.searchParams.set("type", params.type);
  if (params.diet) url.searchParams.set("diet", params.diet);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Spoonacular ${res.status}`);
  const json: any = await res.json();
  return (json.results ?? []).map((r: any) => ({
    source: "spoonacular" as const,
    external_id: String(r.id),
    title: r.title,
    image: r.image,
    ready_in: r.readyInMinutes ?? null,
    servings: r.servings ?? null,
    used_ingredients: (r.usedIngredients ?? []).map((i: any) => i.name),
    missed_ingredients: (r.missedIngredients ?? []).map((i: any) => i.name),
  }));
}

async function spoonacularDetail(apiKey: string, id: string) {
  const url = `https://api.spoonacular.com/recipes/${id}/information?includeNutrition=false&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Spoonacular detail ${res.status}`);
  const r: any = await res.json();
  const ingredients = (r.extendedIngredients ?? []).map((i: any) => ({
    name: i.name || i.originalName,
    quantity: i.amount ?? null,
    unit: i.unit || null,
  }));
  const steps: string[] =
    (r.analyzedInstructions?.[0]?.steps ?? []).map((s: any) => s.step) ||
    (r.instructions ? [r.instructions] : []);
  return {
    title: r.title as string,
    description: (r.summary || "").replace(/<[^>]+>/g, "").slice(0, 500),
    image_url: r.image as string | null,
    prep_time: r.preparationMinutes ?? null,
    cook_time: r.cookingMinutes ?? null,
    servings: r.servings ?? null,
    dietary_tags: [
      ...(r.vegetarian ? ["Vegetariano"] : []),
      ...(r.vegan ? ["Vegano"] : []),
      ...(r.glutenFree ? ["Sin gluten"] : []),
    ],
    ingredients,
    steps: steps.filter(Boolean),
  };
}

// ---------- TheMealDB ----------

async function themealdbSearch(params: {
  query?: string;
  ingredient?: string;
  number: number;
}): Promise<ExternalHit[]> {
  let url: string;
  if (params.ingredient) {
    url = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(
      params.ingredient,
    )}`;
  } else {
    url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(
      params.query ?? "",
    )}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TheMealDB ${res.status}`);
  const json: any = await res.json();
  return (json.meals ?? []).slice(0, params.number).map((m: any) => ({
    source: "themealdb" as const,
    external_id: String(m.idMeal),
    title: m.strMeal,
    image: m.strMealThumb || null,
  }));
}

async function themealdbDetail(id: string) {
  const res = await fetch(
    `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(`TheMealDB detail ${res.status}`);
  const json: any = await res.json();
  const m = json.meals?.[0];
  if (!m) throw new Error("Receta no encontrada");
  const ingredients: { name: string; quantity: number | null; unit: string | null }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || "").trim();
    const measure = (m[`strMeasure${i}`] || "").trim();
    if (!name) continue;
    ingredients.push({ name, quantity: null, unit: measure || null });
  }
  const rawSteps = (m.strInstructions || "")
    .split(/\r?\n|\.\s+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 3);
  return {
    title: m.strMeal as string,
    description: null as string | null,
    image_url: m.strMealThumb as string | null,
    prep_time: null,
    cook_time: null,
    servings: null,
    dietary_tags: m.strCategory === "Vegetarian" ? ["Vegetariano"] : [],
    ingredients,
    steps: rawSteps as string[],
  };
}

// ---------- Traducción con Lovable AI ----------

async function translateRecipe(
  detail: {
    title: string;
    description: string | null;
    ingredients: { name: string; quantity: number | null; unit: string | null }[];
    steps: string[];
  },
): Promise<typeof detail> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return detail;
  const payload = {
    title: detail.title,
    description: detail.description ?? "",
    ingredients: detail.ingredients.map((i) => i.name),
    steps: detail.steps,
  };
  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      {
        role: "system",
        content:
          "Traduces recetas del inglés al español (España). Devuelve SOLO JSON válido con las mismas claves y en el mismo orden. Nombres de ingredientes en minúscula, singular cuando sea natural.",
      },
      {
        role: "user",
        content:
          "Traduce este JSON al español y devuelve otro JSON con la misma forma:\n" +
          JSON.stringify(payload),
      },
    ],
    response_format: { type: "json_object" },
  };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return detail;
    const json: any = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const names: string[] = parsed.ingredients ?? [];
    return {
      title: parsed.title || detail.title,
      description: parsed.description || detail.description,
      ingredients: detail.ingredients.map((i, idx) => ({
        ...i,
        name: names[idx] || i.name,
      })),
      steps: parsed.steps ?? detail.steps,
    };
  } catch {
    return detail;
  }
}

// ---------- Server Fns ----------

export const searchExternalRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SearchInput.parse(i))
  .handler(async ({ data }): Promise<{ hits: ExternalHit[]; provider: string; note?: string }> => {
    const spoonKey = process.env.SPOONACULAR_API_KEY;
    if (spoonKey) {
      try {
        const hits = await spoonacularSearch({
          apiKey: spoonKey,
          query: data.query,
          ingredients: data.ingredients,
          type: data.meal_type,
          diet: data.diet,
          number: data.number,
        });
        if (hits.length > 0) return { hits, provider: "spoonacular" };
      } catch (err: any) {
        // 402 (cuota agotada) o error de red → probamos TheMealDB
        console.warn("Spoonacular falló, usando TheMealDB:", err?.message);
      }
    }
    const hits = await themealdbSearch({
      query: data.query,
      ingredient: data.ingredients?.[0],
      number: data.number,
    });
    return {
      hits,
      provider: "themealdb",
      note: spoonKey ? "Spoonacular no devolvió resultados o agotó la cuota diaria." : undefined,
    };
  });

export const importExternalRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ImportInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const sourceKey = `${data.source}:${data.external_id}`;
    const { data: existing } = await context.supabase
      .from("recipes")
      .select("id")
      .eq("household_id", householdId)
      .eq("source", sourceKey)
      .maybeSingle();
    if (existing) return { ok: true, recipe_id: existing.id, already: true };

    let detail;
    if (data.source === "spoonacular") {
      const key = process.env.SPOONACULAR_API_KEY;
      if (!key) throw new Error("Falta SPOONACULAR_API_KEY");
      detail = await spoonacularDetail(key, data.external_id);
    } else {
      detail = await themealdbDetail(data.external_id);
    }

    if (data.translate) {
      const translated = await translateRecipe({
        title: detail.title,
        description: detail.description,
        ingredients: detail.ingredients,
        steps: detail.steps,
      });
      detail = { ...detail, ...translated };
    }

    const { data: recipe, error } = await context.supabase
      .from("recipes")
      .insert({
        household_id: householdId,
        title: detail.title,
        description: detail.description,
        image_url: detail.image_url,
        prep_time: detail.prep_time,
        cook_time: detail.cook_time,
        servings: detail.servings,
        dietary_tags: detail.dietary_tags,
        meal_type: data.meal_type,
        source: sourceKey,
      })
      .select()
      .single();
    if (error) throw error;

    if (detail.ingredients.length > 0) {
      await context.supabase.from("recipe_ingredients").insert(
        detail.ingredients.map((i) => ({
          recipe_id: recipe.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
        })),
      );
    }
    if (detail.steps.length > 0) {
      await context.supabase.from("recipe_steps").insert(
        detail.steps.map((text, idx) => ({
          recipe_id: recipe.id,
          step_order: idx,
          text,
        })),
      );
    }
    return { ok: true, recipe_id: recipe.id, already: false };
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
      .map((i: any) => (i.name || "").trim())
      .filter(Boolean)
      .slice(0, 5);

    const spoonKey = process.env.SPOONACULAR_API_KEY;
    let hits: ExternalHit[] = [];
    let provider: string = "themealdb";
    if (spoonKey && ingredients.length > 0) {
      try {
        hits = await spoonacularSearch({
          apiKey: spoonKey,
          ingredients,
          number: data.count,
        });
        provider = "spoonacular";
      } catch {}
    }
    if (hits.length === 0) {
      hits = await themealdbSearch({
        ingredient: ingredients[0],
        query: ingredients[0] ? undefined : "chicken",
        number: data.count,
      });
      provider = "themealdb";
    }

    let imported = 0;
    for (const hit of hits.slice(0, data.count)) {
      try {
        const res: any = await importExternalRecipe({
          data: {
            source: hit.source,
            external_id: hit.external_id,
            meal_type: data.meal_type,
            translate: true,
          },
        });
        if (res?.ok && !res.already) imported++;
      } catch (err: any) {
        console.warn("Import falló:", err?.message);
      }
    }
    return { ok: true, imported, provider, hits_found: hits.length };
  });
