import {
  AlertTriangle,
  CalendarDays,
  Camera,
  ChefHat,
  ListTodo,
  Pill,
  Refrigerator,
  Settings,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type KioskModuleKey =
  | "scan"
  | "shopping"
  | "inventory"
  | "tasks"
  | "recipes"
  | "health"
  | "calendar"
  | "sos"
  | "settings";

export type KioskModule = {
  key: KioskModuleKey;
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  tone: "primary" | "green" | "blue" | "amber" | "rose" | "slate" | "red";
  defaultVisible: boolean;
};

export const KIOSK_MEMBER_NAME = "Kiosko cocina";
export const KIOSK_ACTIVE_KEY = "homesync:kiosk-active";
export const KIOSK_VISIBLE_MODULES_KEY = "homesync:kiosk-visible-modules";

export const KIOSK_MODULES: KioskModule[] = [
  {
    key: "scan",
    title: "Escanear",
    description: "Cámara o lector USB",
    to: "/inventory/kitchen",
    icon: Camera,
    tone: "primary",
    defaultVisible: true,
  },
  {
    key: "shopping",
    title: "Compra",
    description: "Añadir, quitar y marcar",
    to: "/shopping",
    icon: ShoppingCart,
    tone: "green",
    defaultVisible: true,
  },
  {
    key: "inventory",
    title: "Inventario",
    description: "Mover y descontar stock",
    to: "/inventory",
    icon: Refrigerator,
    tone: "blue",
    defaultVisible: true,
  },
  {
    key: "tasks",
    title: "Tareas",
    description: "Lavadora, limpieza y encargos",
    to: "/tasks",
    icon: ListTodo,
    tone: "slate",
    defaultVisible: true,
  },
  {
    key: "recipes",
    title: "Recetas",
    description: "Modo cocina y recetas guardadas",
    to: "/recipes",
    icon: ChefHat,
    tone: "amber",
    defaultVisible: true,
  },
  {
    key: "health",
    title: "Salud",
    description: "Medicación y tomas",
    to: "/medications",
    icon: Pill,
    tone: "rose",
    defaultVisible: true,
  },
  {
    key: "calendar",
    title: "Calendario",
    description: "Eventos y cuadrante",
    to: "/calendar",
    icon: CalendarDays,
    tone: "slate",
    defaultVisible: true,
  },
  {
    key: "sos",
    title: "SOS",
    description: "Emergencia con ubicación",
    to: "/settings/emergency",
    icon: AlertTriangle,
    tone: "red",
    defaultVisible: true,
  },
  {
    key: "settings",
    title: "Ajustes",
    description: "Notificaciones y sistema",
    to: "/settings",
    icon: Settings,
    tone: "slate",
    defaultVisible: false,
  },
];

export function getDefaultKioskVisibleModules() {
  return KIOSK_MODULES.filter((module) => module.defaultVisible).map((module) => module.key);
}

export function readKioskVisibleModules(): KioskModuleKey[] {
  if (typeof window === "undefined") return getDefaultKioskVisibleModules();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KIOSK_VISIBLE_MODULES_KEY) || "[]");
    if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultKioskVisibleModules();
    const valid = new Set(KIOSK_MODULES.map((module) => module.key));
    const filtered = parsed.filter((key): key is KioskModuleKey => valid.has(key));
    return filtered.length ? filtered : getDefaultKioskVisibleModules();
  } catch {
    return getDefaultKioskVisibleModules();
  }
}

export function writeKioskVisibleModules(keys: KioskModuleKey[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KIOSK_VISIBLE_MODULES_KEY, JSON.stringify(keys));
}

export function kioskSearch() {
  return { kiosk: "1" } as any;
}
