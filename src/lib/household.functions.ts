import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InviteInput = z.object({
  role: z.enum(["admin", "member", "child"]).default("member"),
});

const JoinInviteInput = z.object({
  code: z.string().min(1),
});

const UpdateProfileInput = z.object({
  full_name: z.string().min(1).max(100).optional(),
  preferred_language: z.enum(["es", "en"]).optional(),
  preferred_currency: z.enum(["EUR", "USD", "GBP"]).optional(),
});

export const getHousehold = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("households")
      .select("*, household_members(*, user:user_id(*)), user_roles(*)")
      .eq("id", householdId)
      .single();
    if (error) throw error;
    return data;
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InviteInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { data: invite, error } = await context.supabase
      .from("household_invites")
      .insert({
        household_id: householdId,
        code,
        role: data.role,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return invite;
  });

export const joinHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => JoinInviteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: invite, error: inviteError } = await context.supabase
      .from("household_invites")
      .select("*, household:household_id(*)")
      .eq("code", data.code)
      .gt("expires_at", new Date().toISOString())
      .single();
    if (inviteError || !invite) throw new Error("Código inválido o expirado");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .single();

    await context.supabase.from("household_members").insert({
      household_id: invite.household_id,
      user_id: context.userId,
      display_name: profile?.full_name || "Miembro",
    });

    await context.supabase.from("user_roles").insert({
      user_id: context.userId,
      role: invite.role,
      household_id: invite.household_id,
    });

    return { ok: true, household: invite.household };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw error;
    return profile;
  });
