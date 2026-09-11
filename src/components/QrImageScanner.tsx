import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  onDetected: (value: string) => void;
}

/**
 * QR fallback which deliberately uses the browser's native photo/camera picker.
 * This is the same permission path used by the working Finance receipt camera.
 */
export function QrImageScanner({ onDetected }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [decoding, setDecoding] = useState(false);

  const decode = async (file: File) => {
    setDecoding(true);
    try {
      const imageUrl = URL.createObjectURL(file);
      try {
        const result = await new BrowserQRCodeReader().decodeFromImageUrl(imageUrl);
        onDetected(result.getText());
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    } catch {
      toast.error("No se encontró un QR legible en la imagen. Acércalo, enfócalo e inténtalo de nuevo.");
    } finally {
      setDecoding(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
    }
  };

  return <div className="grid gap-2 sm:grid-cols-2">
    <input ref={cameraRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) void decode(file);
    }} />
    <input ref={imageRef} className="hidden" type="file" accept="image/*" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) void decode(file);
    }} />
    <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={decoding}>
      {decoding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
      Hacer foto del QR
    </Button>
    <Button type="button" variant="outline" onClick={() => imageRef.current?.click()} disabled={decoding}>
      <ImagePlus className="mr-2 h-4 w-4" /> Elegir imagen QR
    </Button>
  </div>;
}
