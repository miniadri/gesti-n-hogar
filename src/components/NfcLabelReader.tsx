import { Nfc, ScanLine, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  onDetected: (value: string) => void;
  writeUrl?: string;
}

function nfcReaderConstructor() {
  return typeof window === "undefined" ? undefined : (window as any).NDEFReader;
}

function decodeRecord(record: any): string | null {
  if (record?.recordType !== "url" && record?.recordType !== "text" && record?.recordType !== "absolute-url") return null;
  if (typeof record?.data === "string") return record.data;
  if (record?.data instanceof DataView) {
    return new TextDecoder(record.encoding || "utf-8").decode(record.data.buffer, record.data.byteOffset, record.data.byteLength);
  }
  return null;
}

/** Web NFC for Android Chrome/PWA. QR remains the universal fallback. */
export function NfcLabelReader({ onDetected, writeUrl }: Props) {
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const supported = Boolean(nfcReaderConstructor());

  const read = async () => {
    const NDEFReader = nfcReaderConstructor();
    if (!NDEFReader) {
      toast.error("Este navegador no permite leer NFC. Usa Chrome en Android o escanea el QR.");
      return;
    }
    try {
      const reader = new NDEFReader();
      await reader.scan();
      setReading(true);
      setStatus("NFC activo: acerca una etiqueta al teléfono.");
      toast.message("Acerca una etiqueta NFC al teléfono");
      reader.onreadingerror = () => {
        setStatus("No se pudo leer esta etiqueta. Debe contener un registro URL o texto.");
      };
      reader.onreading = (event: any) => {
        const record = Array.from(event.message.records as any[])
          .map(decodeRecord)
          .find((value): value is string => Boolean(value));
        if (!record) {
          setStatus("La etiqueta no contiene una URL o código HomeSync legible.");
          toast.error("La etiqueta NFC no contiene una URL o código legible");
          return;
        }
        setReading(false);
        setStatus("Etiqueta NFC leída.");
        onDetected(record);
      };
    } catch (error: any) {
      setReading(false);
      setStatus(error?.message || "No se pudo activar NFC.");
      toast.error(error?.message || "No se pudo activar NFC");
    }
  };

  const write = async () => {
    const NDEFReader = nfcReaderConstructor();
    if (!NDEFReader || !writeUrl) return;
    try {
      setWriting(true);
      const writer = new NDEFReader();
      await writer.write({ records: [{ recordType: "url", data: writeUrl }] });
      setStatus("Etiqueta NFC programada correctamente.");
      toast.success("Etiqueta NFC programada con el acceso rápido de HomeSync");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo programar la etiqueta NFC");
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button type="button" variant="outline" onClick={read} disabled={reading}>
        <ScanLine className="mr-2 h-4 w-4" /> {reading ? "Leyendo NFC…" : "Leer NFC"}
      </Button>
      {writeUrl && <Button type="button" variant="outline" onClick={write} disabled={!supported || writing}>
        <Tag className="mr-2 h-4 w-4" /> {writing ? "Programando NFC…" : "Programar NFC"}
      </Button>}
      {!supported && <p className="text-xs text-muted-foreground sm:col-span-2"><Nfc className="mr-1 inline h-3.5 w-3.5" /> NFC requiere Chrome en Android (o la PWA instalada). El QR funciona en todos los móviles.</p>}
      {supported && status && <p className="text-xs text-muted-foreground sm:col-span-2" role="status">{status}</p>}
    </div>
  );
}
