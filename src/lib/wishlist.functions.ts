import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WishInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  url: z.string().trim().url().max(2000).optional().nullable(),
  estimated_price: z.number().nonnegative().max(1000000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  for_member_id: z.string().uuid(),
});

const UpdateWishInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  url: z.string().trim().url().max(2000).optional().nullable(),
  estimated_price: z.number().nonnegative().max(1000000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["active", "fulfilled", "archived"]).optional(),
});

const ReactInput = z.object({
  id: z.string().uuid(),
  reaction: z.enum(["pending", "liked", "dismissed"]),
});

const ClaimInput = z.object({
  wishlist_item_id: z.string().uuid(),
  status: z.enum(["considering", "purchased", "gifted"]).default("considering"),
  notes: z.string().trim().max(1000).optional().nullable(),
  tracked_price: z.number().nonnegative().max(1000000).optional().nullable(),
  tracked_store: z.string().trim().max(80).optional().nullable(),
  tracked_url: z.string().trim().url().max(2000).optional().nullable(),
});

const UpdateClaimInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["considering", "purchased", "gifted"]).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  tracked_price: z.number().nonnegative().max(1000000).optional().nullable(),
  tracked_store: z.string().trim().max(80).optional().nullable(),
  tracked_url: z.string().trim().url().max(2000).optional().nullable(),
});

async function resolveContext(context: any) {
  const householdId = (await context.supabase.rpc("current_household")).data as string | null;
  if (!householdId) throw new Error("No household");
  const { data: me, error } = await context.supabase
    .from("household_members")
    .select("id, display_name, is_child")
    .eq("household_id", householdId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!me) throw new Error("Miembro no encontrado en el hogar");
  return { householdId, me };
}

export const listWishlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { householdId, me } = await resolveContext(context);

    const { data: items, error } = await context.supabase
      .from("wishlist_items")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // RLS already hides claims on wishes addressed to the caller, so this is
    // safe: the recipient simply gets no rows back for their own wishes.
    const { data: claims, error: claimsError } = await context.supabase
      .from("wishlist_claims")
      .select("*")
      .eq("household_id", householdId);
    if (claimsError) throw claimsError;

    return { items: items ?? [], claims: claims ?? [], me };
  });

export const createWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WishInput.parse(input))
  .handler(async ({ data, context }) => {
    const { householdId, me } = await resolveContext(context);
    const { data: row, error } = await context.supabase
      .from("wishlist_items")
      .insert({
        household_id: householdId,
        created_by_member_id: me.id,
        for_member_id: data.for_member_id,
        title: data.title,
        description: data.description ?? null,
        url: data.url ?? null,
        estimated_price: data.estimated_price ?? null,
        priority: data.priority,
        recipient_reaction: data.for_member_id === me.id ? "liked" : "pending",
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateWishInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("wishlist_items")
      .update(rest)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("No se pudo actualizar el deseo (permisos insuficientes)");
    return row;
  });

export const reactToWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReactInput.parse(input))
  .handler(async ({ data, context }) => {
    const { me } = await resolveContext(context);
    const { data: item, error: itemError } = await context.supabase
      .from("wishlist_items")
      .select("id, for_member_id")
      .eq("id", data.id)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) throw new Error("Deseo no encontrado");
    if (item.for_member_id !== me.id) {
      throw new Error("Solo la persona destinataria puede aceptar o descartar el deseo");
    }
    const { data: row, error } = await context.supabase
      .from("wishlist_items")
      .update({ recipient_reaction: data.reaction })
      .eq("id", data.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const deleteWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("wishlist_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const claimWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ClaimInput.parse(input))
  .handler(async ({ data, context }) => {
    const { householdId, me } = await resolveContext(context);
    const { data: item, error: itemError } = await context.supabase
      .from("wishlist_items")
      .select("id, for_member_id")
      .eq("id", data.wishlist_item_id)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) throw new Error("Deseo no encontrado");
    if (item.for_member_id === me.id) throw new Error("No puedes reservar un deseo tuyo");

    const { data: row, error } = await context.supabase
      .from("wishlist_claims")
      .insert({
        wishlist_item_id: data.wishlist_item_id,
        household_id: householdId,
        claimer_member_id: me.id,
        status: data.status,
        notes: data.notes ?? null,
        tracked_price: data.tracked_price ?? null,
        tracked_store: data.tracked_store ?? null,
        tracked_url: data.tracked_url ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateWishlistClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateClaimInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("wishlist_claims")
      .update(rest)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("No se pudo actualizar la reserva");
    return row;
  });

export const releaseWishlistClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("wishlist_claims").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
