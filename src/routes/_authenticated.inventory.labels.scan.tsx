import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Minus, Plus, QrCode } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { NfcLabelReader } from "@/components/NfcLabelReader";
import { QrImageScanner } from "@/components/QrImageScanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adjustInventoryFromLabel, assignInventoryLabel, getInventoryLabel } from "@/lib/inventory-labels.functions";
import { listInventory } from "@/lib/inventory.functions";
import { normalizeInventoryLabelCode } from "@/lib/inventory-labels";

export const Route = createFileRoute("/_authenticated/inventory/labels/scan")({
  validateSearch: (search: Record<string, unknown>) => ({ code: typeof search.code === "string" ? search.code : "" }),
  head: () => ({ meta: [{ title: "Leer etiqueta - HomeSync" }] }),
  component: ScanInventoryLabelPage,
});

function ScanInventoryLabelPage() {
  const { code: initialCode } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const doGet = useServerFn(getInventoryLabel);
  const doAssign = useServerFn(assignInventoryLabel);
  const doAdjust = useServerFn(adjustInventoryFromLabel);
  const doListInventory = useServerFn(listInventory);
  const [code, setCode] = useState(() => normalizeInventoryLabelCode(initialCode) ?? "");
  const [manualCode, setManualCode] = useState(initialCode);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const next = normalizeInventoryLabelCode(initialCode) ?? "";
    setCode(next);
    setManualCode(initialCode);
  }, [initialCode]);
  const { data: label, isLoading } = useQuery({ queryKey: ["inventory-label", code], queryFn: () => doGet({ data: { code } }), enabled: !!code });
  const { data: inventory = [] } = useQuery({ queryKey: ["inventory"], queryFn: () => doListInventory() });

  const detected = useCallback((raw: string) => {
    const next = normalizeInventoryLabelCode(raw);
    if (!next) { toast.error("Este QR no es una etiqueta HomeSync"); return; }
    setCode(next); setManualCode(next); setSelectedItemId("");
    navigate({ to: "/inventory/labels/scan", search: { code: next }, replace: true });
  }, [navigate]);
  const submitManual = (event: React.FormEvent) => { event.preventDefault(); detected(manualCode); };
  const assign = async () => {
    if (!label || !selectedItemId) { toast.error("Elige un producto"); return; }
    setBusy(true); try { await doAssign({ data: { id: label.id, inventory_item_id: selectedItemId } }); qc.invalidateQueries({ queryKey: ["inventory-label", code] }); qc.invalidateQueries({ queryKey: ["inventory-labels"] }); toast.success("Etiqueta vinculada"); } catch (e: any) { toast.error(e?.message || "No se pudo vincular"); } finally { setBusy(false); }
  };
  const adjust = async (sign: 1 | -1) => {
    if (!label?.inventory_item_id) return;
    const amount = Number(quantity.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Indica una cantidad válida"); return; }
    setBusy(true); try { const item: any = await doAdjust({ data: { label_id: label.id, delta: sign * amount } }); qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["inventory-label", code] }); toast.success(`${item.name}: quedan ${item.quantity} ${item.unit || "ud."}`); } catch (e: any) { toast.error(e?.message || "No se pudo actualizar el stock"); } finally { setBusy(false); }
  };

  const item = (label as any)?.inventory_items;
  const nfcWriteUrl = code && typeof window !== "undefined"
    ? `${window.location.origin}/inventory/labels/scan?code=${encodeURIComponent(code)}`
    : undefined;
  return <div className="mx-auto max-w-xl space-y-4">
    <div className="flex items-center gap-2"><Button variant="ghost" size="icon" asChild><Link to="/inventory/labels"><ArrowLeft className="h-4 w-4" /></Link></Button><div><h2 className="text-2xl font-bold tracking-tight">Leer etiqueta</h2><p className="text-sm text-muted-foreground">Acción rápida para un producto o recipiente.</p></div></div>
    {!code && <Card><CardHeader><CardTitle className="text-lg">Leer QR o NFC</CardTitle></CardHeader><CardContent className="space-y-3">
      <BarcodeScanner onDetected={detected} paused={busy} requireUserGesture />
      <p className="text-xs text-muted-foreground">Si la vista en directo no se inicia, usa «Hacer foto del QR»: abre la cámara nativa del móvil, igual que el registro de gastos.</p>
      <QrImageScanner onDetected={detected} />
      <NfcLabelReader onDetected={detected} />
    </CardContent></Card>}
    {code && <NfcLabelReader onDetected={detected} writeUrl={nfcWriteUrl} />}
    {!code && <form onSubmit={submitManual} className="flex gap-2"><Input value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="HS-GEN-0001" /><Button type="submit">Abrir</Button></form>}
    {code && isLoading && <p className="text-sm text-muted-foreground">Buscando etiqueta…</p>}
    {code && !isLoading && !label && <Card className="border-amber-500/40"><CardContent className="p-4"><p className="font-medium">Etiqueta no encontrada: {code}</p><p className="mt-1 text-sm text-muted-foreground">Este código tiene formato correcto, pero no está reservado en este hogar. Genera el lote primero o comprueba que el código coincida con el texto impreso.</p><Button className="mt-3" variant="outline" onClick={() => { setCode(""); setManualCode(""); navigate({ to: "/inventory/labels/scan", search: {}, replace: true }); }}>Leer otra</Button></CardContent></Card>}
    {label && !item && <Card><CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> {label.code}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Etiqueta disponible. Vincúlala una vez al producto que quieres controlar.</p><div className="space-y-2"><Label>Producto de inventario</Label><Select value={selectedItemId} onValueChange={setSelectedItemId}><SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger><SelectContent>{(inventory as any[]).map((row) => <SelectItem key={row.id} value={row.id}>{row.name} · {row.quantity} {row.unit || "ud."}</SelectItem>)}</SelectContent></Select></div><Button onClick={assign} disabled={busy || !selectedItemId}><Check className="mr-2 h-4 w-4" /> Vincular etiqueta</Button></CardContent></Card>}
    {label && item && <Card><CardHeader><CardTitle>{item.name}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{label.code} · {item.location || "Sin ubicación"}</p><div className="rounded-lg bg-muted p-4 text-center"><p className="text-sm text-muted-foreground">Stock actual</p><p className="text-3xl font-bold">{item.quantity} <span className="text-base font-normal">{item.unit || "ud."}</span></p></div><div className="space-y-2"><Label>Cantidad</Label><Input type="text" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={busy} onClick={() => adjust(-1)}><Minus className="mr-2 h-4 w-4" /> Consumir</Button><Button disabled={busy} onClick={() => adjust(1)}><Plus className="mr-2 h-4 w-4" /> Reponer</Button></div></CardContent></Card>}
  </div>;
}
