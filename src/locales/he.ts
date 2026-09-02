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
    loadPgn: "טעינת PGN",
    folders: {
      basicExamples: "דוגמאות בסיסיות",
      games: "משחקים",
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
  moveList: {
    title: "מהלכים",
    startPosition: "עמדת הפתיחה",
    noMoves: "אין מהלכים במשחק הזה.",
  },
  loadPgn: {
    dropHint: "גררו לכאן קובץ PGN",
    chooseFile: "בחרו קובץ PGN",
    pasteLabel: "או הדביקו טקסט PGN",
    load: "טעינה",
    gamesTitle: "המשחקים בקובץ",
    gameFallback: "משחק {{number}}",
    versus: "נגד",
    movesLoaded: "מהלכים: {{total}}",
    emptyState: "עדיין לא נטען משחק.",
    errors: {
      empty: "לא נמצא PGN בקלט.",
      parse: "לא ניתן לקרוא את ה-PGN הזה. {{detail}}",
      parseGame: "לא ניתן לקרוא את משחק {{number}} בקובץ. {{detail}}",
      file: "לא ניתן לקרוא את הקובץ.",
    },
  },
  footer: {
    source: "מקור",
  },
};

export default he;
