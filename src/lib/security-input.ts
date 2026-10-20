export function csvSafeCell(value: string | number) {
  if (typeof value !== "string") return value;
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}
