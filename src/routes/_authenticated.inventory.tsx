import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Package, AlertTriangle, Trash2, Refrigerator, Snowflake, Archive, CheckSquare, X, ArrowLeftRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { listInventory, createInventoryItem, deleteInventoryItem, updateInventoryItem } from "@/lib/inventory.functions";
import { INVENTORY_LOCATIONS, suggestLocation, type InventoryLocation } from "@/lib/inventory-locations";
import { toast } from "sonner";

const inventoryQueryOptions = queryOptions({
  queryKey: ["inventory"],
  queryFn: () => listInventory(),
});

export const Route = createFileRoute("/_authenticated/inventory")({
  loader: ({ context }) => context.queryClient.ensureQueryData(inventoryQueryOptions),
  head: () => ({
    meta: [{ title: "Inventario - HomeSync" }],
  }),
  component: InventoryPage,
});

const categories = ["Frutas", "Verduras", "Lácteos", "Carne", "Pescado", "Bebidas", "Congelados", "Limpieza", "Farmacia", "Otros"];

const locationIcons: Record<InventoryLocation, React.ComponentType<{ className?: string }>> = {
  Frigorífico: Refrigerator,
  Congelador: Snowflake,
  Armario: Archive,
};

function normalizeLocation(loc?: string | null): InventoryLocation {
  if (!loc) return "Armario";
  const found = INVENTORY_LOCATIONS.find((l) => l.toLowerCase() === loc.toLowerCase());
  return found ?? "Armario";
}

function InventoryPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(inventoryQueryOptions);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Otros");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [minStock, setMinStock] = useState("0");
  const [expiry, setExpiry] = useState("");
  const [location, setLocation] = useState<InventoryLocation>("Armario");
  const [submitting, setSubmitting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);

  const parseDecimal = (v: string) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const doCreate = useServerFn(createInventoryItem);
  const doDelete = useServerFn(deleteInventoryItem);
  const doUpdate = useServerFn(updateInventoryItem);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inventory"] });

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const moveSelectedTo = async (target: InventoryLocation) => {
    if (selected.size === 0) return;
    setMoving(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(
        ids.map((id) => doUpdate({ data: { id, location: target } })),
      );
      toast.success(`${ids.length} producto(s) movidos a ${target}`);
      exitSelectMode();
      refresh();
    } catch {
      toast.error("No se pudieron mover algunos productos");
    } finally {
      setMoving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({
        data: {
          name: name.trim(),
          category,
          quantity: (() => { const n = parseDecimal(quantity); return Number.isFinite(n) && n >= 0 ? n : 1; })(),
          unit: unit.trim() || undefined,
          min_stock: (() => { const n = parseDecimal(minStock); return Number.isFinite(n) && n >= 0 ? n : 0; })(),
          location,
          expiry_date: expiry || undefined,
        },
      });
      toast.success("Producto añadido al inventario");
      setName("");
      setQuantity("1");
      setUnit("");
      setMinStock("0");
      setExpiry("");
      setLocation("Armario");
      refresh();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir producto");
    } finally {
      setSubmitting(false);
    }
  };

  const openDialog = () => {
    setLocation(suggestLocation(category));
    setOpen(true);
  };

  const lowStock = data.filter((item) => Number(item.quantity) <= Number(item.min_stock));

  const grouped: Record<InventoryLocation, typeof data> = {
    Frigorífico: [],
    Congelador: [],
    Armario: [],
  };
  for (const item of data) {
    grouped[normalizeLocation(item.location)].push(item);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventario</h2>
          <p className="text-muted-foreground">Tu nevera virtual y despensa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={selectMode ? "secondary" : "outline"} onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
            {selectMode ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </>
            ) : (
              <>
                <CheckSquare className="mr-2 h-4 w-4" />
                Seleccionar
              </>
            )}
          </Button>
          <Button onClick={openDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Añadir producto
          </Button>
        </div>
      </div>

      {selectMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              <span className="font-medium">{selected.size} seleccionado(s)</span>
              <span className="text-muted-foreground">— mover a:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || moving}
                onClick={() => moveSelectedTo("Frigorífico")}
              >
                <Refrigerator className="mr-2 h-4 w-4" />
                Frigorífico
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || moving}
                onClick={() => moveSelectedTo("Congelador")}
              >
                <Snowflake className="mr-2 h-4 w-4" />
                Congelador
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || moving}
                onClick={() => moveSelectedTo("Armario")}
              >
                <Archive className="mr-2 h-4 w-4" />
                Armario
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lowStock.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Stock bajo</p>
              <p className="text-sm text-muted-foreground">
                {lowStock.length} producto(s) por debajo del mínimo
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {INVENTORY_LOCATIONS.map((loc) => {
          const items = grouped[loc];
          const LocIcon = locationIcons[loc];
          return (
            <section key={loc} className="space-y-3">
              <div className="flex items-center gap-2">
                <LocIcon className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">{loc}</h3>
                <span className="text-sm text-muted-foreground">({items.length})</span>
              </div>
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Sin productos en {loc.toLowerCase()}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => {
                    const isSelected = selected.has(item.id);
                    return (
                      <Card
                        key={item.id}
                        onClick={selectMode ? () => toggleSelected(item.id) : undefined}
                        className={
                          selectMode
                            ? `cursor-pointer transition-colors ${isSelected ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/40"}`
                            : undefined
                        }
                      >
                        <CardContent className="flex items-start justify-between p-4">
                          <div className="flex items-start gap-3">
                            {selectMode && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(item.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 h-4 w-4 accent-primary"
                              />
                            )}
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
                              <Package className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.category} · {item.quantity} {item.unit || "ud."}
                              </p>
                              {item.expiry_date && (
                                <p className="text-xs text-muted-foreground">
                                  Caduca: {new Date(item.expiry_date).toLocaleDateString("es-ES")}
                                </p>
                              )}
                            </div>
                          </div>
                          {!selectMode && (
                            <div className="flex flex-col items-end gap-2">
                              {Number(item.quantity) <= Number(item.min_stock) && (
                                <Badge variant="destructive">Bajo</Badge>
                              )}
                              <button
                                onClick={async () => {
                                  await doDelete({ data: { id: item.id } });
                                  refresh();
                                }}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir producto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input type="number" min="0" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Stock mínimo</Label>
                <Input type="number" min="0" step="0.1" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setLocation(suggestLocation(e.target.value));
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Ubicación</Label>
                <Select value={location} onValueChange={(v) => setLocation(v as InventoryLocation)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_LOCATIONS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha de caducidad</Label>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !name.trim()} className="w-full">
                {submitting ? "Añadiendo..." : "Añadir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
