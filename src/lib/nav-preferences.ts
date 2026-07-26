import { useEffect, useState, useCallback } from "react";

export type NavKey =
  | "dashboard"
  | "tasks"
  | "calendar"
  | "shopping"
  | "inventory"
  | "recipes"
  | "finances"
  | "devices"
  | "medications"
  | "loyalty";

export const DEFAULT_NAV_ORDER: NavKey[] = [
  "dashboard",
  "tasks",
  "calendar",
  "shopping",
  "inventory",
  "recipes",
  "finances",
  "devices",
  "medications",
  "loyalty",
];

export interface NavPreferences {
  order: NavKey[];
  hidden: NavKey[];
}

const STORAGE_KEY = "homesync:nav-preferences:v1";
const EVENT = "homesync:nav-preferences-changed";

const DEFAULTS: NavPreferences = { order: DEFAULT_NAV_ORDER, hidden: [] };

function readFromStorage(): NavPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<NavPreferences>;
    const known = new Set<NavKey>(DEFAULT_NAV_ORDER);
    const order = Array.isArray(parsed.order)
      ? (parsed.order.filter((k): k is NavKey => known.has(k as NavKey)))
      : [];
    // append any missing keys at the end so newly-added routes still appear
    for (const k of DEFAULT_NAV_ORDER) if (!order.includes(k)) order.push(k);
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((k): k is NavKey => known.has(k as NavKey))
      : [];
    return { order, hidden };
  } catch {
    return DEFAULTS;
  }
}

function writeToStorage(prefs: NavPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useNavPreferences() {
  const [prefs, setPrefs] = useState<NavPreferences>(DEFAULTS);

  useEffect(() => {
    setPrefs(readFromStorage());
    const handler = () => setPrefs(readFromStorage());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = useCallback((next: NavPreferences) => {
    writeToStorage(next);
    setPrefs(next);
  }, []);

  const toggleHidden = useCallback((key: NavKey) => {
    const current = readFromStorage();
    const hidden = current.hidden.includes(key)
      ? current.hidden.filter((k) => k !== key)
      : [...current.hidden, key];
    update({ ...current, hidden });
  }, [update]);

  const move = useCallback((key: NavKey, direction: -1 | 1) => {
    const current = readFromStorage();
    const idx = current.order.indexOf(key);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= current.order.length) return;
    const order = [...current.order];
    [order[idx], order[target]] = [order[target], order[idx]];
    update({ ...current, order });
  }, [update]);

  const reset = useCallback(() => update(DEFAULTS), [update]);

  return { prefs, update, toggleHidden, move, reset };
}
