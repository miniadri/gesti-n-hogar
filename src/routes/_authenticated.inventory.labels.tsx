import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, Printer, QrCode, Tags } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BarcodeDisplay } from "@/components/BarcodeDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateInventoryLabelBatch, listInventoryLabels } from "@/lib/inventory-labels.functions";
import { INVENTORY_LABEL_TYPE_INFO, type InventoryLabelType } from "@/lib/inventory-labels";

export const Route = createFileRoute("/_authenticated/inventory/labels")({
  head: () => ({ meta: [{ title: "Etiquetas QR - HomeSync" }] }),
  component: InventoryLabelsPage,
});

function InventoryLabelsPage() {
  const qc = useQueryClient();
  const doList = useServerFn(listInventoryLabels);
  const doGenerate = useServerFn(generateInventoryLabelBatch);
  const { data: labels = [] } = useQuery({ queryKey: ["inventory-labels"], queryFn: () => doList() });
  const [labelType, setLabelType] = useState<InventoryLabelType>("general");
  const [count, setCount] = useState("24");
  const [generated, setGenerated] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    const quantity = Number(count);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      toast.error("Indica entre 1 y 100 etiquetas");
      return;
    }
    setBusy(true);
    try {
      const result: any[] = await doGenerate({ data: { label_type: labelType, count: quantity } });
      setGenerated(result);
      qc.invalidateQueries({ queryKey: ["inventory-labels"] });
      toast.success(`${result.length} etiquetas reservadas y listas para imprimir`);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo generar el lote");
    } finally {
      setBusy(false);
    }
  };

  const used = labels.filter((label: any) => label.inventory_item_id).length;
  const available = labels.length - used;
  const scanUrl = (code: string) => typeof window === "undefined"
    ? code
    : `${window.location.origin}/inventory/labels/scan?code=${encodeURIComponent(code)}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild><Link to="/inventory"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Etiquetas QR</h2>
          <p className="text-sm text-muted-foreground">Genera, imprime y reutiliza accesos rápidos al inventario.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Tags className="h-5 w-5" /> Generar un lote</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <div className="space-y-2"><Label>Serie</Label><Select value={labelType} onValueChange={(value) => setLabelType(value as InventoryLabelType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(INVENTORY_LABEL_TYPE_INFO).map(([value, info]) => <SelectItem key={value} value={value}>{info.label} · HS-{info.prefix}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{INVENTORY_LABEL_TYPE_INFO[labelType].description}. La ubicación real se puede cambiar después.</p></div>
          <div className="space-y-2"><Label>Cantidad</Label><Input type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} /></div>
          <Button onClick={generate} disabled={busy}>{busy ? "Generando..." : "Generar QR"}</Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Etiquetas creadas</p><p className="text-2xl font-bold">{labels.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Sin asignar</p><p className="text-2xl font-bold">{available}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Vinculadas</p><p className="text-2xl font-bold">{used}</p></CardContent></Card>
      </div>

      <Card className="border-dashed"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">Leer y configurar una etiqueta</p><p className="text-sm text-muted-foreground">Escanéala con la cámara; si está vacía, elige el producto que controlará.</p></div><Button asChild><Link to="/inventory/labels/scan"><Camera className="mr-2 h-4 w-4" /> Leer etiqueta</Link></Button></CardContent></Card>

      {generated.length > 0 && (
        <section className="space-y-3 print:space-y-0">
          <div className="flex items-center justify-between print:hidden"><div><h3 className="text-lg font-semibold">Lote recién generado</h3><p className="text-sm text-muted-foreground">Imprime esta hoja o guárdala como PDF antes de pegar las etiquetas.</p></div><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Imprimir</Button></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            {generated.map((label: any) => <div key={label.id} className="break-inside-avoid rounded border bg-white p-3 text-center text-black"><BarcodeDisplay value={scanUrl(label.code)} format="QR" className="[&_canvas]:!h-auto [&_canvas]:!w-full" /><p className="mt-2 font-mono text-sm font-semibold">{label.code}</p><p className="text-[10px] uppercase tracking-wide text-slate-600">HomeSync · {INVENTORY_LABEL_TYPE_INFO[label.label_type as InventoryLabelType].label}</p></div>)}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground"><QrCode className="mr-1 inline h-3.5 w-3.5" /> Una misma etiqueta se vincula a un producto y se conserva al reponerlo: si había 2 leches y añades 2, el stock pasa a 4.</p>
    </div>
  );
}
