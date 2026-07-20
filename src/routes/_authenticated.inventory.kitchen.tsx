import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Minus,
  Plus,
  Check,
  ShoppingCart,
  Maximize,
  Minimize,
  Search,
  Keyboard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { BarcodeScanner } from "@/components/BarcodeScanner";
import {
  consumeByBarcode,
  consumeByItemId,
  lookupProduct,
  addToShoppingListByEan,
} from "@/lib/products.functions";
import { listInventory } from "@/lib/inventory.functions";

export const Route = createFileRoute("/_authenticated/inventory/kitchen")({
  head: () => ({ meta: [{ title: "Modo cocina - HomeSync" }] }),
  component: KitchenPage,
});

interface PendingScan {
  ean?: string;
  itemId?: string;
  name: string;
  qty: number;
}

function KitchenPage() {
  const qc = useQueryClient();
  const doConsume = useServerFn(consumeByBarcode);
  const doConsumeById = useServerFn(consumeByItemId);
  const doLookup = useServerFn(lookupProduct);
  const doAddToShopping = useServerFn(addToShoppingListByEan);
  const fnListInventory = useServerFn(listInventory);

  const [pending, setPending] = useState<PendingScan | null>(null);
  const [confirmAdd, setConfirmAdd] = useState<{ ean: string; name: string } | null>(null);
  const [history, setHistory] = useState<
    { name: string; qty: number; new_qty: number | null; added_to_shopping: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [search, setSearch] = useState("");
  const [usbEnabled, setUsbEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => fnListInventory(),
  });

  // --- USB / HID barcode scanner: capture fast keystrokes ending with Enter ---
  const usbBuffer = useRef<{ chars: string; last: number }>({ chars: "", last: 0 });
  useEffect(() => {
    if (!usbEnabled) return;
    const handler = (e: KeyboardEvent) => {
      // If user is typing in an input/textarea and it's not the hidden capture, ignore
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isField =
        tag === "INPUT" || tag === "TEXTAREA" || (target as HTMLElement)?.isContentEditable;
      if (isField) return;
      if (pending || confirmAdd) return;

      const now = Date.now();
      if (now - usbBuffer.current.last > 100) usbBuffer.current.chars = "";
      usbBuffer.current.last = now;

      if (e.key === "Enter") {
        const code = usbBuffer.current.chars.trim();
        usbBuffer.current.chars = "";
        if (code.length >= 6 && /^[0-9A-Za-z\-]+$/.test(code)) {
          e.preventDefault();
          handleDetected(code);
        }
        return;
      }
      if (e.key.length === 1) {
        usbBuffer.current.chars += e.key;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [usbEnabled, pending, confirmAdd]);

  // Track fullscreen state
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        // Keep screen awake if supported
        try {
          // @ts-ignore
          await navigator.wakeLock?.request?.("screen");
        } catch {}
      } else {
        await document.exitFullscreen();
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cambiar a pantalla completa");
    }
  };

  const handleDetected = async (code: string) => {
    if (busy || pending) return;
    setBusy(true);
    try {
      const res: any = await doLookup({ data: { ean: code } });
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
      const res: any = pending.itemId
        ? await doConsumeById({ data: { id: pending.itemId, qty: pending.qty } })
        : await doConsume({ data: { ean: pending.ean!, qty: pending.qty } });
      setHistory((h) =>
        [
          {
            name: res.product_name,
            qty: pending.qty,
            new_qty: res.new_quantity,
            added_to_shopping: res.added_to_shopping,
          },
          ...h,
        ].slice(0, 20),
      );
      if (res.added_to_shopping) {
        toast.success(`${res.product_name}: añadido a la lista de la compra`);
      } else if (res.removed_from_inventory) {
        toast.info(`${res.product_name}: retirado del inventario`);
      } else if (res.matched) {
        toast.success(`${res.product_name}: quedan ${res.new_quantity}`);
      } else {
        toast.info(`${res.product_name}: no estaba en inventario`);
      }
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
      const nameForAdd = pending.name;
      const eanForAdd = pending.ean;
      setPending(null);
      setSearch("");
      if (res.ask_add_to_shopping && eanForAdd) {
        setConfirmAdd({ ean: eanForAdd, name: nameForAdd });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (inventory as any[])
      .filter((it) => it.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, inventory]);

  return (
    <div
      ref={containerRef}
      className="mx-auto max-w-2xl space-y-4 bg-background p-2 sm:p-4"
    >
      <div className="flex items-center gap-2">
        {!fullscreen && (
          <Button variant="ghost" size="icon" asChild>
            <Link to="/inventory">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Modo cocina</h2>
          <p className="text-sm text-muted-foreground">
            Escanea con cámara o lector USB, o busca manualmente
          </p>
        </div>
        <Button
          variant={usbEnabled ? "default" : "outline"}
          size="icon"
          title={usbEnabled ? "Lector USB activo" : "Lector USB desactivado"}
          onClick={() => setUsbEnabled((v) => !v)}
        >
          <Keyboard className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={toggleFullscreen} title="Pantalla completa">
          {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
      </div>

      <BarcodeScanner onDetected={handleDetected} paused={!!pending || !!confirmAdd || busy} />

      {/* Manual search for items without barcode */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <Label className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" /> Buscar producto sin código
          </Label>
          <Input
            placeholder="Escribe el nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="max-h-60 overflow-auto rounded border border-border">
              {searchResults.map((it: any) => (
                <button
                  key={it.id}
                  className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                  onClick={() =>
                    setPending({ itemId: it.id, name: it.name, qty: 1 })
                  }
                >
                  <span className="truncate">
                    <span className="font-medium">{it.name}</span>
                    {it.location && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {it.location}
                      </span>
                    )}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    Stock: {it.quantity}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {confirmAdd && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Sin stock</p>
              <p className="text-lg font-semibold">{confirmAdd.name}</p>
              <p className="text-sm text-muted-foreground">
                ¿Añadir a la lista de la compra?
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmAdd(null)}>
                No
              </Button>
              <Button
                className="flex-1"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await doAddToShopping({ data: { ean: confirmAdd.ean, name: confirmAdd.name } });
                    toast.success(`${confirmAdd.name}: añadido a la lista`);
                    qc.invalidateQueries({ queryKey: ["shopping"] });
                    setConfirmAdd(null);
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <ShoppingCart className="mr-2 h-4 w-4" /> Añadir
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pending && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {pending.itemId ? "Seleccionado" : "Detectado"}
              </p>
              <p className="text-lg font-semibold">{pending.name}</p>
              {pending.ean && (
                <p className="font-mono text-xs text-muted-foreground">{pending.ean}</p>
              )}
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
