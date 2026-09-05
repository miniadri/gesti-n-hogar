import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InviteInput = z.object({
  role: z.enum(["admin", "member", "child"]).default("member"),
});

const JoinInviteInput = z.object({
  code: z.string().trim().min(1).max(32),
  replaceDefault: z.boolean().optional(),
});

const UpdateProfileInput = z.object({
  full_name: z.string().min(1).max(100).optional(),
  preferred_language: z.enum(["es", "en"]).optional(),
  preferred_currency: z.enum(["EUR", "USD", "GBP"]).optional(),
});

const CreateChildInput = z.object({
  display_name: z.string().trim().min(1).max(60),
});

const UpdateHouseholdInput = z.object({
  name: z.string().trim().min(1).max(80),
});

const KIOSK_MEMBER_NAME = "Kiosko cocina";

export const updateHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateHouseholdInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: hh, error } = await context.supabase
      .from("households")
      .update({ name: data.name })
      .eq("id", householdId)
      .select()
      .single();
    if (error) throw error;
    return hh;
  });

export const createChildMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateChildInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo un administrador del hogar puede crear miembros infantiles");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member, error } = await supabaseAdmin
      .from("household_members")
      .insert({
        household_id: householdId,
        display_name: data.display_name,
        is_child: true,
      })
      .select()
      .single();
    if (error) throw error;
    return member;
  });

export const ensureKioskMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: visibleMember, error: visibleError } = await context.supabase
      .from("household_members")
      .select("id, display_name, is_child, user_id")
      .eq("household_id", householdId)
      .eq("display_name", KIOSK_MEMBER_NAME)
      .maybeSingle();
    if (visibleError) throw visibleError;
    if (visibleMember) return visibleMember;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("household_members")
      .insert({
        household_id: householdId,
        display_name: KIOSK_MEMBER_NAME,
        is_child: false,
        user_id: null,
      })
      .select("id, display_name, is_child, user_id")
      .single();
    if (error) throw error;
    return created;
  });

const RenameMemberInput = z.object({
  member_id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(60),
});

export const renameMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RenameMemberInput.parse(input))
  .handler(async ({ data, context }) => {
    // Resolve the member's own household instead of assuming the caller's
    // "current" household (users may belong to more than one).
    const { data: target, error: targetError } = await context.supabase
      .from("household_members")
      .select("id, household_id, user_id")
      .eq("id", data.member_id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("Miembro no encontrado o sin acceso");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin && target.user_id !== context.userId) {
      throw new Error("Solo un administrador puede renombrar a otros miembros");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member, error } = await supabaseAdmin
      .from("household_members")
      .update({ display_name: data.display_name })
      .eq("id", data.member_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!member) throw new Error("No se pudo actualizar el nombre (permisos insuficientes)");
    return member;
  });




export const getHousehold = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("households")
      .select("*, household_members(*), user_roles(*)")
      .eq("id", householdId)
      .single();
    if (error) throw error;
    return data;
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: membership, error: membershipError } = await context.supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error("No autorizado para leer invitaciones de este hogar");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("household_invites")
      .select("id, code, role, expires_at, created_at, used_at, used_by")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const deleteInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("household_invites")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
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
    const code = data.code.toUpperCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("household_invites")
      .select("*, household:household_id(*)")
      .eq("code", code)
      .maybeSingle();
    if (inviteError || !invite) throw new Error("Código inválido");
    if (invite.used_at) throw new Error("Este código ya ha sido usado");
    if (new Date(invite.expires_at) <= new Date()) throw new Error("Este código ha caducado");


    // Already a member? no-op.
    const { data: existing } = await supabaseAdmin
      .from("household_members")
      .select("id")
      .eq("household_id", invite.household_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { ok: true, household: invite.household, alreadyMember: true };

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .single();

    // If requested and the user only has their auto-created default household
    // (sole member, no shared data yet), remove it so they don't end up in two.
    if (data.replaceDefault) {
      const { data: myHouseholds } = await supabaseAdmin
        .from("household_members")
        .select("household_id")
        .eq("user_id", context.userId);
      for (const row of myHouseholds ?? []) {
        const { count } = await supabaseAdmin
          .from("household_members")
          .select("id", { count: "exact", head: true })
          .eq("household_id", row.household_id);
        if ((count ?? 0) === 1) {
          await supabaseAdmin.from("households").delete().eq("id", row.household_id);
        }
      }
    }

    await supabaseAdmin.from("household_members").insert({
      household_id: invite.household_id,
      user_id: context.userId,
      display_name: profile?.full_name || "Miembro",
      is_child: invite.role === "child",
    });

    await supabaseAdmin.from("user_roles").insert({
      user_id: context.userId,
      role: invite.role,
      household_id: invite.household_id,
    });

    await supabaseAdmin
      .from("household_invites")
      .update({ used_at: new Date().toISOString(), used_by: context.userId })
      .eq("id", invite.id);

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
