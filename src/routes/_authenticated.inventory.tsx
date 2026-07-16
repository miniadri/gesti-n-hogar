import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Package, AlertTriangle, Trash2 } from "lucide-react";

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
import { Card, CardContent } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { listInventory, createInventoryItem, deleteInventoryItem } from "@/lib/inventory.functions";
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

function InventoryPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(inventoryQueryOptions);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Otros");
  const [quantity, setQuantity] = useState("1");
  const [minStock, setMinStock] = useState("0");
  const [expiry, setExpiry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const doCreate = useServerFn(createInventoryItem);
  const doDelete = useServerFn(deleteInventoryItem);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inventory"] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({
        data: {
          name: name.trim(),
          category,
          quantity: Number(quantity) || 1,
          min_stock: Number(minStock) || 0,
          expiry_date: expiry || undefined,
        },
      });
      toast.success("Producto añadido al inventario");
      setName("");
      setQuantity("1");
      setMinStock("0");
      setExpiry("");
      refresh();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir producto");
    } finally {
      setSubmitting(false);
    }
  };

  const lowStock = data.filter((item) => Number(item.quantity) <= Number(item.min_stock));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventario</h2>
          <p className="text-muted-foreground">Control de stock y caducidades</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir producto
        </Button>
      </div>

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex items-start justify-between p-4">
              <div className="flex items-start gap-3">
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
            </CardContent>
          </Card>
        ))}
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
            <div className="space-y-2">
              <Label>Categoría</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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
