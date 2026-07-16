import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Globe, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { updateProfile } from "@/lib/household.functions";
import { toast } from "sonner";

const profileQueryOptions = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").single();
    if (error) throw error;
    return data;
  },
});

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings/localization")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQueryOptions),
  head: () => ({
    meta: [{ title: "Ajustes - HomeSync" }],
  }),
  component: LocalizationSettingsPage,
});

function LocalizationSettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(profileQueryOptions);
  const [language, setLanguage] = useState(data.preferred_language || "es");
  const [currency, setCurrency] = useState(data.preferred_currency || "EUR");
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains("dark"));
  const [submitting, setSubmitting] = useState(false);

  const doUpdate = useServerFn(updateProfile);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await doUpdate({ data: { preferred_language: language, preferred_currency: currency } });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Preferencias guardadas");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Ajustes</h2>
        <p className="text-muted-foreground">Idioma, moneda y apariencia</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Idioma y moneda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Idioma</Label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="EUR">Euro (€)</option>
                <option value="USD">Dólar ($)</option>
                <option value="GBP">Libra (£)</option>
              </select>
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Guardando..." : "Guardar preferencias"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            Apariencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={toggleDark} className="w-full">
            {darkMode ? "Modo claro" : "Modo oscuro"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
