import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

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

export const scanTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScanTicketInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: false });
    const model = gateway("google/gemini-3-flash-preview");

    const { output } = await generateText({
      model,
      output: Output.object({ schema: ReceiptSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extrae la información estructurada de este ticket de compra. Devuelve el comercio, la fecha (ISO), el total y una lista de productos con nombre, cantidad, precio unitario, precio total y categoría. Si no puedes leer algo, usa null.",
            },
            {
              type: "image_url",
              imageUrl: { url: data.imageUrl },
            },
          ],
        },
      ],
    });

    // Update receipt record
    const { data: stores } = await context.supabase
      .from("stores")
      .select("id, name")
      .ilike("name", output.store || "");
    const storeId = stores?.[0]?.id;

    await context.supabase
      .from("receipts")
      .update({
        store_id: storeId,
        total: output.total,
        receipt_date: output.date,
        status: "reviewed",
      })
      .eq("id", data.receiptId);

    if (output.items.length > 0) {
      await context.supabase.from("receipt_items").insert(
        output.items.map((item) => ({
          receipt_id: data.receiptId,
          name: item.name,
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price,
          total_price: item.total_price,
          category: item.category,
        })),
      );
    }

    return { receipt: output };
  });
