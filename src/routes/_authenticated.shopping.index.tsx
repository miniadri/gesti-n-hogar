import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
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
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
import { useServerFn } from "@tanstack/react-start";
import {
  listStores,
  ensureDefaultLists,
  listShoppingItems,
  listRecentItems,
  createStore,
  createShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
} from "@/lib/shopping.functions";
import { listMedicines, updateMedicine } from "@/lib/medicines.functions";
import { createInventoryItem } from "@/lib/inventory.functions";
import { INVENTORY_LOCATIONS, suggestLocation } from "@/lib/inventory-locations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Lácteos: Milk,
  Frutas: Apple,
  Verduras: Apple,
  Carne: Beef,
  Pescado: Fish,
  Panadería: Cookie,
  Bebidas: Droplets,
  Alcohol: Wine,
  Farmacia: Pill,
  Congelados: SnowflakeIcon,
  default: Package,
};

function SnowflakeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </svg>
  );
}

const categories = [
  "Frutas",
  "Verduras",
  "Lácteos",
  "Carne",
  "Pescado",
  "Panadería",
  "Bebidas",
  "Congelados",
  "Limpieza",
  "Farmacia",
  "Otros",
];

const shoppingQueryOptions = queryOptions({
  queryKey: ["shopping"],
  queryFn: async () => {
    await ensureDefaultLists();
    const [stores, items, recent] = await Promise.all([
      listStores(),
      listShoppingItems(),
      listRecentItems(),
    ]);
    return { stores, items, recent };
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["shopping"] });

  const isNoStore = (s: any) => /sin\s*tienda/i.test(s?.name ?? "");

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
                <ShoppingItemCard key={item.id} item={item} onChange={refresh} />
              ))}
            </div>
          </section>
        ))
      )}

      <RecentItemsSection
        recent={data.recent}
        activeNames={new Set(data.items.map((i: any) => i.name.toLowerCase()))}
        onAdded={refresh}
      />

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} stores={data.stores} onAdded={refresh} />
      <ManageStoresDialog open={storeOpen} onOpenChange={setStoreOpen} stores={data.stores} onChange={refresh} />
    </div>
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
          const Icon = categoryIcons[it.category || "default"] || Package;
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
}: {
  item: any;
  onChange: () => void;
}) {
  const doToggle = useServerFn(toggleShoppingItem);
  const doDelete = useServerFn(deleteShoppingItem);
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
      await doDelete({ data: { id: item.id } });
      onChange();
      toast.success("Producto eliminado");
    } catch {
      toast.error("No se pudo eliminar el producto");
    }
  };

  const Icon = categoryIcons[item.category || "default"] || Package;
  const price = item.manual_price ?? item.ocr_price;

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
            <button onClick={handleDelete} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-col items-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
              <Icon className="h-6 w-6" />
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.quantity} {item.unit || "ud."}
            </p>
            {price !== null && price !== undefined && (
              <p className="mt-1 text-sm font-bold text-primary">€{Number(price).toFixed(2)}</p>
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
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Otros");
  const [storeId, setStoreId] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const defaultStore = stores.find((s) => s.is_default) || stores[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const selectedStoreId = storeId || defaultStore?.id;
    const list = stores.find((s) => s.id === selectedStoreId)?.shopping_list;

    setSubmitting(true);
    try {
      // Find the active list for this store
      const { data: lists } = await supabase
        .from("shopping_lists")
        .select("id")
        .eq("store_id", selectedStoreId)
        .eq("is_archived", false);
      const listId = lists?.[0]?.id;
      if (!listId) throw new Error("No list found");

      await doCreate({
        data: {
          shopping_list_id: listId,
          name: name.trim(),
          category,
          quantity: Number(quantity) || 1,
          manual_price: price ? Number(price) : undefined,
        },
      });
      toast.success("Producto añadido");
      setName("");
      setQuantity("1");
      setPrice("");
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
            <Label htmlFor="item-name">Producto</Label>
            <Input
              id="item-name"
              placeholder="Ej. Leche entera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
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

          <div className="space-y-2">
            <Label>Tienda</Label>
            <Select value={storeId || defaultStore?.id} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
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
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gestionar tiendas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ul className="space-y-2">
            {stores.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium">{s.name}</span>
                {s.is_default && <Badge variant="outline">Por defecto</Badge>}
              </li>
            ))}
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
