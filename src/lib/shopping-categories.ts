/** Shared category + priority helpers for the shopping list. */

export const SHOPPING_CATEGORIES = [
  "Frutas",
  "Verduras",
  "Lácteos",
  "Carne",
  "Pescado",
  "Panadería/Bollería",
  "Bebidas",
  "Congelados",
  "Limpieza",
  "Higiene",
  "Farmacia/Parafarmacia",
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
  [/pan\b|panaderia|bolleria|croissant|magdalena|bizcocho|tostada|reposteria|pasteleria|galleta/, "Panadería/Bollería"],
  [/bebida|agua|zumo|refresco|cerveza|vino|cafe|infusion|te\b|licor|alcohol|sidra/, "Bebidas"],
  [/limpieza|detergente|lejia|suavizante|friegaplatos|lavavajillas|limpiacristales|bayeta|estropajo|papel higienico|servilleta|fregasuelos|droguer/, "Limpieza"],
  [/higiene|desodorante|jabon|gel|champu|acondicionador|dentifrico|pasta de dientes|cepillo de dientes|hilo dental|afeitadora|coton|bastoncillo|panales|compresa|salvaslip|proteccion femenina|afeit|bano|aseo/, "Higiene"],
  [/farmacia|medicament|parafarmacia|ibuprofen|paracetamol|jarabe|vitamina|tirita|mascarilla quirurg/, "Farmacia/Parafarmacia"],
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

/** Soft color chips for each shopping category. */
export const CATEGORY_COLORS: Record<ShoppingCategory, string> = {
  Frutas: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Verduras: "bg-green-500/15 text-green-700 dark:text-green-300",
  Lácteos: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Carne: "bg-red-500/15 text-red-700 dark:text-red-300",
  Pescado: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  Panadería: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Bebidas: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  Congelados: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  Limpieza: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  Farmacia: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  Otros: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};
