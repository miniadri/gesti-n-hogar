/**
 * A dose can only be marked taken or skipped shortly before it is due.  Keeping
 * this rule in a small shared module makes the UI and server use the same
 * boundary and avoids accidental confirmations of a later dose.
 */
export const MEDICATION_INTAKE_ACTION_WINDOW_MS = 60 * 60 * 1000;

export function canRecordMedicationIntake(scheduledFor: string | Date, now = new Date()): boolean {
  const scheduledAt = new Date(scheduledFor).getTime();
  if (Number.isNaN(scheduledAt)) return false;
  return now.getTime() >= scheduledAt - MEDICATION_INTAKE_ACTION_WINDOW_MS;
}
