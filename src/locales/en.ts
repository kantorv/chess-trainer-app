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
    playWithEngine: "Play with Engine",
    loadPgn: "Load PGN",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      basicExamples: "Basic Examples",
      engine: "Engine",
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
  /**
   * The Play with Engine screen. Chrome only: SAN, the scores and the depth are
   * notation and numbers, and stay language-independent.
   */
  playEngine: {
    tabs: {
      game: "Game",
      engine: "Engine",
      lines: "Variations",
    },
    /** Accessible name of the evaluation bar; the score is appended to it. */
    evalBar: "Evaluation",
    status: {
      yourTurn: "Your move",
      engineTurn: "The engine is thinking…",
      /** Shown while an earlier ply is on screen, where no move can be made. */
      reviewing: "Reviewing an earlier move",
    },
    settings: {
      strength: "Strength",
      /** The engine has no ELO setting, so the figure is named as an estimate. */
      strengthValue: "Level {{level}} (≈{{elo}} Elo)",
      depth: "Search depth",
      moveTime: "Move time",
      moveTimeValue: "{{seconds}}s",
      moveTimeNone: "No limit",
      multiPv: "Variations to show",
      threads: "Threads",
      hash: "Hash (MB)",
      /** Shown under a control the running engine build does not have. */
      unsupported: "This engine build has no \"{{option}}\" option.",
      /** Shown under a control the build declares but pins to a single value. */
      fixed: "This engine build fixes {{option}} at {{value}}.",
      playAs: "Play as",
      white: "White",
      black: "Black",
      evalBar: "Show evaluation bar",
      newGame: "New game",
    },
    variations: {
      title: "Best variations",
      depth: "Depth {{depth}}",
      thinking: "Waiting for the engine…",
      partial: "{{shown}} of {{requested}} lines so far.",
    },
    promotion: {
      title: "Choose a piece",
      pieces: {
        q: "Queen",
        r: "Rook",
        n: "Knight",
        b: "Bishop",
      },
    },
  },
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
};

export default en;
