import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

interface Props {
  value: string;
  format?: string | null;
  className?: string;
}

/** Renders a barcode or QR code from a value. Falls back to CODE128 for unknown formats. */
export function BarcodeDisplay({ value, format, className }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fmt = (format || "").toUpperCase();
  const isQR = fmt === "QR" || fmt === "QRCODE" || fmt === "QR_CODE";

  useEffect(() => {
    if (!value) return;
    if (isQR) {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, value, { margin: 1, width: 220 }).catch(() => {});
      }
      return;
    }
    if (!svgRef.current) return;
    const jsFormatMap: Record<string, string> = {
      EAN13: "EAN13",
      EAN8: "EAN8",
      UPC: "UPC",
      UPCA: "UPC",
      CODE128: "CODE128",
      CODE39: "CODE39",
      ITF: "ITF14",
      ITF14: "ITF14",
    };
    const chosen = jsFormatMap[fmt] || "CODE128";
    try {
      JsBarcode(svgRef.current, value, {
        format: chosen,
        width: 2,
        height: 80,
        displayValue: true,
        margin: 4,
      });
    } catch {
      // last-resort fallback to CODE128
      try {
        JsBarcode(svgRef.current, value, { format: "CODE128", width: 2, height: 80, margin: 4 });
      } catch {
        /* noop */
      }
    }
  }, [value, fmt, isQR]);

  if (!value) return null;
  return (
    <div className={className}>
      {isQR ? (
        <canvas ref={canvasRef} className="mx-auto rounded bg-white p-2" />
      ) : (
        <svg ref={svgRef} className="mx-auto block max-w-full rounded bg-white" />
      )}
    </div>
  );
}
