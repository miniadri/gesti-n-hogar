export const INVENTORY_LOCATIONS = ["Frigorífico", "Congelador", "Armario"] as const;
export type InventoryLocation = (typeof INVENTORY_LOCATIONS)[number];

export function suggestLocation(category?: string | null): InventoryLocation {
  const c = (category || "").toLowerCase();
  if (c === "congelados" || c.includes("congel")) return "Congelador";
  if (["lácteos", "lacteos", "carne", "pescado", "frutas", "verduras"].includes(c)) {
    return "Frigorífico";
  }
  return "Armario";
}
