export const INVENTORY_LABEL_TYPES = ["fridge", "freezer", "pantry", "medicine", "general"] as const;

export type InventoryLabelType = (typeof INVENTORY_LABEL_TYPES)[number];

export const INVENTORY_LABEL_TYPE_INFO: Record<InventoryLabelType, { prefix: string; label: string; description: string }> = {
  fridge: { prefix: "FRI", label: "Frigorífico", description: "Para recipientes o accesos rápidos de frigorífico" },
  freezer: { prefix: "CON", label: "Congelador", description: "Para bolsas y recipientes de congelador" },
  pantry: { prefix: "PAN", label: "Armario", description: "Para despensa, botes y alimentos secos" },
  medicine: { prefix: "MED", label: "Medicina", description: "Reservado para futuras acciones de Salud" },
  general: { prefix: "GEN", label: "General", description: "Para productos o recipientes sin ubicación fija" },
};

const LABEL_CODE = /^HS-(FRI|CON|PAN|MED|GEN)-(\d{4,})$/i;

/** Extracts a HomeSync label from raw QR text or a future /scan/<code> URL. */
export function normalizeInventoryLabelCode(raw: string): string | null {
  const value = raw.trim();
  const candidate = (() => {
    try {
      const url = new URL(value);
      return url.pathname.split("/").filter(Boolean).at(-1) ?? value;
    } catch {
      return value;
    }
  })();
  const match = candidate.toUpperCase().match(LABEL_CODE);
  return match ? `HS-${match[1]}-${match[2]}` : null;
}
