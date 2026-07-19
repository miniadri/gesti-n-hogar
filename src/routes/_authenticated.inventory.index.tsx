import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Package, AlertTriangle, Trash2, Refrigerator, Snowflake, Archive, CheckSquare, X, ArrowLeftRight, Pill, ChevronDown, ScanBarcode, ChefHat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { listMedicines, createMedicine, updateMedicine, deleteMedicine } from "@/lib/medicines.functions";
import { INVENTORY_LOCATIONS, suggestLocation, type InventoryLocation } from "@/lib/inventory-locations";
import { toast } from "sonner";

const inventoryQueryOptions = queryOptions({
  queryKey: ["inventory"],
  queryFn: () => listInventory(),
});

const medicinesQueryOptions = queryOptions({
  queryKey: ["medicines"],
  queryFn: () => listMedicines(),
});

export const Route = createFileRoute("/_authenticated/inventory/")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(inventoryQueryOptions),
    context.queryClient.ensureQueryData(medicinesQueryOptions),
  ]),

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
      const items = data.filter((i) => selected.has(i.id));
      const addDays = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };
      await Promise.all(
        items.map((item) => {
          const current = normalizeLocation(item.location);
          const patch: { id: string; location: InventoryLocation; expiry_date?: string } = {
            id: item.id,
            location: target,
          };
          if (!item.expiry_date) {
            if (current === "Frigorífico" && target === "Congelador") patch.expiry_date = addDays(30);
            else if (current === "Congelador" && target === "Frigorífico") patch.expiry_date = addDays(2);
          }
          return doUpdate({ data: patch });
        }),
      );
      toast.success(`${items.length} producto(s) movidos a ${target}`);
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
          <Button asChild variant="outline">
            <Link to="/inventory/scan-add">
              <ScanBarcode className="mr-2 h-4 w-4" />
              Escanear producto
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/inventory/kitchen">
              <ChefHat className="mr-2 h-4 w-4" />
              Modo cocina
            </Link>
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

      <MedicinesSection />



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
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="1, 0.25, 0,5..."
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Input
                  type="text"
                  placeholder="ud, kg, gr, blister, paquete..."
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  list="inventory-units"
                />
                <datalist id="inventory-units">
                  <option value="ud" />
                  <option value="kg" />
                  <option value="gr" />
                  <option value="L" />
                  <option value="ml" />
                  <option value="paquete" />
                  <option value="blister" />
                  <option value="caja" />
                  <option value="botella" />
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Stock mínimo</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Puedes usar decimales para paquetes incompletos (p. ej. 0,25 = un cuarto de paquete) o indicar la unidad real (250 gr, 1 blister, 0,5 kg…).
            </p>
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

function MedicinesSection() {
  const queryClient = useQueryClient();
  const { data: meds } = useSuspenseQuery(medicinesQueryOptions);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const doDelete = useServerFn(deleteMedicine);
  const doUpdate = useServerFn(updateMedicine);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["medicines"] });

  const toggleBuy = async (m: any) => {
    try {
      await doUpdate({ data: { id: m.id, needs_purchase: !m.needs_purchase } });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["shopping"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      toast.error("No se pudo actualizar");
    }
  };

  const remove = async (id: string) => {
    try {
      await doDelete({ data: { id } });
      refresh();
      queryClient.invalidateQueries({ queryKey: ["shopping"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (m: any) => { setEditing(m); setDialogOpen(true); };

  const needBuyCount = meds.filter((m: any) => m.needs_purchase).length;

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
        <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
          <Pill className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Medicinas</span>
          <span className="text-xs text-muted-foreground">({meds.length})</span>
          {needBuyCount > 0 && (
            <Badge variant="secondary" className="ml-1">{needBuyCount} por comprar</Badge>
          )}
          <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t p-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Añadir medicina
            </Button>
          </div>
          {meds.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No hay medicinas registradas.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {meds.map((m: any) => (
                <Card key={m.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => openEdit(m)} className="text-left flex-1">
                        <p className="font-medium">{m.name}</p>
                        {m.expiry_month && m.expiry_year && (
                          <p className="text-xs text-muted-foreground">
                            Caduca: {String(m.expiry_month).padStart(2, "0")}/{m.expiry_year}
                          </p>
                        )}
                        {m.note && <p className="text-xs text-muted-foreground line-clamp-2">{m.note}</p>}
                      </button>
                      <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox checked={m.needs_purchase} onCheckedChange={() => toggleBuy(m)} />
                      <span>Necesario comprar</span>
                    </label>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <MedicineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => {
          refresh();
          queryClient.invalidateQueries({ queryKey: ["shopping"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </>
  );
}

function MedicineDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createMedicine);
  const doUpdate = useServerFn(updateMedicine);
  const [name, setName] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [note, setNote] = useState("");
  const [needs, setNeeds] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // reset when opening
  const openRef = open ? editing?.id ?? "new" : "closed";
  const [lastKey, setLastKey] = useState<string>("");
  if (openRef !== lastKey) {
    setLastKey(openRef);
    setName(editing?.name ?? "");
    setMonth(editing?.expiry_month ? String(editing.expiry_month) : "");
    setYear(editing?.expiry_year ? String(editing.expiry_year) : "");
    setNote(editing?.note ?? "");
    setNeeds(editing?.needs_purchase ?? false);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        expiry_month: month ? Number(month) : null,
        expiry_year: year ? Number(year) : null,
        note: note.trim() || null,
        needs_purchase: needs,
      };
      if (editing) {
        await doUpdate({ data: { id: editing.id, ...payload } });
      } else {
        await doCreate({ data: payload });
      }
      toast.success(editing ? "Medicina actualizada" : "Medicina añadida");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "No se pudo guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar medicina" : "Añadir medicina"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Paracetamol" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Mes caducidad</Label>
              <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} placeholder="MM" />
            </div>
            <div className="space-y-2">
              <Label>Año caducidad</Label>
              <Input type="number" min={currentYear - 1} max={currentYear + 20} value={year} onChange={(e) => setYear(e.target.value)} placeholder="AAAA" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Anotación</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Para qué se usa, dosis..." rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={needs} onCheckedChange={(v) => setNeeds(!!v)} />
            <span>Necesario comprar</span>
          </label>
          <DialogFooter>
            <Button type="submit" disabled={submitting || !name.trim()} className="w-full">
              {submitting ? "Guardando..." : editing ? "Guardar" : "Añadir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
