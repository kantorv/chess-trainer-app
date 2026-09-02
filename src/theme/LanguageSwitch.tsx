import TranslateIcon from "@mui/icons-material/TranslateRounded";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { useTranslation } from "react-i18next";
import { asAppLanguage, supportedLanguages } from "../i18n";

/**
 * Language selector. A Select rather than a two-state toggle so adding a third
 * language is a catalog change and nothing else. Direction follows
 * automatically — `AppThemeWithLang` derives it from the language this sets.
 */
export default function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  const currentLang = asAppLanguage(i18n.language);

  const handleLanguageChange = (event: SelectChangeEvent<string>) => {
    const newLanguage = asAppLanguage(event.target.value);
    if (newLanguage !== currentLang) {
      void i18n.changeLanguage(newLanguage);
    }
  };

  return (
    <FormControl size="small" sx={{ minWidth: 130 }}>
      <Select
        value={currentLang}
        onChange={handleLanguageChange}
        displayEmpty
        aria-label={t("nav.switchLanguage")}
        title={t("nav.switchLanguage")}
        renderValue={(value) => (
          <>
            <TranslateIcon
              fontSize="small"
              sx={{ mr: 1, ml: -0.5, opacity: 0.56, verticalAlign: "middle" }}
            />
            {t(`language.${value}`)}
          </>
        )}
        sx={{
          color: "inherit",
          "& .MuiSelect-icon": { color: "inherit" },
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "divider" },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "text.secondary",
          },
        }}
      >
        {supportedLanguages.map((lang) => (
          <MenuItem key={lang} value={lang} dense>
            {t(`language.${lang}`)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
