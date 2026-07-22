import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { joinHousehold } from "@/lib/household.functions";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";

const PENDING_INVITE_KEY = "homesync_pending_invite_code";

const profileQueryOptions = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").single();
    if (error) throw error;
    return data;
  },
});

const householdQueryOptions = queryOptions({
  queryKey: ["household"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("households")
      .select("*, household_members(*), user_roles(*)")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(profileQueryOptions);
    await context.queryClient.ensureQueryData(householdQueryOptions);
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: profile } = useSuspenseQuery(profileQueryOptions);
  const { data: household } = useSuspenseQuery(householdQueryOptions);
  const queryClient = useQueryClient();
  const doJoin = useServerFn(joinHousehold);
  const processed = useRef(false);
  const realtimeStatus = useRealtimeSync(household?.id);

  useEffect(() => {
    if (processed.current) return;
    const code = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!code) return;
    processed.current = true;
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    doJoin({ data: { code, replaceDefault: true } })
      .then((res: any) => {
        if (res?.alreadyMember) return;
        toast.success(`Te has unido a "${res?.household?.name ?? "el hogar"}"`);
        queryClient.invalidateQueries({ queryKey: ["household"] });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      })
      .catch((err: any) => {
        toast.error(err?.message || "No se pudo aplicar el código de invitación");
      });
  }, [doJoin, queryClient]);

  return (
    <AppShell userName={profile?.full_name || undefined} realtimeStatus={realtimeStatus}>
      <Outlet />
    </AppShell>
  );
}
