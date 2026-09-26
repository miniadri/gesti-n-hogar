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

const PhotoSide = z.enum(["front", "back"]);
const PhotoRevisionInput = z.object({
  cardId: z.string().uuid(),
  side: PhotoSide,
  checksum: z.string().min(32).max(128),
  byteSize: z.number().int().positive().max(2_000_000),
  contentType: z.enum(["image/webp", "image/jpeg"]),
});

/** Stores only a non-sensitive revision marker: never the photo itself. */
export const publishLoyaltyPhotoRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PhotoRevisionInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: card, error: cardError } = await db
      .from("loyalty_cards")
      .select("id,user_id,household_id,is_shared")
      .eq("id", data.cardId)
      .eq("user_id", context.userId)
      .single();
    if (cardError || !card) throw new Error("No puedes publicar fotos de esta tarjeta");
    if (!card.is_shared || !card.household_id) {
      throw new Error("Comparte primero la tarjeta con el hogar");
    }
    const { data: existing } = await db
      .from("loyalty_card_photo_revisions")
      .select("id,version")
      .eq("card_id", data.cardId)
      .eq("side", data.side)
      .maybeSingle();
    const payload = {
      card_id: data.cardId,
      owner_id: context.userId,
      household_id: card.household_id,
      side: data.side,
      version: (existing?.version ?? 0) + 1,
      checksum: data.checksum,
      byte_size: data.byteSize,
      content_type: data.contentType,
      revoked_at: null,
    };
    const result = existing
      ? await db.from("loyalty_card_photo_revisions").update(payload).eq("id", existing.id).select().single()
      : await db.from("loyalty_card_photo_revisions").insert(payload).select().single();
    if (result.error) throw result.error;
    return result.data;
  });

export const listLoyaltyPhotoRevisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data: householdId } = await context.supabase.rpc("current_household");
    const cardsQuery = context.supabase.from("loyalty_cards").select("id");
    const { data: cards, error: cardsError } = householdId
      ? await cardsQuery.or(`user_id.eq.${context.userId},and(is_shared.eq.true,household_id.eq.${householdId})`)
      : await cardsQuery.eq("user_id", context.userId);
    if (cardsError) throw cardsError;
    const cardIds = (cards ?? []).map((card: { id: string }) => card.id);
    if (cardIds.length === 0) return [];
    const { data, error } = await db
      .from("loyalty_card_photo_revisions")
      .select("id,card_id,owner_id,side,version,checksum,byte_size,content_type,created_at")
      .in("card_id", cardIds)
      .is("revoked_at", null);
    if (error) throw error;
    return data ?? [];
  });

const TransferRequestInput = z.object({
  revisionId: z.string().uuid(),
  recipientPublicKey: z.string().min(100).max(2000),
});

/** A recipient asks for one photo; the owner uploads only after this request. */
export const requestLoyaltyPhotoTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TransferRequestInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: revision, error } = await db
      .from("loyalty_card_photo_revisions")
      .select("id,card_id,owner_id")
      .eq("id", data.revisionId)
      .is("revoked_at", null)
      .single();
    if (error || !revision) throw new Error("La actualización ya no está disponible");
    if (revision.owner_id === context.userId) throw new Error("Esta foto ya pertenece a tu tarjeta");
    const { data: existing } = await db
      .from("loyalty_photo_transfers")
      .select("id,status")
      .eq("photo_revision_id", data.revisionId)
      .eq("recipient_id", context.userId)
      .in("status", ["requested", "ready"])
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing) return existing;
    const { data: transfer, error: insertError } = await db
      .from("loyalty_photo_transfers")
      .insert({
        photo_revision_id: revision.id,
        card_id: revision.card_id,
        sender_id: revision.owner_id,
        recipient_id: context.userId,
        recipient_public_key: data.recipientPublicKey,
        status: "requested",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (insertError) throw insertError;
    return transfer;
  });

export const listLoyaltyPhotoTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data, error } = await db
      .from("loyalty_photo_transfers")
      .select("id,card_id,photo_revision_id,sender_id,recipient_id,recipient_public_key,encrypted_key,encryption_iv,object_path,status,expires_at,loyalty_card_photo_revisions(side,checksum,content_type),loyalty_cards(merchant)")
      .or(`sender_id.eq.${context.userId},recipient_id.eq.${context.userId}`)
      .in("status", ["requested", "ready"])
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

const MarkTransferReadyInput = z.object({
  transferId: z.string().uuid(),
  encryptedKey: z.string().min(100).max(2000),
  iv: z.string().min(12).max(100),
  objectPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/i),
});

export const markLoyaltyPhotoTransferReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MarkTransferReadyInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: transfer, error } = await db
      .from("loyalty_photo_transfers")
      .select("id,sender_id,status,expires_at")
      .eq("id", data.transferId)
      .single();
    if (error || !transfer || transfer.sender_id !== context.userId || transfer.status !== "requested") {
      throw new Error("La solicitud ya no está disponible para enviar");
    }
    if (new Date(transfer.expires_at).getTime() <= Date.now()) throw new Error("La solicitud ha caducado");
    if (data.objectPath !== `${context.userId}/${data.transferId}.bin`) throw new Error("Ruta temporal inválida");
    const { error: updateError } = await db
      .from("loyalty_photo_transfers")
      .update({ status: "ready", encrypted_key: data.encryptedKey, encryption_iv: data.iv, object_path: data.objectPath })
      .eq("id", data.transferId)
      .eq("sender_id", context.userId)
      .eq("status", "requested");
    if (updateError) throw updateError;
    return { ok: true };
  });

export const completeLoyaltyPhotoTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ transferId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: transfer, error } = await db
      .from("loyalty_photo_transfers")
      .select("id,recipient_id,status,object_path")
      .eq("id", data.transferId)
      .single();
    if (error || !transfer || transfer.recipient_id !== context.userId || transfer.status !== "ready") {
      throw new Error("La transferencia ya no está disponible");
    }
    if (transfer.object_path) {
      const { error: removeError } = await context.supabase.storage
        .from("loyalty-photo-transfers")
        .remove([transfer.object_path]);
      if (removeError) throw removeError;
    }
    const { error: updateError } = await db
      .from("loyalty_photo_transfers")
      .update({ status: "received", received_at: new Date().toISOString() })
      .eq("id", data.transferId)
      .eq("recipient_id", context.userId);
    if (updateError) throw updateError;
    return { ok: true };
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
