// To add a new locale:
//   1. Drop a JSON file in app/i18n/locales/<code>.json mirroring en.json keys
//   2. Import it below and add it to SUPPORTED_LOCALES + resources
//   3. Optional: add a prefix alias (e.g. "pt" → "pt-BR") in resolveLocale
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";

export const SUPPORTED_LOCALES = ["en", "es", "de", "fr", "pt-BR"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function resolveLocale(raw: string | undefined | null): SupportedLocale {
  if (!raw) return "en";
  const exact = SUPPORTED_LOCALES.find(
    (l) => l.toLowerCase() === raw.toLowerCase(),
  );
  if (exact) return exact;
  // match language prefix (e.g. "pt" → "pt-BR", "fr-CA" → "fr")
  const prefix = raw.split(/[-_]/)[0].toLowerCase();
  const prefixAliases: Record<string, SupportedLocale> = {
    pt: "pt-BR",
  };
  if (prefixAliases[prefix]) return prefixAliases[prefix];
  const byPrefix = SUPPORTED_LOCALES.find((l) =>
    l.toLowerCase().startsWith(prefix),
  );
  return byPrefix ?? "en";
}

export function createI18n(locale: SupportedLocale = "en") {
  const instance = i18n.createInstance();
  instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: "en",
    ns: ["app"],
    defaultNS: "app",
    resources: {
      en: { app: en },
      es: { app: es },
      de: { app: de },
      fr: { app: fr },
      "pt-BR": { app: ptBR },
    },
    interpolation: { escapeValue: false },
  });
  return instance;
}
