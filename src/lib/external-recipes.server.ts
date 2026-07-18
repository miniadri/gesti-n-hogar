import { BALANCED_PROTEIN_TARGETS, inferRecipeMeta } from "./recipe-balance";

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

type MealType = "comida" | "cena" | "ambas";

export async function spoonacularSearch(params: {
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
  url.searchParams.set("instructionsRequired", "true");
  url.searchParams.set("maxReadyTime", "50");
  url.searchParams.set("sort", "random");
  if (params.query) url.searchParams.set("query", params.query);
  if (params.ingredients?.length) url.searchParams.set("includeIngredients", params.ingredients.join(","));
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

export async function themealdbSearch(params: {
  query?: string;
  ingredient?: string;
  number: number;
}): Promise<ExternalHit[]> {
  let url: string;
  if (params.ingredient) {
    url = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(params.ingredient)}`;
  } else {
    url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(params.query ?? "")}`;
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
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(id)}`);
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

async function translateRecipe(detail: {
  title: string;
  description: string | null;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
  steps: string[];
}): Promise<typeof detail> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return detail;
  const payload = {
    title: detail.title,
    description: detail.description ?? "",
    ingredients: detail.ingredients.map((i) => i.name),
    steps: detail.steps,
  };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Traduces recetas del inglés al español (España). Devuelve SOLO JSON válido con las mismas claves. Nombres de ingredientes en minúscula, singular cuando sea natural.",
          },
          {
            role: "user",
            content: "Traduce este JSON al español y devuelve otro JSON con la misma forma:\n" + JSON.stringify(payload),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return detail;
    const json: any = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const names: string[] = parsed.ingredients ?? [];
    return {
      title: parsed.title || detail.title,
      description: parsed.description || detail.description,
      ingredients: detail.ingredients.map((i, idx) => ({ ...i, name: names[idx] || i.name })),
      steps: parsed.steps ?? detail.steps,
    };
  } catch {
    return detail;
  }
}

export async function findExternalRecipes(data: {
  query?: string;
  ingredients?: string[];
  meal_type?: string;
  diet?: string;
  number: number;
}): Promise<{ hits: ExternalHit[]; provider: string; note?: string }> {
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
      console.warn("Spoonacular falló, usando TheMealDB:", err?.message);
    }
  }
  const hits = await themealdbSearch({ query: data.query, ingredient: data.ingredients?.[0], number: data.number });
  return {
    hits,
    provider: "themealdb",
    note: spoonKey ? "Spoonacular no devolvió resultados o agotó la cuota diaria." : undefined,
  };
}

export async function importExternalRecipeForHousehold(params: {
  supabase: any;
  householdId: string;
  source: "spoonacular" | "themealdb";
  external_id: string;
  meal_type: MealType;
  translate?: boolean;
}) {
  const sourceKey = `${params.source}:${params.external_id}`;
  const { data: existing } = await params.supabase
    .from("recipes")
    .select("id")
    .eq("household_id", params.householdId)
    .eq("source", sourceKey)
    .maybeSingle();
  if (existing) return { ok: true, recipe_id: existing.id, already: true };

  let detail;
  if (params.source === "spoonacular") {
    const key = process.env.SPOONACULAR_API_KEY;
    if (!key) throw new Error("Falta SPOONACULAR_API_KEY");
    detail = await spoonacularDetail(key, params.external_id);
  } else {
    detail = await themealdbDetail(params.external_id);
  }

  if (params.translate ?? true) {
    const translated = await translateRecipe({
      title: detail.title,
      description: detail.description,
      ingredients: detail.ingredients,
      steps: detail.steps,
    });
    detail = { ...detail, ...translated };
  }

  const meta = inferRecipeMeta(
    detail.title,
    detail.ingredients.map((i: { name: string }) => i.name),
  );
  const { data: recipe, error } = await params.supabase
    .from("recipes")
    .insert({
      household_id: params.householdId,
      title: detail.title,
      description: detail.description,
      image_url: detail.image_url,
      prep_time: detail.prep_time,
      cook_time: detail.cook_time,
      servings: detail.servings,
      dietary_tags: detail.dietary_tags,
      meal_type: params.meal_type,
      source: sourceKey,
      protein_group: meta.protein_group,
      has_main_veg: meta.has_main_veg,
      difficulty: (Number(detail.prep_time || 0) + Number(detail.cook_time || 0) || 30) <= 45 ? "facil" : null,
    })
    .select()
    .single();
  if (error) throw error;

  if (detail.ingredients.length > 0) {
    await params.supabase.from("recipe_ingredients").insert(
      detail.ingredients.map((i: { name: string; quantity: number | null; unit: string | null }) => ({
        recipe_id: recipe.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
      })),
    );
  }
  if (detail.steps.length > 0) {
    await params.supabase.from("recipe_steps").insert(
      detail.steps.slice(0, 12).map((text: string, idx: number) => ({
        recipe_id: recipe.id,
        step_order: idx,
        text,
      })),
    );
  }
  return { ok: true, recipe_id: recipe.id, already: false };
}

const BALANCED_SEARCHES: Record<string, Array<{ query: string; ingredient?: string }>> = {
  pescado: [
    { query: "salmon vegetables", ingredient: "salmon" },
    { query: "white fish potatoes", ingredient: "cod" },
    { query: "tuna salad", ingredient: "tuna" },
    { query: "fish rice", ingredient: "fish" },
  ],
  legumbre: [
    { query: "lentil soup", ingredient: "lentils" },
    { query: "chickpea stew", ingredient: "chickpeas" },
    { query: "bean chili", ingredient: "beans" },
    { query: "hummus bowl", ingredient: "chickpeas" },
  ],
  carne: [
    { query: "chicken rice", ingredient: "chicken" },
    { query: "turkey vegetables", ingredient: "turkey" },
    { query: "beef stew", ingredient: "beef" },
    { query: "pork tenderloin", ingredient: "pork" },
  ],
  vegetal: [
    { query: "vegetable stir fry", ingredient: "broccoli" },
    { query: "mushroom risotto", ingredient: "mushrooms" },
    { query: "vegetarian curry", ingredient: "cauliflower" },
    { query: "roasted vegetables", ingredient: "zucchini" },
  ],
  huevo: [
    { query: "vegetable omelette", ingredient: "eggs" },
    { query: "frittata", ingredient: "eggs" },
    { query: "egg fried rice", ingredient: "eggs" },
    { query: "shakshuka", ingredient: "eggs" },
  ],
  otro: [{ query: "simple healthy dinner" }],
};

export async function autoImportBalancedRecipes(params: {
  supabase: any;
  householdId: string;
  count: number;
  meal_type: MealType;
  ingredients?: string[];
}) {
  const providers = new Set<string>();
  let imported = 0;
  const targets = [...BALANCED_PROTEIN_TARGETS].sort(() => Math.random() - 0.5);
  const inventorySearches = (params.ingredients ?? [])
    .slice(0, 3)
    .map((name) => ({ query: `${name} healthy dinner`, ingredient: name }));
  const searches = [
    ...inventorySearches,
    ...targets.flatMap((target) => BALANCED_SEARCHES[target] ?? []),
  ];

  for (const search of searches) {
    if (imported >= params.count) break;
    let result: { hits: ExternalHit[]; provider: string };
    try {
      result = await findExternalRecipes({
        query: search.query,
        ingredients: search.ingredient ? [search.ingredient] : undefined,
        meal_type: "main course",
        number: 3,
      });
    } catch {
      continue;
    }
    providers.add(result.provider);
    for (const hit of result.hits) {
      if (imported >= params.count) break;
      try {
        const res = await importExternalRecipeForHousehold({
          supabase: params.supabase,
          householdId: params.householdId,
          source: hit.source,
          external_id: hit.external_id,
          meal_type: params.meal_type,
          translate: true,
        });
        if (res?.ok && !res.already) imported++;
      } catch (err: any) {
        console.warn("Importación automática falló:", err?.message);
      }
    }
  }

  return { ok: true, imported, provider: Array.from(providers).join("+") || "sin resultados" };
}