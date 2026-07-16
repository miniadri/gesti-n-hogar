import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";

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

  return (
    <AppShell userName={profile?.full_name || undefined}>
      <Outlet />
    </AppShell>
  );
}
