import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en";
import he from "./locales/he";

export const supportedLanguages = ["en", "he"] as const;

export type AppLanguage = (typeof supportedLanguages)[number];

/** Languages whose layout mirrors. `AppThemeWithLang` derives direction from this. */
export const rtlLanguages: readonly AppLanguage[] = ["he"];

export const defaultLanguage: AppLanguage = "en";

/**
 * Catalogs are inlined rather than fetched through i18next-http-backend: this
 * app ships a handful of shell strings, so a request per language would only
 * add a loading state. The detector still earns its place — it picks the
 * initial language from the browser and remembers the user's choice.
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
    },
    fallbackLng: defaultLanguage,
    supportedLngs: [...supportedLanguages],
    // Collapses a detected `he-IL` to `he`, so `i18n.language` is always one of
    // `supportedLanguages` and the direction lookup never has to strip a region.
    load: "languageOnly",
    interpolation: { escapeValue: false },
    // Resources are inline, so there is nothing to wait for — suspending here
    // would only add a blank first paint.
    react: { useSuspense: false },
  });

/** Narrows whatever i18next reports to a language this app actually ships. */
export const asAppLanguage = (language: string | undefined): AppLanguage => {
  const base = (language ?? "").split("-")[0];
  return supportedLanguages.includes(base as AppLanguage)
    ? (base as AppLanguage)
    : defaultLanguage;
};

export default i18n;
