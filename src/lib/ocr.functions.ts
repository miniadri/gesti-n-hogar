import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { logHouseholdActivity } from "./activity.functions";

const ScanTicketInput = z.object({
  imageUrl: z.string().url(),
  receiptId: z.string().uuid(),
});

const ReceiptSchema = z.object({
  store: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().nullable(),
      unit_price: z.number().nullable(),
      total_price: z.number().nullable(),
      category: z.string().nullable(),
    }),
  ),
});

type Receipt = z.infer<typeof ReceiptSchema>;

const RECEIPT_PROMPT =
  "Extrae la información estructurada de este ticket de compra. Devuelve SOLO JSON válido con esta forma exacta:\n" +
  '{"store": string|null, "date": string|null (ISO YYYY-MM-DD), "total": number|null, "items": [{"name": string, "quantity": number|null, "unit_price": number|null, "total_price": number|null, "category": string|null}]}\n' +
  "Usa números crudos sin separador de miles y con punto decimal (ej: 1234.56). Si no puedes leer algo, usa null. No incluyas texto fuera del JSON.";

function extractJson(raw: string): string {
  let s = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const objStart = s.indexOf("{");
    const arrStart = s.indexOf("[");
    const isArr = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
    const start = isArr ? arrStart : objStart;
    const end = isArr ? s.lastIndexOf("]") : s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  return s;
}

function coerceReceipt(obj: any): Receipt {
  const toNum = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const cleaned = String(v).replace(/[€$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  };
  const items = Array.isArray(obj?.items) ? obj.items : [];
  return {
    store: obj?.store ? String(obj.store) : null,
    date: obj?.date ? String(obj.date) : null,
    total: toNum(obj?.total),
    items: items
      .map((it: any) => ({
        name: it?.name ? String(it.name) : "",
        quantity: toNum(it?.quantity),
        unit_price: toNum(it?.unit_price ?? it?.price),
        total_price: toNum(it?.total_price ?? it?.total),
        category: it?.category ? String(it.category) : null,
      }))
      .filter((it: any) => it.name),
  };
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function scanWithGemini(imageUrl: string): Promise<Receipt> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en Cloudflare para escanear tickets fuera de Lovable.");
  }

  const mediaResponse = await fetch(imageUrl);
  if (!mediaResponse.ok) {
    throw new Error(`No se pudo descargar el ticket para OCR (${mediaResponse.status})`);
  }

  const contentType = mediaResponse.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const data = arrayBufferToBase64(await mediaResponse.arrayBuffer());
  const model = process.env.GEMINI_OCR_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: RECEIPT_PROMPT },
              { inline_data: { mime_type: contentType, data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Gemini OCR respondió ${response.status}${message ? `: ${message.slice(0, 220)}` : ""}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text ?? "")
    .join("\n")
    .trim();
  if (!text) throw new Error("Gemini no devolvió texto OCR interpretable.");
  return coerceReceipt(JSON.parse(extractJson(text)));
}

async function scanWithLovableGateway(imageUrl: string): Promise<Receipt> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: false });
  const model = gateway("google/gemini-3-flash-preview");

  const isPdf = /\.pdf(\?|$)/i.test(imageUrl);
  const mediaContent: any = isPdf
    ? { type: "file", data: imageUrl, mediaType: "application/pdf" }
    : { type: "image", image: imageUrl };

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: ReceiptSchema }),
      messages: [{ role: "user", content: [{ type: "text", text: RECEIPT_PROMPT }, mediaContent] }],
    });
    return output;
  } catch (err: any) {
    if (NoObjectGeneratedError.isInstance(err) && err.text) {
      try {
        const parsed = JSON.parse(extractJson(err.text));
        return coerceReceipt(parsed);
      } catch {
        throw new Error("No se pudo interpretar el ticket. Prueba con una imagen más clara.");
      }
    }

    try {
      const { text } = await generateText({
        model,
        messages: [{ role: "user", content: [{ type: "text", text: RECEIPT_PROMPT }, mediaContent] }],
      });
      return coerceReceipt(JSON.parse(extractJson(text)));
    } catch {
      throw err;
    }
  }
}

async function scanReceiptImage(imageUrl: string): Promise<Receipt> {
  if (getGeminiApiKey()) return scanWithGemini(imageUrl);
  return scanWithLovableGateway(imageUrl);
}

export const scanTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScanTicketInput.parse(input))
  .handler(async ({ data, context }) => {
    const receipt = await scanReceiptImage(data.imageUrl);

    const { data: stores } = await context.supabase
      .from("stores")
      .select("id, name")
      .ilike("name", receipt.store || "");
    const storeId = stores?.[0]?.id;

    await context.supabase
      .from("receipts")
      .update({
        store_id: storeId,
        total: receipt.total,
        receipt_date: receipt.date,
        status: "reviewed",
      })
      .eq("id", data.receiptId);

    const householdId = (await context.supabase.rpc("current_household")).data;
    if (householdId) {
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "receipt",
        action: "scanned",
        title: `Ticket escaneado${receipt.store ? ` de ${receipt.store}` : ""}`,
        details: `${receipt.items.length} producto(s) detectado(s)${receipt.total != null ? ` · ${receipt.total.toFixed(2)} €` : ""}`,
        entityType: "receipt",
        entityId: data.receiptId,
        metadata: { store: receipt.store, total: receipt.total, date: receipt.date, items: receipt.items.length },
      });
    }

    if (receipt.items.length > 0) {
      await context.supabase.from("receipt_items").insert(
        receipt.items.map((item) => ({
          receipt_id: data.receiptId,
          name: item.name,
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price,
          total_price: item.total_price,
          category: item.category,
        })),
      );
    }

    return { receipt };
  });
