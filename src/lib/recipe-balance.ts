export type ProteinGroup = "carne" | "pescado" | "legumbre" | "huevo" | "vegetal" | "otro";

export const BALANCED_PROTEIN_TARGETS: ProteinGroup[] = [
  "pescado",
  "legumbre",
  "carne",
  "vegetal",
  "huevo",
  "pescado",
  "legumbre",
  "carne",
  "vegetal",
  "huevo",
  "pescado",
  "legumbre",
  "carne",
  "vegetal",
];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function recipeFamily(title: string | null | undefined, ingredients: string[] = []): string | null {
  const text = normalize(`${title ?? ""} ${ingredients.join(" ")}`);
  const families: Array<[string, RegExp]> = [
    ["pasta", /\b(pasta|espagueti|spaghetti|macarron|tallarin|lasagn|fideo|ravioli|carbonara|bolon|pesto|noodle)\b/],
    ["arroz", /\b(arroz|rice|risotto|paella)\b/],
    ["pizza", /\bpizza\b/],
    ["sopa", /\b(sopa|soup|crema|caldo|pure|stew)\b/],
    ["ensalada", /\b(ensalad|salad)\b/],
    ["legumbre", /\b(lenteja|lentil|garbanz|chickpea|judia|alubia|bean|fabada|potaje|hummus)\b/],
    ["tortilla", /\b(tortilla|omelette|frittata|huevo|egg)\b/],
    ["sandwich", /\b(sandwich|bocadillo|wrap|tosta|toast)\b/],
    ["horno", /\b(horno|baked|roast|asado|guisado|casserole)\b/],
    ["plancha", /\b(plancha|grill|parrilla|barbecue|skillet)\b/],
  ];
  for (const [family, rx] of families) if (rx.test(text)) return family;
  return null;
}

export function inferProteinGroup(title: string | null | undefined, ingredients: string[] = []): ProteinGroup {
  const text = normalize(`${title ?? ""} ${ingredients.join(" ")}`);
  if (/\b(salmon|atun|tuna|bacalao|cod|merluza|hake|sardina|trucha|fish|pescado|gamba|shrimp|prawn|langostino|seafood|marisco)\b/.test(text)) {
    return "pescado";
  }
  if (/\b(lenteja|lentil|garbanzo|chickpea|alubia|judia|bean|frijol|pea|guisante|hummus|tofu|tempeh)\b/.test(text)) {
    return "legumbre";
  }
  if (/\b(huevo|egg|omelette|tortilla|frittata)\b/.test(text)) return "huevo";
  if (/\b(pollo|chicken|pavo|turkey|ternera|beef|cerdo|pork|lomo|bacon|jamon|ham|carne|meat|lamb|cordero)\b/.test(text)) {
    return "carne";
  }
  if (/\b(verdura|vegetable|vegetar|vegan|calabacin|zucchini|berenjena|eggplant|brocoli|broccoli|coliflor|cauliflower|espinaca|spinach|seta|mushroom)\b/.test(text)) {
    return "vegetal";
  }
  return "otro";
}

export function hasMainVegetable(title: string | null | undefined, ingredients: string[] = []): boolean {
  const text = normalize(`${title ?? ""} ${ingredients.join(" ")}`);
  return /\b(verdura|vegetable|ensalad|salad|tomate|tomato|cebolla|onion|pimiento|pepper|calabacin|zucchini|berenjena|eggplant|brocoli|broccoli|coliflor|cauliflower|zanahoria|carrot|espinaca|spinach|seta|mushroom|lechuga|lettuce)\b/.test(text);
}

export function inferRecipeMeta(title: string | null | undefined, ingredients: string[] = []) {
  return {
    protein_group: inferProteinGroup(title, ingredients),
    family: recipeFamily(title, ingredients),
    has_main_veg: hasMainVegetable(title, ingredients),
  };
}