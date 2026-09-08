import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ensureOpenAccessSession } from "@/lib/open-access";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HomeSync — Panel del hogar" },
      {
        name: "description",
        content: "Compra, inventario, tareas, medicación y calendario del hogar en un solo panel.",
      },
      { property: "og:title", content: "HomeSync — Panel del hogar" },
      {
        property: "og:description",
        content: "Compra, inventario, tareas, medicación y calendario del hogar en un solo panel.",
      },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ensureOpenAccessSession()
      .then(() => setReady(true))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Navigate to="/auth" />;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <Navigate to="/dashboard" />;
}
