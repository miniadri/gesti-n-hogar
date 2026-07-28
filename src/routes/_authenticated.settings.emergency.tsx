import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

import { EmergencyPanel } from "@/components/EmergencyPanel";
import { getHousehold } from "@/lib/household.functions";

const householdQueryOptions = queryOptions({
  queryKey: ["household"],
  queryFn: () => getHousehold(),
});

export const Route = createFileRoute("/_authenticated/settings/emergency")({
  loader: ({ context }) => context.queryClient.ensureQueryData(householdQueryOptions),
  head: () => ({
    meta: [{ title: "Emergencia - HomeSync" }],
  }),
  component: EmergencySettingsPage,
});

function EmergencySettingsPage() {
  const { data } = useSuspenseQuery(householdQueryOptions);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          <h2 className="text-2xl font-bold tracking-tight">Emergencia</h2>
        </div>
        <p className="text-muted-foreground">
          Configura quién recibe alertas SOS y avisos importantes del hogar.
        </p>
      </div>

      <EmergencyPanel members={data.household_members ?? []} />
    </div>
  );
}
