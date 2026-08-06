/**
 * Pure medication stock calculations shared by the medication server functions.
 */

/** Stock left after taking one dose. Never goes below zero. */
export function stockAfterIntake(current: number | null | undefined, dose: number): number {
  return Math.max(0, (current ?? 0) - dose);
}

/** Stock restored after undoing a taken dose, capped at the total quantity when known. */
export function stockAfterUndo(
  current: number | null | undefined,
  dose: number,
  total?: number | null,
): number {
  const restored = (current ?? 0) + dose;
  return total != null ? Math.min(total, restored) : restored;
}

/** Whether the remaining stock has reached the configured low-stock threshold. */
export function isLowStock(
  current: number | null | undefined,
  threshold: number | null | undefined,
): boolean {
  if (threshold == null || current == null) return false;
  return current <= threshold;
}
