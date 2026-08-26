import { createFileRoute, redirect } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

import { DeviceCapabilityExperiment } from "@/components/DeviceCapabilityExperiment";
import { FallDetectionExperiment } from "@/components/FallDetectionExperiment";
import { FirecrawlStoreExperiment } from "@/components/FirecrawlStoreExperiment";
import { StoreCatalogSourceExperiment } from "@/components/StoreCatalogSourceExperiment";
import { StoreCatalogProviderLab } from "@/components/StoreCatalogProviderLab";

const EXPERIMENTAL_ADMIN_EMAILS = new Set([
  "adri.miniadri@gmail.com",
  "adriturcafamiliar@gmail.com",
  "adrian.moya.manteca@gmail.com",
]);

export const Route = createFileRoute("/_authenticated/settings/experimental")({
  beforeLoad: ({ context }) => {
    const email = context.user?.email?.toLowerCase();
    if (!email || !EXPERIMENTAL_ADMIN_EMAILS.has(email)) {
      throw redirect({ to: "/settings" });
    }
  },
  head: () => ({
    meta: [{ title: "Experimental - HomeSync" }],
  }),
  component: ExperimentalPage,
});

function ExperimentalPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">Experimental</h2>
        </div>
        <p className="text-muted-foreground">
          Pruebas privadas de funciones sensibles antes de llevarlas al uso diario.
        </p>
      </div>

      <DeviceCapabilityExperiment />

      <FallDetectionExperiment />

      <StoreCatalogSourceExperiment />

      <StoreCatalogProviderLab />

      <FirecrawlStoreExperiment />

    </div>
  );
}
