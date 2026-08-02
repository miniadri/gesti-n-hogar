const PRODUCT_CODE_LENGTHS = new Set([8, 12, 13, 14]);

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function hasValidCheckDigit(code: string): boolean {
  if (!PRODUCT_CODE_LENGTHS.has(code.length) || !/^\d+$/.test(code)) return false;

  const digits = code.split("").map(Number);
  const checkDigit = digits.pop();
  if (checkDigit == null) return false;

  let sum = 0;
  for (let i = digits.length - 1, position = 0; i >= 0; i -= 1, position += 1) {
    sum += digits[i] * (position % 2 === 0 ? 3 : 1);
  }

  return (10 - (sum % 10)) % 10 === checkDigit;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function extractProductCode(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  const candidates: string[] = [];
  const decodedValues = unique([
    raw,
    (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })(),
  ]);

  for (const value of decodedValues) {
    const compactDigits = onlyDigits(value);
    if (PRODUCT_CODE_LENGTHS.has(compactDigits.length)) {
      candidates.push(compactDigits);
    }

    try {
      const url = new URL(value);
      for (const key of ["ean", "gtin", "barcode", "code", "product", "product_code"]) {
        const param = url.searchParams.get(key);
        if (param) candidates.push(onlyDigits(param));
      }
    } catch {
      // Not every scan is a URL.
    }

    const gs1Matches = value.matchAll(/(?:\(01\)|\]d2\s*01|^01)(\d{14})/gi);
    for (const match of gs1Matches) {
      candidates.push(match[1]);
    }

    const numericRuns = value.match(/\d{8,18}/g) ?? [];
    for (const run of numericRuns) {
      for (const length of [14, 13, 12, 8]) {
        if (run.length === length) candidates.push(run);
        if (run.length > length) {
          candidates.push(run.slice(0, length), run.slice(-length));
        }
      }
    }
  }

  const normalizedCandidates = unique(
    candidates.flatMap((candidate) => {
      const strippedToEan8 = candidate.replace(/^0+(\d{8})$/, "$1");
      return strippedToEan8 === candidate ? [candidate] : [candidate, strippedToEan8];
    }),
  );

  return normalizedCandidates.find(hasValidCheckDigit) ?? null;
}

export function normalizeProductCode(rawValue: string): string {
  const code = extractProductCode(rawValue);
  if (!code) {
    throw new Error(
      "El QR escaneado no contiene un EAN/UPC/GTIN de producto válido. Prueba con el código de barras del envase o introdúcelo manualmente.",
    );
  }
  return code;
}
