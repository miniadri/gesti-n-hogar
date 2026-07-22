import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import { en } from "./en";
import { es } from "./es";

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        es: { translation: es },
      },
      fallbackLng: "es",
      supportedLngs: ["es", "en"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
        lookupLocalStorage: "homesync_lang",
      },
    });
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
