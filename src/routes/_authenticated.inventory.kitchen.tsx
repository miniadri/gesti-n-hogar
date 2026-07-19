import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Minus, Plus, Check, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { BarcodeScanner } from "@/components/BarcodeScanner";
import { consumeByBarcode, lookupProduct, addToShoppingListByEan } from "@/lib/products.functions";

export const Route = createFileRoute("/_authenticated/inventory/kitchen")({
  head: () => ({ meta: [{ title: "Modo cocina - HomeSync" }] }),
  component: KitchenPage,
});

interface PendingScan {
  ean: string;
  name: string;
  qty: number;
}

function KitchenPage() {
  const qc = useQueryClient();
  const doConsume = useServerFn(consumeByBarcode);
  const doLookup = useServerFn(lookupProduct);
  const doAddToShopping = useServerFn(addToShoppingListByEan);
  const [pending, setPending] = useState<PendingScan | null>(null);
  const [confirmAdd, setConfirmAdd] = useState<{ ean: string; name: string } | null>(null);
  const [history, setHistory] = useState<
    { name: string; qty: number; new_qty: number | null; added_to_shopping: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const handleDetected = async (code: string) => {
    if (busy || pending) return;
    setBusy(true);
    try {
      const res: any = await doLookup({ data: { ean: code } });
      // Priority: inventory-known name → product catalog name → OFF suggestion → fallback
      const name =
        res.inventory?.name ??
        res.product?.name ??
        res.suggestion?.name ??
        `Producto ${code}`;
      setPending({ ean: code, name, qty: 1 });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res: any = await doConsume({ data: { ean: pending.ean, qty: pending.qty } });
      setHistory((h) => [
        {
          name: res.product_name,
          qty: pending.qty,
          new_qty: res.new_quantity,
          added_to_shopping: res.added_to_shopping,
        },
        ...h,
      ].slice(0, 20));
      if (res.added_to_shopping) {
        toast.success(`${res.product_name}: añadido a la lista de la compra`);
      } else if (res.matched) {
        toast.success(`${res.product_name}: quedan ${res.new_quantity}`);
      } else {
        toast.info(`${res.product_name}: no estaba en inventario`);
      }
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
      setPending(null);
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
          <h2 className="text-2xl font-bold tracking-tight">Modo cocina</h2>
          <p className="text-sm text-muted-foreground">
            Escanea al sacar productos: descuenta stock y repone la lista cuando se acaba
          </p>
        </div>
      </div>

      <BarcodeScanner onDetected={handleDetected} paused={!!pending || busy} />

      {pending && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Detectado</p>
              <p className="text-lg font-semibold">{pending.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{pending.ean}</p>
            </div>
            <div className="space-y-1">
              <Label>Cantidad a descontar</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPending({ ...pending, qty: Math.max(1, pending.qty - 1) })}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  className="w-24 text-center"
                  value={pending.qty}
                  onChange={(e) => setPending({ ...pending, qty: Number(e.target.value) || 1 })}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPending({ ...pending, qty: pending.qty + 1 })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPending(null)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={confirm} disabled={busy} className="flex-1">
                <Check className="mr-2 h-4 w-4" />
                Descontar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Últimos escaneos</h3>
          <div className="space-y-1">
            {history.map((h, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0 truncate">
                  <span className="font-medium">{h.name}</span>
                  <span className="text-muted-foreground"> · -{h.qty}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {h.new_qty !== null && (
                    <span className="text-xs text-muted-foreground">Quedan {h.new_qty}</span>
                  )}
                  {h.added_to_shopping && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <ShoppingCart className="h-3 w-3" /> a comprar
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
