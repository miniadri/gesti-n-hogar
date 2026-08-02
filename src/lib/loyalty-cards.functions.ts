import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const CardInput = z.object({
  id: z.string().uuid().optional(),
  merchant: z.string().trim().min(1).max(120),
  card_number: z.string().trim().max(120).nullish(),
  barcode: z.string().trim().max(120).nullish(),
  barcode_format: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(500).nullish(),
  color: z.string().trim().max(20).nullish(),
  front_image_url: z.string().url().nullish(),
  back_image_url: z.string().url().nullish(),
  is_shared: z.boolean().optional(),
  is_favorite: z.boolean().optional(),
});

export const listLoyaltyCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    const query = context.supabase
      .from("loyalty_cards")
      .select("*")
      .order("is_favorite", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("merchant", { ascending: true });
    const { data, error } = householdId
      ? await query.or(`user_id.eq.${context.userId},and(is_shared.eq.true,household_id.eq.${householdId})`)
      : await query.eq("user_id", context.userId);
    if (error) throw error;
    return data ?? [];
  });

export const upsertLoyaltyCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CardInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    const payload = {
      user_id: context.userId,
      merchant: data.merchant,
      card_number: data.card_number ?? null,
      barcode: data.barcode ?? null,
      barcode_format: data.barcode_format ?? null,
      notes: data.notes ?? null,
      color: data.color ?? null,
      front_image_url: data.front_image_url ?? null,
      back_image_url: data.back_image_url ?? null,
      is_shared: data.is_shared ?? false,
      is_favorite: data.is_favorite ?? false,
      household_id: householdId ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("loyalty_cards")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("loyalty_cards")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteLoyaltyCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("loyalty_cards")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleLoyaltyFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), is_favorite: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("loyalty_cards")
      .update({ is_favorite: data.is_favorite })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const markLoyaltyCardUsed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: readError } = await context.supabase
      .from("loyalty_cards")
      .select("id,user_id,use_count")
      .eq("id", data.id)
      .single();
    if (readError) throw readError;

    const { data: row, error } = await context.supabase
      .from("loyalty_cards")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (existing?.use_count ?? 0) + 1,
      })
      .eq("id", data.id)
      .eq("user_id", existing.user_id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

const ScanInput = z.object({ imageUrl: z.string().url() });

const CardScanSchema = z.object({
  merchant: z.string().nullable(),
  card_number: z.string().nullable(),
  barcode: z.string().nullable(),
  barcode_format: z.string().nullable(),
  notes: z.string().nullable(),
});

export const scanLoyaltyCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScanInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: false });
    const model = gateway("google/gemini-3-flash-preview");

    const prompt =
      "Analiza esta foto de una tarjeta de fidelización de un comercio (NUNCA es una tarjeta de crédito o débito). " +
      "Extrae el nombre del comercio y los datos identificativos. Devuelve SOLO JSON válido con esta forma: " +
      '{"merchant": string|null, "card_number": string|null, "barcode": string|null, "barcode_format": string|null (EAN13, CODE128, QR, etc.), "notes": string|null}. ' +
      "Si algo no se ve, usa null. No incluyas texto fuera del JSON. Si la imagen parece una tarjeta bancaria (Visa, Mastercard, IBAN, CVV), devuelve todo null.";

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: CardScanSchema }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image", image: data.imageUrl },
            ],
          },
        ],
      });
      return output;
    } catch (err: any) {
      if (NoObjectGeneratedError.isInstance(err) && err.text) {
        try {
          const s = err.text.replace(/```json|```/g, "").trim();
          const start = s.indexOf("{");
          const end = s.lastIndexOf("}");
          const parsed = JSON.parse(s.slice(start, end + 1));
          return CardScanSchema.parse({
            merchant: parsed.merchant ?? null,
            card_number: parsed.card_number ?? null,
            barcode: parsed.barcode ?? null,
            barcode_format: parsed.barcode_format ?? null,
            notes: parsed.notes ?? null,
          });
        } catch {
          throw new Error("No se pudo reconocer la tarjeta. Rellena los datos manualmente.");
        }
      }
      throw err;
    }
  });
