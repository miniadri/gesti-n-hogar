import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Camera, Upload, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { scanTicket } from "@/lib/ocr.functions";
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
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doScan = useServerFn(scanTicket);

  const handleFile = async (file: File) => {
    setScanning(true);
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
      toast.success("Ticket escaneado");
    } catch (err: any) {
      toast.error(err.message || "Error al escanear ticket");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Escanear ticket</h2>
        <p className="text-muted-foreground">Sube una foto del ticket para extraer los productos</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 p-8">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            ref={fileRef}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={scanning} className="w-full max-w-xs">
            {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            {scanning ? "Escaneando..." : "Hacer foto / Subir"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="font-semibold">{result.store || "Comercio desconocido"}</p>
            <p className="text-sm text-muted-foreground">Total: €{result.total?.toFixed(2) || "0.00"}</p>
            <ul className="space-y-1 text-sm">
              {result.items.map((item: any, i: number) => (
                <li key={i} className="flex justify-between">
                  <span>{item.name}</span>
                  <span>€{item.total_price?.toFixed(2) || "0.00"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
