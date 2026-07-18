import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Camera, Upload, Loader2, Check, Receipt as ReceiptIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { scanTicket } from "@/lib/ocr.functions";
import { createExpense } from "@/lib/finances.functions";
import { importReceiptToInventory } from "@/lib/inventory.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shopping/scan-ticket")({
  head: () => ({
    meta: [{ title: "Escanear ticket - HomeSync" }],
  }),
  component: ScanTicketPage,
});

function ScanTicketPage() {
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const [editStore, setEditStore] = useState("");
  const [editTotal, setEditTotal] = useState("");
  const [editDate, setEditDate] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const doScan = useServerFn(scanTicket);
  const doCreateExpense = useServerFn(createExpense);
  const doImportInv = useServerFn(importReceiptToInventory);

  const handleFile = async (file: File) => {
    setScanning(true);
    setResult(null);
    setExpenseId(null);
    try {
      const householdId = (await supabase.rpc("current_household")).data;
      if (!householdId) throw new Error("No household");
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}_${safeName}`;
      const { data: upload, error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const { data: signed, error: signedError } = await supabase.storage
        .from("receipts")
        .createSignedUrl(upload.path, 3600);
      if (signedError) throw signedError;

      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({ household_id: householdId, image_url: signed.signedUrl, created_by: userId })
        .select()
        .single();
      if (receiptError) throw receiptError;

      const scanResult = await doScan({ data: { imageUrl: signed.signedUrl, receiptId: receipt.id } });
      setResult(scanResult.receipt);
      setReceiptId(receipt.id);
      setEditStore(scanResult.receipt.store || "");
      setEditTotal(scanResult.receipt.total ? String(scanResult.receipt.total) : "");
      setEditDate(scanResult.receipt.date || new Date().toISOString().split("T")[0]);
      toast.success("Ticket escaneado. Revisa y confirma para añadir a Gastos.");
    } catch (err: any) {
      toast.error(err.message || "Error al escanear ticket");
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = async () => {
    const total = parseFloat(editTotal.replace(",", "."));
    if (!isFinite(total) || total <= 0) {
      toast.error("Introduce un total válido");
      return;
    }
    if (!receiptId) return;
    setSaving(true);
    try {
      const expense = await doCreateExpense({
        data: {
          amount: total,
          description: editStore || "Compra",
          date: editDate || new Date().toISOString().split("T")[0],
          receipt_id: receiptId,
        },
      });
      setExpenseId(expense.id);
      try {
        const inv = await doImportInv({ data: { receiptId } });
        toast.success(
          `Añadido a Gastos. Inventario: ${inv.added} añadidos, ${inv.skipped} ya presentes.`,
        );
      } catch (invErr: any) {
        toast.success("Añadido a Gastos");
        toast.error(`Inventario: ${invErr.message || "no se pudo importar"}`);
      }
    } catch (err: any) {
      toast.error(err.message || "No se pudo crear el gasto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Escanear ticket</h2>
        <p className="text-muted-foreground">
          Sube una foto del ticket para extraer los productos. Se adjuntará como gasto tras tu confirmación.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 p-8">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            ref={cameraRef}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            ref={uploadRef}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <Button onClick={() => cameraRef.current?.click()} disabled={scanning} className="flex-1">
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Hacer foto
            </Button>
            <Button variant="outline" onClick={() => uploadRef.current?.click()} disabled={scanning} className="flex-1">
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Subir imagen / PDF
            </Button>
          </div>
          {scanning && <p className="text-xs text-muted-foreground">Analizando ticket...</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <ReceiptIcon className="h-4 w-4" />
              <p className="font-semibold">Revisa los datos detectados</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="store">Comercio</Label>
                <Input id="store" value={editStore} onChange={(e) => setEditStore(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="total">Total (€)</Label>
                <Input
                  id="total"
                  inputMode="decimal"
                  value={editTotal}
                  onChange={(e) => setEditTotal(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="date">Fecha</Label>
                <Input id="date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
            </div>

            {result.items?.length > 0 && (
              <ul className="max-h-64 space-y-1 overflow-auto rounded border p-2 text-sm">
                {result.items.map((item: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {item.quantity && item.quantity !== 1 ? `${item.quantity}× ` : ""}
                      {item.name}
                    </span>
                    <span className="text-muted-foreground">
                      {item.total_price != null ? `€${item.total_price.toFixed(2)}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {expenseId ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex flex-1 items-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  Gasto añadido correctamente
                </div>
                <Button variant="outline" asChild>
                  <Link to="/finances">Ver en Gastos</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleConfirm} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Confirmar y añadir a Gastos
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
