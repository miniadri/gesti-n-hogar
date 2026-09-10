const MEDICATION_TIME_RE = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

export function normalizeMedicationTime(value: string) {
  const match = MEDICATION_TIME_RE.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : value;
}

