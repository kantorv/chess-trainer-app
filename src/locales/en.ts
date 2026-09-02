/**
 * UI chrome only — the app shell's brand, navigation labels and the accessible
 * names of its controls. Board screens render chess notation, which is
 * language-independent and deliberately stays out of here.
 */
const en = {
  app: {
    brandMark: "CA",
    brandText: "Chess Analyze",
  },
  nav: {
    ariaLabel: "Main navigation",
    toggleColorMode: "Toggle light and dark mode",
    switchLanguage: "Switch language",
    basicBoard: "Basic board",
    movingPiece: "Moving example",
    engineEvaluation: "Engine evaluation demo",
    playEngine: "Play with engine 1",
    loadPgn: "Load PGN",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      basicExamples: "Basic Examples",
      games: "Games",
    },
  },
  language: {
    en: "English",
    he: "עברית",
  },
  panel: {
    /** The right-hand column, a placeholder until it holds an eval bar / move list. */
    analysisTitle: "Analysis",
    analysisPlaceholder: "Evaluation and move list will appear here.",
  },
  /** The move list panel: chrome only — SAN itself is language-independent. */
  gamePanel: {
    tabs: {
      moves: "Moves",
      info: "Info",
      load: "Load PGN",
    },
    /** Accessible names for the icon-only board controls. */
    controls: {
      first: "Start position",
      previous: "Previous move",
      next: "Next move",
      last: "Final position",
      flip: "Flip board",
    },
    info: {
      empty: "Load a game to see its details.",
      /** Labels for the PGN tags worth naming; anything else shows its raw tag. */
      event: "Event",
      site: "Site",
      date: "Date",
      round: "Round",
      white: "White",
      black: "Black",
      result: "Result",
      eco: "ECO",
      opening: "Opening",
      timeControl: "Time control",
      termination: "Termination",
    },
  },
  moveList: {
    title: "Moves",
    /** Ply 0, a selectable entry of its own. */
    startPosition: "Start position",
    noMoves: "This game has no moves.",
  },
  /** The Load PGN screen: the four ingestion controls, the picker, its errors. */
  loadPgn: {
    dropHint: "Drop a .pgn file here",
    chooseFile: "Choose a .pgn file",
    pasteLabel: "Or paste PGN text",
    load: "Load",
    gamesTitle: "Games in this file",
    /** Fallback name for a game whose tags say nothing identifying. */
    gameFallback: "Game {{number}}",
    versus: "vs",
    movesLoaded: "Moves: {{total}}",
    emptyState: "No game loaded yet.",
    errors: {
      empty: "No PGN found in that input.",
      /** `detail` is the underlying chess.js message — English, but specific. */
      parse: "Could not read this PGN. {{detail}}",
      parseGame: "Could not read game {{number}} in this file. {{detail}}",
      file: "Could not read that file.",
    },
  },
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
};

export default en;
