/** Shared category + priority helpers for the shopping list. */

export const SHOPPING_CATEGORIES = [
  "Frutas",
  "Verduras",
  "Lácteos",
  "Carne",
  "Pescado",
  "Panadería",
  "Bebidas",
  "Congelados",
  "Limpieza",
  "Farmacia",
  "Otros",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export const SHOPPING_PRIORITIES = ["urgente", "normal", "sin_prisa"] as const;
export type ShoppingPriority = (typeof SHOPPING_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<ShoppingPriority, string> = {
  urgente: "Urgente",
  normal: "Normal",
  sin_prisa: "Sin prisa",
};

export const PRIORITY_RANK: Record<ShoppingPriority, number> = {
  urgente: 0,
  normal: 1,
  sin_prisa: 2,
};

export function normalizePriority(value?: string | null): ShoppingPriority {
  return SHOPPING_PRIORITIES.includes(value as ShoppingPriority)
    ? (value as ShoppingPriority)
    : "normal";
}

function plain(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Keyword rules applied to the product name and to catalog category strings. */
const CATEGORY_RULES: Array<[RegExp, ShoppingCategory]> = [
  [/congelad|helad/, "Congelados"],
  [/leche|yogur|queso|lacteo|mantequilla|nata|batido|kefir|cuajada/, "Lácteos"],
  [/fruta|manzana|platano|banana|naranja|pera|uva|fresa|melon|sandia|kiwi|limon|mandarina|aguacate/, "Frutas"],
  [/verdura|hortaliza|ensalada|lechuga|tomate|zanahoria|cebolla|patata|pimiento|calabacin|brocoli|esparrago|champinon|pepino|ajo/, "Verduras"],
  [/carne|pollo|ternera|cerdo|pavo|cordero|jamon|chorizo|salchich|embutido|bacon|hamburgues|huevo/, "Carne"],
  [/pescado|marisco|atun|salmon|merluza|bacalao|gamba|langostino|mejillon|calamar|sardina|anchoa/, "Pescado"],
  [/pan\b|panaderia|bolleria|croissant|magdalena|bizcocho|tostada|reposteria|pasteleria|galleta/, "Panadería"],
  [/bebida|agua|zumo|refresco|cerveza|vino|cafe|infusion|te\b|licor|alcohol|sidra/, "Bebidas"],
  [/limpieza|detergente|lejia|suavizante|friegaplatos|lavavajillas|limpiacristales|bayeta|estropajo|papel higienico|servilleta|fregasuelos|droguer/, "Limpieza"],
  [/farmacia|medicament|parafarmacia|ibuprofen|paracetamol|jarabe|vitamina|tirita|mascarilla quirurg/, "Farmacia"],
];

function matchRules(text: string): ShoppingCategory | null {
  const value = plain(text);
  if (!value) return null;
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(value)) return category;
  }
  return null;
}

/**
 * Guesses the app category for a product using, in order:
 * the store catalog category, then keywords in the product name.
 * Falls back to "Otros".
 */
export function guessShoppingCategory(
  name: string,
  catalogCategory?: string | null,
): ShoppingCategory {
  if (catalogCategory) {
    const exact = SHOPPING_CATEGORIES.find(
      (category) => plain(category) === plain(catalogCategory),
    );
    if (exact) return exact;
    const byRule = matchRules(catalogCategory);
    if (byRule) return byRule;
  }
  return matchRules(name) ?? "Otros";
}

/** Display order of categories inside each store section. */
export function categorySortIndex(category: string): number {
  const index = SHOPPING_CATEGORIES.indexOf(category as ShoppingCategory);
  if (index === -1) return SHOPPING_CATEGORIES.length; // unknown labels before "Otros" fallback
  return index;
}
