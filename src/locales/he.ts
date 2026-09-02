import type en from "./en";

/**
 * Typed as `typeof en`, so a key added to the English catalog and forgotten
 * here is a compile error rather than a string that silently falls back.
 */
const he: typeof en = {
  app: {
    brandMark: "CA",
    brandText: "ניתוח שחמט",
  },
  nav: {
    ariaLabel: "ניווט ראשי",
    toggleColorMode: "מעבר בין מצב בהיר לכהה",
    switchLanguage: "החלפת שפה",
    basicBoard: "לוח בסיסי",
    movingPiece: "דוגמת הזזת כלים",
    engineEvaluation: "הדגמת הערכת מנוע",
    playEngine: "משחק מול המנוע 1",
    folders: {
      basicExamples: "דוגמאות בסיסיות",
    },
  },
  language: {
    en: "English",
    he: "עברית",
  },
  panel: {
    analysisTitle: "ניתוח",
    analysisPlaceholder: "ההערכה ורשימת המהלכים יופיעו כאן.",
  },
  footer: {
    source: "מקור",
  },
};

export default he;
