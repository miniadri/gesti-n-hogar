import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureOpenAccessSession } from "@/lib/open-access";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acceso — HomeSync" },
      { name: "description", content: "Acceso directo al panel del hogar HomeSync." },
      { property: "og:title", content: "Acceso — HomeSync" },
      { property: "og:description", content: "Acceso directo al panel del hogar HomeSync." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const enter = () => {
    setRetrying(true);
    setError(null);
    ensureOpenAccessSession()
      .then(() => router.navigate({ to: "/dashboard" }))
      .catch((e: any) => setError(e?.message || "No se pudo abrir la aplicación"))
      .finally(() => setRetrying(false));
  };

  useEffect(() => {
    enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
            <Home className="h-6 w-6" />
          </div>
          <CardTitle className="mt-3">HomeSync</CardTitle>
          <CardDescription>
            {error ? error : "Abriendo la aplicación…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Button onClick={enter} disabled={retrying} className="w-full">
              Reintentar
            </Button>
          ) : (
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
