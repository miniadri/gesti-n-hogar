import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTelegramToUsers } from "./notify.server";

const SuggestInput = z.object({
  merchant_name: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const submitMerchantSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SuggestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("merchant_suggestions")
      .insert({
        user_id: context.userId,
        merchant_name: data.merchant_name,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Notify all admins via Telegram (best effort — no throw on failure).
    try {
      const { data: admins } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (admins ?? []).map((a: any) => a.user_id).filter(Boolean);
      if (adminIds.length > 0) {
        await sendTelegramToUsers(
          context.supabase,
          adminIds,
          `🏪 <b>Nueva sugerencia de comercio</b>\n\n<b>${data.merchant_name}</b>${
            data.notes ? `\n\n${data.notes}` : ""
          }`,
        );
      }
    } catch (e) {
      console.error("Failed to notify admins of merchant suggestion", e);
    }

    return row;
  });

export const listMySuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("merchant_suggestions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
