import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-app";

/**
 * Tablas suscritas y query keys a invalidar cuando llega un cambio.
 * Mantener este mapa centralizado facilita el mantenimiento.
 */
const TABLE_QUERY_KEYS: Record<string, string[][]> = {
  tasks: [["tasks"], ["dashboard"]],
  shopping_lists: [["shopping-lists"], ["shopping"]],
  shopping_list_items: [["shopping-lists"], ["shopping"], ["shopping-items"]],
  inventory_items: [["inventory"], ["dashboard"]],
  medicines: [["medicines"], ["inventory"], ["dashboard"]],
  household_members: [["household"], ["members"]],
  households: [["household"]],
  wishlist_items: [["wishlist"]],
};

export type RealtimeStatus = "connecting" | "live" | "error";

/**
 * Suscribe la app a los cambios de las tablas del hogar mediante un único canal.
 * Debe montarse una sola vez (en el layout autenticado) por sesión.
 */
export function useRealtimeSync(householdId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    if (!householdId) return;

    const channel = supabase.channel(`household:${householdId}`);

    for (const [table, keys] of Object.entries(TABLE_QUERY_KEYS)) {
      channel.on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table,
          filter: `household_id=eq.${householdId}`,
        },
        () => {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        },
      );
    }

    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") setStatus("live");
      else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
        setStatus("error");
      } else {
        setStatus("connecting");
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, queryClient]);

  return status;
}
