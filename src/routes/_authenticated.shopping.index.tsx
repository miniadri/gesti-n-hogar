import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Store,
  ScanLine,
  Check,
  Package,
  Milk,
  Apple,
  Beef,
  Fish,
  Cookie,
  Droplets,
  Wine,
  Pill,
  ShoppingBag,
  CreditCard,
  Carrot,
  Croissant,
  Egg,
  SprayCan,
  Baby,
  Dog,
  Shirt,
  ArrowUp,
  ArrowDown,
  AlarmClock,
  Hourglass,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useServerFn } from "@tanstack/react-start";
import {
  listStores,
  ensureDefaultLists,
  listShoppingItems,
  listRecentItems,
  createStore,
  updateStorePreferences,
  reorderStores,
  createShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
  restoreShoppingItem,
  addInventorySuggestionToShopping,
  updateShoppingItemPriority,
} from "@/lib/shopping.functions";
import {
  SHOPPING_CATEGORIES,
  SHOPPING_PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_RANK,
  categorySortIndex,
  guessShoppingCategory,
  normalizePriority,
  type ShoppingPriority,
} from "@/lib/shopping-categories";
import { listHouseholdActivity } from "@/lib/activity.functions";
import { ActivityList } from "@/components/ActivityList";
import { undoableToast } from "@/hooks/use-undoable";
import { listMedicines, updateMedicine } from "@/lib/medicines.functions";
import { createInventoryItem, listInventory } from "@/lib/inventory.functions";
import { INVENTORY_LOCATIONS, suggestLocation } from "@/lib/inventory-locations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { comparePrices, type PriceQuote } from "@/lib/prices.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Euro } from "lucide-react";
import {
  StoreProductAutocomplete,
  StoreProductLink,
  type StoreProductSuggestion,
} from "@/components/MercadonaAutocomplete";

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Lácteos: Milk,
  Frutas: Apple,
  Verduras: Carrot,
  Carne: Beef,
  Pescado: Fish,
  Panadería: Croissant,
  Bebidas: Droplets,
  Alcohol: Wine,
  Farmacia: Pill,
  Congelados: SnowflakeIcon,
  Limpieza: SprayCan,
  Bebé: Baby,
  Mascotas: Dog,
  Ropa: Shirt,
  default: Package,
};

const keywordIcons: Array<[RegExp, React.ComponentType<{ className?: string }>]> = [
  [/leche|yogur|queso|lacteo|lácteo/i, Milk],
  [/manzana|platano|plátano|naranja|fruta/i, Apple],
  [/zanahoria|tomate|lechuga|verdura|ensalada/i, Carrot],
  [/huevo/i, Egg],
  [/pan|croissant|bolleria|bollería/i, Croissant],
  [/pollo|ternera|carne|jamon|jamón/i, Beef],
  [/pescado|atun|atún|salmon|salmón/i, Fish],
  [/galleta|chocolate|dulce/i, Cookie],
  [/agua|zumo|refresco|bebida/i, Droplets],
  [/detergente|limpieza|lejia|lejía|suavizante/i, SprayCan],
  [/pañal|toallita|bebe|bebé/i, Baby],
  [/perro|gato|mascota/i, Dog],
];

function iconForShoppingItem(item: { name?: string; category?: string | null }) {
  const byCategory = item.category ? categoryIcons[item.category] : null;
  if (byCategory) return byCategory;
  const name = item.name ?? "";
  return keywordIcons.find(([pattern]) => pattern.test(name))?.[1] ?? Package;
}

function isNoStore(store: any) {
  return /sin\s*tienda/i.test(store?.name ?? "");
}

function isOfficialStore(store: any, source?: string) {
  if (source) return store?.official_source === source;
  return Boolean(store?.official_source);
}

function isStoreEnabled(store: any) {
  return store?.is_enabled !== false;
}

function storeSourceLabel(source?: string | null) {
  if (source === "mercadona") return "Mercadona";
  if (source === "dia") return "Día";
  if (source === "consum") return "Consum";
  if (source === "carrefour") return "Carrefour";
  return "tienda";
}

function SnowflakeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </svg>
  );
}

const categories = [...SHOPPING_CATEGORIES];

const shoppingQueryOptions = queryOptions({
  queryKey: ["shopping"],
  queryFn: async () => {
    await ensureDefaultLists();
    const [stores, items, recent, medicines, inventory] = await Promise.all([
      listStores(),
      listShoppingItems(),
      listRecentItems(),
      listMedicines(),
      listInventory(),
    ]);
    const names = Array.from(new Set((items ?? []).map((i: any) => i.name).filter(Boolean)));
    const [prices, activity] = await Promise.all([
      names.length > 0 ? comparePrices({ data: { names } }) : Promise.resolve({} as Record<string, PriceQuote[]>),
      listHouseholdActivity({ data: { limit: 10 } }),
    ]);
    return { stores, items, recent, medicines, inventory, prices, activity };
  },
});


export const Route = createFileRoute("/_authenticated/shopping/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(shoppingQueryOptions),
  head: () => ({
    meta: [{ title: "Lista de compra - HomeSync" }],
  }),
  component: ShoppingPage,
});

function ShoppingPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(shoppingQueryOptions);
  const [addOpen, setAddOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shopping"] });
    queryClient.invalidateQueries({ queryKey: ["household-activity"] });
  };

  const grouped = data.stores
    .map((store) => ({
      store,
      items: data.items.filter((item) => item.shopping_list?.store_id === store.id),
    }))
    // Only show stores that actually have pending items; keep "Sin tienda" pinned on top.
    .filter(({ items }) => items.length > 0)
    .sort((a, b) => {
      if (isNoStore(a.store)) return -1;
      if (isNoStore(b.store)) return 1;
      const orderA = a.store.sort_order ?? 100;
      const orderB = b.store.sort_order ?? 100;
      if (orderA !== orderB) return orderA - orderB;
      return a.store.name.localeCompare(b.store.name);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lista de compra</h2>
          <p className="text-muted-foreground">Organizada por tienda, estilo Bring!</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Añadir
          </Button>
          <Button variant="outline" asChild>
            <Link to="/shopping/scan-ticket">
              <ScanLine className="mr-2 h-4 w-4" />
              Escanear ticket
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setStoreOpen(true)}>
            <Store className="mr-2 h-4 w-4" />
            Gestionar tiendas
          </Button>
          <Button variant="outline" asChild>
            <Link to="/loyalty">
              <CreditCard className="mr-2 h-4 w-4" />
              Tarjetas
            </Link>
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Tu lista de compra está vacía. Pulsa <strong>Añadir</strong> para empezar.
        </div>
      ) : (
        grouped.map(({ store, items }) => (
          <section key={store.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">{store.name}</h3>
              <Badge variant="secondary" className="ml-auto">
                {items.length} pendientes
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => (
                <ShoppingItemCard
                  key={item.id}
                  item={item}
                  onChange={refresh}
                  quotes={data.prices[normalizeKey(item.name)] ?? []}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <SmartShoppingSuggestions
        inventory={data.inventory}
        activeNames={new Set(data.items.map((i: any) => normalizeKey(i.name)))}
        onAdded={refresh}
      />

      <PharmacySection medicines={data.medicines} />

      <RecentItemsSection
        recent={data.recent}
        activeNames={new Set(data.items.map((i: any) => i.name.toLowerCase()))}
        onAdded={refresh}
      />

      <ActivityList
        title="Actividad reciente de compra e inventario"
        items={data.activity ?? []}
        empty="Cuando alguien añada productos, marque compras o escanee tickets, aparecerá aquí."
      />

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} stores={data.stores} onAdded={refresh} />
      <ManageStoresDialog open={storeOpen} onOpenChange={setStoreOpen} stores={data.stores} onChange={refresh} />
    </div>
  );
}

function SmartShoppingSuggestions({
  inventory,
  activeNames,
  onAdded,
}: {
  inventory: any[];
  activeNames: Set<string>;
  onAdded: () => void;
}) {
  const doAddSuggestion = useServerFn(addInventorySuggestionToShopping);
  const [busy, setBusy] = useState<string | null>(null);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const soon = new Date(todayStart);
  soon.setDate(soon.getDate() + 7);

  const suggestions = inventory
    .map((item: any) => {
      const quantity = Number(item.quantity ?? 0);
      const minStock = Number(item.min_stock ?? 0);
      const low = minStock > 0 && quantity <= minStock;
      const expiry = item.expiry_date ? new Date(`${item.expiry_date}T00:00:00`) : null;
      const expired = Boolean(expiry && expiry < todayStart);
      const expiring = Boolean(expiry && expiry >= todayStart && expiry <= soon);
      const alreadyListed = activeNames.has(normalizeKey(item.name));
      if ((!low && !expired && !expiring) || alreadyListed) return null;
      const reason = expired
        ? "Caducado"
        : expiring
          ? "Caduca pronto"
          : "Stock crítico";
      const detail = expired || expiring
        ? item.expiry_date
          ? new Date(`${item.expiry_date}T00:00:00`).toLocaleDateString("es-ES")
          : ""
        : `${quantity}/${minStock} ${item.unit || "ud."}`;
      const priority = expired ? 0 : low ? 1 : 2;
      return { item, reason, detail, priority };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.priority - b.priority || a.item.name.localeCompare(b.item.name))
    .slice(0, 12);

  if (suggestions.length === 0) return null;

  const handleAdd = async (inventoryItemId: string) => {
    setBusy(inventoryItemId);
    try {
      const res: any = await doAddSuggestion({ data: { inventory_item_id: inventoryItemId } });
      if (res.duplicate) toast.info("Ya estaba en la lista");
      else toast.success("Añadido a la lista");
      onAdded();
    } catch (err: any) {
      toast.error(err.message || "No se pudo añadir a la lista");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
        <h3 className="font-semibold">Sugerencias inteligentes</h3>
        <span className="text-xs text-muted-foreground">
          Stock crítico y productos próximos a caducar
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {suggestions.map(({ item, reason, detail }: any) => {
          const Icon = iconForShoppingItem(item);
          return (
            <button
              key={item.id}
              onClick={() => handleAdd(item.id)}
              disabled={busy === item.id}
              className={cn(
                "group flex flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center transition-all",
                "hover:border-primary hover:bg-accent disabled:opacity-50",
              )}
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <span className="line-clamp-2 text-xs font-semibold leading-tight">{item.name}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                {reason}
              </span>
              {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21.7 18.6-8.5-15a1.4 1.4 0 0 0-2.4 0l-8.5 15A1.4 1.4 0 0 0 3.5 21h17a1.4 1.4 0 0 0 1.2-2.4Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function RecentItemsSection({
  recent,
  activeNames,
  onAdded,
}: {
  recent: any[];
  activeNames: Set<string>;
  onAdded: () => void;
}) {
  const doCreate = useServerFn(createShoppingItem);
  const [busy, setBusy] = useState<string | null>(null);

  // Dedupe: keep the most recent per name (case-insensitive), skip items already on the active list.
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const it of recent) {
    const key = it.name.trim().toLowerCase();
    if (seen.has(key) || activeNames.has(key)) continue;
    seen.add(key);
    unique.push(it);
    if (unique.length >= 24) break;
  }

  if (unique.length === 0) return null;

  const handleReadd = async (it: any) => {
    const listId = it.shopping_list?.id;
    if (!listId) return;
    setBusy(it.id);
    try {
      await doCreate({
        data: {
          shopping_list_id: listId,
          name: it.name,
          category: it.category ?? undefined,
          quantity: 1,
          unit: it.unit ?? undefined,
        },
      });
      onAdded();
    } catch (err: any) {
      toast.error(err.message || "No se pudo añadir el producto");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 border-t pt-6">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">Comprado recientemente</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          Toca para añadirlo de nuevo
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {unique.map((it) => {
          const Icon = iconForShoppingItem(it);
          return (
            <button
              key={it.id}
              onClick={() => handleReadd(it)}
              disabled={busy === it.id}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-xl border bg-card p-2 text-center transition-all",
                "hover:border-primary hover:bg-accent disabled:opacity-50",
              )}
              title={it.shopping_list?.store?.name ?? ""}
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                {it.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ShoppingItemCard({
  item,
  onChange,
  quotes = [],
}: {
  item: any;
  onChange: () => void;
  quotes?: PriceQuote[];
}) {
  const doToggle = useServerFn(toggleShoppingItem);
  const doDelete = useServerFn(deleteShoppingItem);
  const doRestore = useServerFn(restoreShoppingItem);
  const doCreateInv = useServerFn(createInventoryItem);
  const [checked, setChecked] = useState(item.checked);
  const [locationOpen, setLocationOpen] = useState(false);
  const [location, setLocation] = useState<string>(suggestLocation(item.category));
  const [savingInv, setSavingInv] = useState(false);

  const confirmCheck = async (opts: { addToInventory: boolean }) => {
    setSavingInv(true);
    try {
      if (opts.addToInventory) {
        await doCreateInv({
          data: {
            name: item.name,
            mercadona_id: item.mercadona_id ?? undefined,
            image_url: item.image_url ?? undefined,
            category: item.category || undefined,
            quantity: Number(item.quantity) || 1,
            unit: item.unit || undefined,
            location,
          },
        });
      }
      await doToggle({ data: { id: item.id, checked: true } });
      setChecked(true);
      setLocationOpen(false);
      onChange();
      if (opts.addToInventory) toast.success("Añadido al inventario");
    } catch {
      toast.error("No se pudo completar la acción");
    } finally {
      setSavingInv(false);
    }
  };

  const handleToggle = async () => {
    if (!checked) {
      setLocation(suggestLocation(item.category));
      setLocationOpen(true);
      return;
    }
    // uncheck: just toggle back
    setChecked(false);
    try {
      await doToggle({ data: { id: item.id, checked: false } });
      onChange();
    } catch {
      setChecked(true);
      toast.error("No se pudo actualizar el producto");
    }
  };

  const handleDelete = async () => {
    try {
      const snapshot = { ...item };
      delete (snapshot as any).shopping_list;
      await doDelete({ data: { id: item.id } });
      onChange();
      undoableToast({
        message: `"${item.name}" eliminado`,
        undo: async () => {
          await doRestore({ data: { row: snapshot } });
          onChange();
        },
      });
    } catch {
      toast.error("No se pudo eliminar el producto");
    }
  };

  const Icon = iconForShoppingItem(item);
  const price = item.manual_price ?? item.ocr_price;
  const cheapest = quotes[0];

  return (
    <>
      <Card
        className={cn(
          "relative overflow-hidden transition-all",
          checked && "opacity-60 grayscale",
        )}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={handleToggle}
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30",
              )}
            >
              {checked && <Check className="h-3.5 w-3.5" />}
            </button>
            <div className="flex items-center gap-1">
              {quotes.length > 0 && <PriceComparePopover name={item.name} quotes={quotes} />}
              <button onClick={handleDelete} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col items-center text-center">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                loading="lazy"
                className="h-12 w-12 rounded-2xl bg-secondary object-contain"
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                <Icon className="h-6 w-6" />
              </div>
            )}
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.quantity} {item.unit || "ud."}
            </p>
            {price !== null && price !== undefined && (
              <p className="mt-1 text-sm font-bold text-primary">€{Number(price).toFixed(2)}</p>
            )}
            {cheapest && (
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                Mejor: <span className="font-semibold text-foreground">€{cheapest.price.toFixed(2)}</span>{" "}
                en {cheapest.store_name}
              </p>
            )}
            {(item.store_product_url || item.mercadona_id) && (
              <StoreProductLink
                source={item.store_product_source ?? (item.mercadona_id ? "mercadona" : null)}
                productId={item.store_product_id ?? item.mercadona_id}
                url={item.store_product_url}
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                label={`Ver en ${storeSourceLabel(item.store_product_source ?? (item.mercadona_id ? "mercadona" : null))}`}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardar en el inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ¿Dónde vas a guardar <span className="font-medium text-foreground">{item.name}</span>?
            </p>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVENTORY_LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => confirmCheck({ addToInventory: true })}
              disabled={savingInv}
              className="w-full"
            >
              Añadir al inventario
            </Button>
            <Button
              variant="ghost"
              onClick={() => confirmCheck({ addToInventory: false })}
              disabled={savingInv}
              className="w-full"
            >
              Sólo tachar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddItemDialog({
  open,
  onOpenChange,
  stores,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stores: any[];
  onAdded: () => void;
}) {
  const doCreate = useServerFn(createShoppingItem);
  const doCreateStore = useServerFn(createStore);
  const [name, setName] = useState("");
  // "auto" keeps the category empty until we infer it from the catalog or the name.
  const [category, setCategory] = useState("auto");
  const [priority, setPriority] = useState<ShoppingPriority>("normal");
  const [storeId, setStoreId] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<StoreProductSuggestion | null>(null);

  const defaultStore = stores.find((s) => s.is_default) || stores[0];
  const enabledStores = stores.filter((store) => isNoStore(store) || !isOfficialStore(store) || isStoreEnabled(store));
  const selectableStores = enabledStores.length > 0 ? enabledStores : stores;
  const selectedStore = stores.find((store) => store.id === (storeId || defaultStore?.id));
  const officialStoresBySource = stores.reduce<Record<string, any>>((acc, store) => {
    if (store?.official_source) acc[store.official_source] = store;
    return acc;
  }, {});
  const activeOfficialSources = stores
    .filter((store) => isOfficialStore(store) && isStoreEnabled(store))
    .map((store) => store.official_source)
    .filter(Boolean) as StoreProductSuggestion["source"][];
  const catalogSources =
    selectedStore && isOfficialStore(selectedStore)
      ? ([selectedStore.official_source].filter(Boolean) as StoreProductSuggestion["source"][])
      : selectedStore && isNoStore(selectedStore)
        ? activeOfficialSources
        : [];
  const catalogSearchEnabled = catalogSources.length > 0;
  const disabledCatalogHint = selectedStore && !isNoStore(selectedStore) && !isOfficialStore(selectedStore)
    ? `La búsqueda de catálogo está filtrada por ${selectedStore.name}. Esta tienda aún no tiene integración.`
    : "No hay tiendas oficiales activas en este hogar.";

  const handleSelectCatalogProduct = (product: StoreProductSuggestion) => {
    setSelectedCatalogProduct(product);
    if (product.unit_price != null) setPrice(String(product.unit_price));
    if (product.category) setCategory(product.category);
    const sourceStore = officialStoresBySource[product.source];
    if (sourceStore) setStoreId(sourceStore.id);
  };

  /** Returns the active list id for the chosen store, creating the official store if needed. */
  const resolveListId = async () => {
    let targetStoreId = storeId || defaultStore?.id;
    if (selectedCatalogProduct && !storeId) {
      const sourceStore = officialStoresBySource[selectedCatalogProduct.source];
      if (sourceStore) {
        targetStoreId = sourceStore.id;
      } else {
        const created: any = await doCreateStore({ data: { name: selectedCatalogProduct.source_label } });
        targetStoreId = created?.id;
      }
    }
    let { data: lists } = await supabase
      .from("shopping_lists")
      .select("id")
      .eq("store_id", targetStoreId)
      .eq("is_archived", false);
    if (!lists?.[0]?.id) {
      await ensureDefaultLists();
      ({ data: lists } = await supabase
        .from("shopping_lists")
        .select("id")
        .eq("store_id", targetStoreId)
        .eq("is_archived", false));
    }
    return lists?.[0]?.id as string | undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const listId = await resolveListId();
      if (!listId) throw new Error("No list found");

      await doCreate({
        data: {
          shopping_list_id: listId,
          name: name.trim(),
          category,
          quantity: Number(quantity) || 1,
          manual_price: price ? Number(price) : undefined,
          mercadona_id: selectedCatalogProduct?.source === "mercadona" ? selectedCatalogProduct.id : undefined,
          store_product_source: selectedCatalogProduct?.source,
          store_product_id: selectedCatalogProduct?.id,
          store_product_url: selectedCatalogProduct?.share_url ?? undefined,
          store_product_brand: selectedCatalogProduct?.brand ?? undefined,
          image_url: selectedCatalogProduct?.thumbnail ?? undefined,
        },
      });
      toast.success("Producto añadido");
      setName("");
      setQuantity("1");
      setPrice("");
      setSelectedCatalogProduct(null);
      onAdded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir producto");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir producto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tienda</Label>
            <Select value={storeId || defaultStore?.id} onValueChange={(value) => {
              setStoreId(value);
              setSelectedCatalogProduct(null);
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectableStores
                  .slice()
                  .sort((a, b) => {
                    if (isNoStore(a)) return -1;
                    if (isNoStore(b)) return 1;
                    const orderA = a.sort_order ?? 100;
                    const orderB = b.sort_order ?? 100;
                    if (orderA !== orderB) return orderA - orderB;
                    return a.name.localeCompare(b.name);
                  })
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sin tienda busca en todas las tiendas activas disponibles.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-name">Producto</Label>
            <StoreProductAutocomplete
              id="item-name"
              placeholder="Ej. Leche entera"
              value={name}
              onValueChange={(v) => {
                setName(v);
                setSelectedCatalogProduct(null);
              }}
              onSelect={handleSelectCatalogProduct}
              sources={catalogSources}
              enabled={catalogSearchEnabled}
              disabledHint={disabledCatalogHint}
              plainOptionLabel="Añadir sin tienda"
              onPlainSelect={() => {
                setSelectedCatalogProduct(null);
                const noStore = stores.find((s) => isNoStore(s));
                if (noStore) setStoreId(noStore.id);
              }}
              autoFocus
            />
            {selectedCatalogProduct && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {selectedCatalogProduct.source_label} · {selectedCatalogProduct.brand ?? "producto"}
                <StoreProductLink
                  source={selectedCatalogProduct.source}
                  productId={selectedCatalogProduct.id}
                  url={selectedCatalogProduct.share_url}
                  label={`Abrir en ${selectedCatalogProduct.source_label}`}
                />
              </p>
            )}
          </div>


          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Precio (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting || !name.trim()} className="w-full">
              {submitting ? "Añadiendo..." : "Añadir a la lista"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageStoresDialog({
  open,
  onOpenChange,
  stores,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stores: any[];
  onChange: () => void;
}) {
  const doCreate = useServerFn(createStore);
  const doUpdatePreferences = useServerFn(updateStorePreferences);
  const doReorder = useServerFn(reorderStores);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingStoreId, setUpdatingStoreId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // "Sin tienda" stays pinned first; the rest follow the household order.
  const ordered = stores.slice().sort((a, b) => {
    if (isNoStore(a)) return -1;
    if (isNoStore(b)) return 1;
    const orderA = a.sort_order ?? 100;
    const orderB = b.sort_order ?? 100;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
  const sortable = ordered.filter((s) => !isNoStore(s));

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sortable.length) return;
    const next = sortable.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      await doReorder({ data: { ids: next.map((s) => s.id) } });
      onChange();
    } catch (err: any) {
      toast.error(err.message || "No se pudo reordenar");
    } finally {
      setReordering(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({ data: { name: name.trim() } });
      toast.success("Tienda añadida");
      setName("");
      onChange();
    } catch (err: any) {
      toast.error(err.message || "Error al crear tienda");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleOfficialStore = async (store: any, enabled: boolean) => {
    setUpdatingStoreId(store.id);
    try {
      await doUpdatePreferences({ data: { id: store.id, is_enabled: enabled } });
      toast.success(enabled ? `${store.name} activada` : `${store.name} desactivada`);
      onChange();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar tienda");
    } finally {
      setUpdatingStoreId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gestionar tiendas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            El orden de esta lista define el orden del buscador al añadir productos.
          </p>
          <ul className="space-y-2">
            {ordered.map((s) => {
              const sortIndex = sortable.findIndex((item) => item.id === s.id);
              return (
              <li key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                <span>
                  <span className="font-medium">{s.name}</span>
                  {isOfficialStore(s) && (
                    <span className="block text-xs text-muted-foreground">Catálogo automático</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {s.is_default && <Badge variant="outline">Por defecto</Badge>}
                  {isOfficialStore(s) ? (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {isStoreEnabled(s) ? "Usar" : "Oculta"}
                      </span>
                      <Switch
                        checked={isStoreEnabled(s)}
                        disabled={updatingStoreId === s.id}
                        onCheckedChange={(checked) => toggleOfficialStore(s, checked)}
                      />
                    </>
                  ) : null}
                  {sortIndex >= 0 && (
                    <span className="flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={reordering || sortIndex === 0}
                        onClick={() => move(sortIndex, -1)}
                        aria-label={`Subir ${s.name}`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={reordering || sortIndex === sortable.length - 1}
                        onClick={() => move(sortIndex, 1)}
                        aria-label={`Bajar ${s.name}`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </span>
                  )}
                </span>
              </li>
              );
            })}
          </ul>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              placeholder="Nueva tienda"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={submitting || !name.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PharmacySection({ medicines }: { medicines: any[] }) {
  const queryClient = useQueryClient();
  const doUpdate = useServerFn(updateMedicine);
  const toBuy = medicines.filter((m) => m.needs_purchase);

  if (toBuy.length === 0) return null;

  const markBought = async (m: any) => {
    try {
      await doUpdate({ data: { id: m.id, needs_purchase: false } });
      queryClient.invalidateQueries({ queryKey: ["shopping"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Medicina marcada como comprada");
    } catch {
      toast.error("No se pudo actualizar");
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Pill className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold uppercase tracking-wide">Farmacia</h3>
        <Badge variant="secondary" className="ml-auto">{toBuy.length} pendientes</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {toBuy.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => markBought(m)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-muted-foreground/30 hover:border-primary"
                  title="Marcar como comprada"
                >
                  <Check className="h-3.5 w-3.5 opacity-0 hover:opacity-100" />
                </button>
              </div>
              <div className="mt-3 flex flex-col items-center text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                  <Pill className="h-6 w-6" />
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight">{m.name}</p>
                {m.note && <p className="line-clamp-2 text-xs text-muted-foreground">{m.note}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function PriceComparePopover({ name, quotes }: { name: string; quotes: PriceQuote[] }) {
  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return "";
    }
  };
  const cheapest = quotes[0]?.price;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground hover:text-primary"
          title="Comparar precios entre tiendas"
          onClick={(e) => e.stopPropagation()}
        >
          <Euro className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="mb-2 text-sm font-semibold">{name}</p>
        {quotes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin historial de precios.</p>
        ) : (
          <ul className="space-y-1.5">
            {quotes.map((q, i) => (
              <li
                key={`${q.store_id ?? "none"}-${i}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs",
                  q.price === cheapest ? "bg-primary/10" : "bg-muted/40",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{q.store_name}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtDate(q.date)}</p>
                </div>
                <span className={cn("font-bold tabular-nums", q.price === cheapest && "text-primary")}>
                  €{q.price.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Basado en tus tickets escaneados.
        </p>
      </PopoverContent>
    </Popover>
  );
}
