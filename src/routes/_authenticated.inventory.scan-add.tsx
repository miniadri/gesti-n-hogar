import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { BarcodeScanner } from "@/components/BarcodeScanner";
import { lookupProduct, upsertProduct, upsertProductPrice } from "@/lib/products.functions";
import { createInventoryItem } from "@/lib/inventory.functions";
import { listStores } from "@/lib/shopping.functions";
import { INVENTORY_LOCATIONS, suggestLocation } from "@/lib/inventory-locations";

export const Route = createFileRoute("/_authenticated/inventory/scan-add")({
  head: () => ({ meta: [{ title: "Escanear producto - HomeSync" }] }),
  component: ScanAddPage,
});

function ScanAddPage() {
  const qc = useQueryClient();
  const doLookup = useServerFn(lookupProduct);
  const doUpsertProduct = useServerFn(upsertProduct);
  const doUpsertPrice = useServerFn(upsertProductPrice);
  const doCreateInv = useServerFn(createInventoryItem);
  const doListStores = useServerFn(listStores);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: () => doListStores(),
  });

  const [ean, setEan] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: "",
    size_value: "",
    size_unit: "",
    image_url: "",
    default_location: "",
    // Stock + price
    quantity: "1",
    unit: "",
    location: "",
    price: "",
    store_id: "",
  });
  const [scanPaused, setScanPaused] = useState(false);

  const pricePerKg = (() => {
    const p = Number(form.price);
    const q = Number(form.size_value);
    const u = form.size_unit.toLowerCase();
    if (!p || !q) return null;
    if (u === "kg" || u === "l") return (p / q).toFixed(2);
    if (u === "g" || u === "ml") return (p / (q / 1000)).toFixed(2);
    return null;
  })();

  const handleDetected = async (code: string) => {
    if (busy || code === ean) return;
    setBusy(true);
    setScanPaused(true);
    setEan(code);
    try {
      const res: any = await doLookup({ data: { ean: code } });
      if (res.product) {
        setForm((f) => ({
          ...f,
          name: res.product.name,
          brand: res.product.brand ?? "",
          category: res.product.category ?? "",
          size_value: res.product.size_value?.toString() ?? "",
          size_unit: res.product.size_unit ?? "",
          image_url: res.product.image_url ?? "",
          default_location: res.product.default_location ?? "",
          location: res.product.default_location ?? suggestLocation(res.product.category ?? undefined),
        }));
        toast.success(`Producto reconocido: ${res.product.name}`);
      } else if (res.suggestion) {
        setForm((f) => ({
          ...f,
          name: res.suggestion.name,
          brand: res.suggestion.brand ?? "",
          category: res.suggestion.category ?? "",
          image_url: res.suggestion.image_url ?? "",
          location: suggestLocation(res.suggestion.category ?? undefined),
        }));
        toast.info("Producto encontrado en Open Food Facts. Revisa y guarda.");
      } else {
        toast.warning("Producto desconocido. Rellena los datos y se añadirá al catálogo.");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!ean || !form.name.trim()) {
      toast.error("Escanea un código y pon un nombre");
      return;
    }
    setBusy(true);
    try {
      await doUpsertProduct({
        data: {
          ean,
          name: form.name.trim(),
          brand: form.brand.trim() || undefined,
          category: form.category.trim() || undefined,
          size_value: form.size_value ? Number(form.size_value) : undefined,
          size_unit: form.size_unit.trim() || undefined,
          image_url: form.image_url.trim() || undefined,
          default_location: form.default_location || form.location || undefined,
        },
      });
      if (form.price) {
        await doUpsertPrice({
          data: {
            ean,
            store_id: form.store_id || null,
            last_price: Number(form.price),
            last_quantity: form.size_value ? Number(form.size_value) : undefined,
            last_unit: form.size_unit.trim() || undefined,
          },
        });
      }
      await doCreateInv({
        data: {
          name: form.name.trim(),
          category: form.category.trim() || undefined,
          quantity: Number(form.quantity || 1),
          unit: form.unit.trim() || form.size_unit.trim() || undefined,
          location: form.location || form.default_location || undefined,
          last_price: form.price ? Number(form.price) : undefined,
        } as any,
      });

      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Añadido a inventario y guardado en el catálogo");
      // Reset for the next scan
      setEan("");
      setForm({
        name: "",
        brand: "",
        category: "",
        size_value: "",
        size_unit: "",
        image_url: "",
        default_location: "",
        quantity: "1",
        unit: "",
        location: "",
        price: "",
        store_id: form.store_id, // keep last store
      });
      setScanPaused(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/inventory">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Escanear producto</h2>
          <p className="text-muted-foreground text-sm">
            Escanea el código de barras al comprar o guardar en casa
          </p>
        </div>
      </div>

      <BarcodeScanner onDetected={handleDetected} paused={scanPaused} />

      {ean && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Código: <span className="font-mono">{ean}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.image_url && (
              <img
                src={form.image_url}
                alt=""
                className="mx-auto max-h-40 rounded object-contain"
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Categoría</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Tamaño</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.size_value}
                  onChange={(e) => setForm({ ...form, size_value: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Unidad</Label>
                <Input
                  list="units"
                  value={form.size_unit}
                  onChange={(e) => setForm({ ...form, size_unit: e.target.value })}
                />
                <datalist id="units">
                  <option value="g" />
                  <option value="kg" />
                  <option value="ml" />
                  <option value="l" />
                  <option value="ud" />
                </datalist>
              </div>
              <div className="space-y-1">
                <Label>Precio (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Tienda</Label>
                <Select value={form.store_id} onValueChange={(v) => setForm({ ...form, store_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin tienda" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {pricePerKg && (
                <div className="col-span-2 rounded-md bg-muted px-3 py-2 text-sm">
                  Precio por {["g", "kg"].includes(form.size_unit.toLowerCase()) ? "kg" : "L"}:{" "}
                  <b>{pricePerKg} €</b>
                </div>
              )}
              <div className="space-y-1">
                <Label>Cantidad a inventario</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ubicación</Label>
                <Select value={form.location} onValueChange={(v) => setForm({ ...form, location: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir" />
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEan("");
                  setScanPaused(false);
                }}
              >
                Descartar
              </Button>
              <Button onClick={handleSave} disabled={busy} className="flex-1">
                <Save className="mr-2 h-4 w-4" />
                {busy ? "Guardando..." : "Guardar y añadir a inventario"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
