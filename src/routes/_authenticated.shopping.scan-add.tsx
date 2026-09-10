import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addToShoppingListByEan, lookupProduct } from "@/lib/products.functions";
import { normalizeProductCode } from "@/lib/product-codes";

export const Route = createFileRoute("/_authenticated/shopping/scan-add")({
  head: () => ({ meta: [{ title: "Escanear producto - HomeSync" }] }),
  component: ScanShoppingProductPage,
});

function ScanShoppingProductPage() {
  const queryClient = useQueryClient();
  const doLookup = useServerFn(lookupProduct);
  const doAddToShopping = useServerFn(addToShoppingListByEan);
  const [ean, setEan] = useState("");
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  const lastRejectedScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const reset = () => {
    setEan("");
    setName("");
    setImageUrl("");
    setScanWarning(null);
    setScanPaused(false);
  };

  const handleDetected = async (code: string) => {
    let normalizedCode: string;
    try {
      normalizedCode = normalizeProductCode(code);
    } catch (error: any) {
      const now = Date.now();
      if (code === lastRejectedScanRef.current.code && now - lastRejectedScanRef.current.at < 5000) return;
      lastRejectedScanRef.current = { code, at: now };
      setScanPaused(true);
      setScanWarning(error.message || "El QR no contiene un código EAN/UPC válido de producto.");
      return;
    }
    if (busy || normalizedCode === ean) return;

    setBusy(true);
    setScanPaused(true);
    setScanWarning(null);
    setEan(normalizedCode);
    try {
      const result: any = await doLookup({ data: { ean: normalizedCode } });
      const product = result.product ?? result.suggestion;
      if (product) {
        setName(product.name ?? "");
        setImageUrl(product.image_url ?? "");
        toast.success(`Producto reconocido: ${product.name}`);
      } else {
        toast.warning("Producto desconocido. Escribe el nombre para añadirlo a la lista.");
      }
    } catch (error: any) {
      toast.error(error?.message || "No se pudo reconocer el producto");
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!ean || !name.trim()) {
      toast.error("Escanea un código y escribe el nombre del producto");
      return;
    }
    setBusy(true);
    try {
      const result: any = await doAddToShopping({ data: { ean, name: name.trim() } });
      if (result.added) {
        toast.success("Producto añadido a la lista de compra");
        queryClient.invalidateQueries({ queryKey: ["shopping"] });
      } else {
        toast.info("Ese producto ya está en la lista predeterminada");
      }
      reset();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo añadir el producto a la lista");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/shopping">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Escanear producto</h2>
          <p className="text-sm text-muted-foreground">Escanea un código para añadir el producto a la lista de compra</p>
        </div>
      </div>

      <BarcodeScanner onDetected={handleDetected} paused={scanPaused} />

      {scanWarning && !ean && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="font-medium text-amber-700">Código no compatible</p>
              <p className="mt-1 text-sm text-muted-foreground">{scanWarning}</p>
            </div>
            <Button variant="outline" onClick={() => { setScanWarning(null); setScanPaused(false); }}>
              Volver a escanear
            </Button>
          </CardContent>
        </Card>
      )}

      {ean && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Código: <span className="font-mono">{ean}</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {imageUrl && <img src={imageUrl} alt="" className="mx-auto max-h-40 rounded object-contain" />}
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Descartar</Button>
              <Button onClick={handleAdd} disabled={busy} className="flex-1">
                <ShoppingCart className="mr-2 h-4 w-4" />
                {busy ? "Añadiendo..." : "Añadir a la lista de compra"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
