import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { updateProfile } from "@/lib/household.functions";
import { toast } from "sonner";
import { setLanguage } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

const profileQueryOptions = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").single();
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/settings/localization")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQueryOptions),
  head: () => ({
    meta: [{ title: "Settings — HomeSync" }],
  }),
  component: LocalizationSettingsPage,
});

function LocalizationSettingsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(profileQueryOptions);
  const [language, setLanguageState] = useState<"es" | "en">(
    (data.preferred_language as "es" | "en") || (i18n.language as "es" | "en") || "es",
  );
  const [currency, setCurrency] = useState(data.preferred_currency || "EUR");
  const [darkMode, setDarkMode] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  const [submitting, setSubmitting] = useState(false);

  const doUpdate = useServerFn(updateProfile);

  // Reflect DB preference on mount
  useEffect(() => {
    if (data.preferred_language && data.preferred_language !== i18n.language) {
      setLanguage(data.preferred_language as "es" | "en");
    }
  }, [data.preferred_language, i18n.language]);

  const handleLangChange = (lng: "es" | "en") => {
    setLanguageState(lng);
    setLanguage(lng);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await doUpdate({ data: { preferred_language: language, preferred_currency: currency } });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("settings.prefsSaved"));
    } catch (err: any) {
      toast.error(err.message || t("errors.saveFailed"));
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
        <h2 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h2>
        <p className="text-muted-foreground">{t("settings.localizationSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("settings.languageAndCurrency")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings.language")}</Label>
              <select
                value={language}
                onChange={(e) => handleLangChange(e.target.value as "es" | "en")}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="es">{t("settings.languages.es")}</option>
                <option value="en">{t("settings.languages.en")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.currency")}</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="EUR">{t("settings.currencies.EUR")}</option>
                <option value="USD">{t("settings.currencies.USD")}</option>
                <option value="GBP">{t("settings.currencies.GBP")}</option>
              </select>
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? t("common.saving") : t("settings.savePrefs")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            {t("settings.appearance")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={toggleDark} className="w-full">
            {darkMode ? t("settings.lightMode") : t("settings.darkMode")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
