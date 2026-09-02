import * as React from "react";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { enUS, heIL } from "@mui/material/locale";
import { useTranslation } from "react-i18next";
import { asAppLanguage, rtlLanguages, type AppLanguage } from "../i18n";
import { ltrCache, rtlCache } from "./rtlCache";
import { colorSchemes, components, shape, typography } from "./themePrimitives";

const getLocale = (language: AppLanguage) => (language === "he" ? heIL : enUS);

/**
 * The single owner of both axes of the look: the color scheme (light/dark, via
 * `colorSchemes` + CSS variables) and the text direction, which is derived from
 * the active i18n language rather than stored separately. Changing the language
 * therefore swaps the emotion cache, the theme `direction` and the MUI locale
 * bundle together, which is why they cannot live in separate providers.
 */
export default function AppThemeWithLang({
  children,
}: {
  children: React.ReactNode;
}) {
  const { i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const direction = rtlLanguages.includes(language) ? "rtl" : "ltr";
  const cache = direction === "rtl" ? rtlCache : ltrCache;
  const locale = getLocale(language);

  React.useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
    document.body.dir = direction;
  }, [direction, language]);

  const theme = React.useMemo(
    () =>
      createTheme(
        {
          direction,
          cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
          colorSchemes,
          typography,
          shape,
          components,
        },
        locale,
      ),
    [direction, locale],
  );

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme} disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
