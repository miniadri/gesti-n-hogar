import {
  CycleDataSchema,
  EMPTY_CYCLE,
  validateCycleEntries,
  type CycleData,
} from "./family-features";

function openCycleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("homesync-personal-health", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("cycles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("No se puede abrir el almacenamiento local"));
  });
}

export async function readCycleLocal(owner: string, household: string): Promise<CycleData> {
  const database = await openCycleDB();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("cycles", "readonly");
      const request = transaction.objectStore("cycles").get(`${owner}:${household}`);
      transaction.oncomplete = () => {
        const parsed = CycleDataSchema.safeParse(request.result ?? EMPTY_CYCLE);
        if (parsed.success) {
          try {
            validateCycleEntries(parsed.data.entries);
            resolve(parsed.data);
          } catch {
            reject(new Error("Los registros locales se solapan; no se han sobrescrito"));
          }
        } else reject(new Error("Los datos locales no son válidos; no se han sobrescrito"));
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveCycleLocal(
  owner: string,
  household: string,
  value: CycleData | null,
  expected?: CycleData,
) {
  const parsed = value === null ? null : CycleDataSchema.parse(value);
  if (parsed) validateCycleEntries(parsed.entries);
  const database = await openCycleDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("cycles", "readwrite");
      const store = transaction.objectStore("cycles");
      const key = `${owner}:${household}`;
      const current = store.get(key);
      let conflict = false;
      current.onsuccess = () => {
        try {
          if (
            expected &&
            JSON.stringify(CycleDataSchema.parse(current.result ?? EMPTY_CYCLE)) !==
              JSON.stringify(CycleDataSchema.parse(expected))
          ) {
            conflict = true;
            transaction.abort();
            return;
          }
          if (parsed === null) store.delete(key);
          else store.put(parsed, key);
        } catch {
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          new Error(
            conflict
              ? "Otro panel cambió estos registros. Cierra y vuelve a abrir Ciclo antes de guardar; no se han sobrescrito."
              : "No se han guardado los datos locales",
          ),
        );
    });
  } finally {
    database.close();
  }
}
