import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { en } from "./en";
import { es } from "./es";

// Always initialise in Spanish so SSR and the first client render match.
// The stored/browser language is applied after hydration (see below).
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: "es",
    fallbackLng: "es",
    supportedLngs: ["es", "en"],
    interpolation: { escapeValue: false },
  });
}

export function detectStoredLanguage(): "es" | "en" {
  try {
    const stored = localStorage.getItem("homesync_lang");
    if (stored === "es" || stored === "en") return stored;
    return navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
  } catch {
    return "es";
  }
}

export function setLanguage(lng: "es" | "en") {
  i18n.changeLanguage(lng);
  try {
    localStorage.setItem("homesync_lang", lng);
    document.documentElement.setAttribute("lang", lng);
  } catch {
    /* ignore */
  }
}

export default i18n;
