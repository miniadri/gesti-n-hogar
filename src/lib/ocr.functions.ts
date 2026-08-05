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

export const scanTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScanTicketInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: false });
    const model = gateway("google/gemini-3-flash-preview");

    const isPdf = /\.pdf(\?|$)/i.test(data.imageUrl);
    const mediaContent: any = isPdf
      ? { type: "file", data: data.imageUrl, mediaType: "application/pdf" }
      : { type: "image", image: data.imageUrl };

    const prompt =
      "Extrae la información estructurada de este ticket de compra. Devuelve SOLO JSON válido con esta forma exacta:\n" +
      '{"store": string|null, "date": string|null (ISO YYYY-MM-DD), "total": number|null, "items": [{"name": string, "quantity": number|null, "unit_price": number|null, "total_price": number|null, "category": string|null}]}\n' +
      "Usa números crudos sin separador de miles y con punto decimal (ej: 1234.56). Si no puedes leer algo, usa null. No incluyas texto fuera del JSON.";

    let receipt: Receipt;
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: ReceiptSchema }),
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, mediaContent] }],
      });
      receipt = output;
    } catch (err: any) {
      if (NoObjectGeneratedError.isInstance(err) && err.text) {
        try {
          const parsed = JSON.parse(extractJson(err.text));
          receipt = coerceReceipt(parsed);
        } catch {
          throw new Error("No se pudo interpretar el ticket. Prueba con una imagen más clara.");
        }
      } else {
        // Fallback: plain text call
        try {
          const { text } = await generateText({
            model,
            messages: [{ role: "user", content: [{ type: "text", text: prompt }, mediaContent] }],
          });
          receipt = coerceReceipt(JSON.parse(extractJson(text)));
        } catch {
          throw err;
        }
      }
    }

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
