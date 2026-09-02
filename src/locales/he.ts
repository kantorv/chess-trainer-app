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
    playWithEngine: "משחק מול המנוע",
    loadPgn: "טעינת PGN",
    folders: {
      basicExamples: "דוגמאות בסיסיות",
      engine: "מנוע",
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
  gamePanel: {
    tabs: {
      moves: "מהלכים",
      info: "פרטים",
      load: "טעינת PGN",
    },
    controls: {
      first: "עמדת פתיחה",
      previous: "המהלך הקודם",
      next: "המהלך הבא",
      last: "העמדה הסופית",
      flip: "היפוך הלוח",
    },
    info: {
      empty: "טענו משחק כדי לראות את פרטיו.",
      event: "אירוע",
      site: "מקום",
      date: "תאריך",
      round: "סיבוב",
      white: "לבן",
      black: "שחור",
      result: "תוצאה",
      eco: "ECO",
      opening: "פתיחה",
      timeControl: "בקרת זמן",
      termination: "סיום",
    },
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
  playEngine: {
    tabs: {
      game: "משחק",
      engine: "מנוע",
      lines: "וריאציות",
    },
    evalBar: "הערכה",
    status: {
      yourTurn: "התור שלך",
      engineTurn: "המנוע חושב…",
      reviewing: "צפייה במהלך קודם",
    },
    settings: {
      strength: "עוצמה",
      strengthValue: "רמה {{level}} (בערך {{elo}} אלו)",
      depth: "עומק חיפוש",
      moveTime: "זמן למהלך",
      moveTimeValue: "{{seconds}} שניות",
      moveTimeNone: "ללא הגבלה",
      multiPv: "מספר הווריאציות להצגה",
      threads: "תהליכונים",
      hash: "זיכרון גיבוב (MB)",
      unsupported: "לגרסת המנוע הזו אין אפשרות \"{{option}}\".",
      fixed: "גרסת המנוע הזו מקבעת את {{option}} על {{value}}.",
      playAs: "המשחק בצבע",
      white: "לבן",
      black: "שחור",
      evalBar: "הצגת סרגל ההערכה",
      newGame: "משחק חדש",
    },
    variations: {
      title: "הווריאציות הטובות ביותר",
      depth: "עומק {{depth}}",
      thinking: "ממתינים למנוע…",
      partial: "{{shown}} מתוך {{requested}} וריאציות עד כה.",
    },
    promotion: {
      title: "בחרו כלי",
      pieces: {
        q: "מלכה",
        r: "צריח",
        n: "פרש",
        b: "רץ",
      },
    },
  },
  footer: {
    source: "מקור",
  },
};

export default he;
