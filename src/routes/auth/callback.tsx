import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client-app";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Completing sign-in — HomeSync" }],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        setError(error?.message || t("auth.couldNotComplete"));
        return;
      }
      router.navigate({ to: "/dashboard" });
    });
  }, [router, t]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-destructive">{t("auth.error")}</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
