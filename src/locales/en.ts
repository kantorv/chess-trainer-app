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
    analysisBoard: "Analysis Board",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      basicExamples: "Basic Examples",
      engine: "Engine",
      games: "Games",
      tools: "Tools",
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
  /** The evaluation bar — `views/shared/EvalBar.tsx`, on two screens. */
  board: {
    evalBar: "Evaluation",
  },
  /** The engine's lines — `views/shared/BestVariations.tsx`, on two screens. */
  variations: {
    title: "Best variations",
    depth: "Depth {{depth}}",
    thinking: "Waiting for the engine…",
    partial: "{{shown}} of {{requested}} lines so far.",
  },
  /** The promotion picker — `views/shared/PromotionPicker.tsx`, on two screens. */
  promotion: {
    title: "Choose a piece",
    pieces: {
      q: "Queen",
      r: "Rook",
      n: "Knight",
      b: "Bishop",
    },
  },
  /** What `views/shared/OptionSlider.tsx` says about an option it cannot drive. */
  engineOption: {
    /** Shown under a control the running engine build does not have. */
    unsupported: "This engine build has no \"{{option}}\" option.",
    /** Shown under a control the build declares but pins to a single value. */
    fixed: "This engine build fixes {{option}} at {{value}}.",
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
      playAs: "Play as",
      white: "White",
      black: "Black",
      evalBar: "Show evaluation bar",
      newGame: "New game",
    },
  },
  /**
   * The Analysis Board. Chrome only: SAN, the FEN and the scores are notation
   * and stay language-independent.
   */
  analysis: {
    tabs: {
      moves: "Moves",
      engine: "Engine",
      lines: "Variations",
      position: "Position",
    },
    /** The variation tree, where a move list has to say more than "Moves". */
    tree: {
      title: "Moves and variations",
      empty: "Play a move, or set a position up from the Position tab.",
      /** Read by a screen reader before a side line's moves. */
      variation: "Variation",
    },
    settings: {
      title: "Analysis",
      engineOn: "Analyse with the engine",
      /** Said where the lines would be, when the engine is switched off. */
      engineOff: "The engine is off. Switch it on to analyse this position.",
      depth: "Search depth",
      moveTime: "Move time",
      moveTimeValue: "{{seconds}}s",
      moveTimeNone: "No limit",
      multiPv: "Variations to show",
      evalBar: "Show evaluation bar",
      clear: "Clear the board",
    },
    position: {
      pgnTitle: "Load a game",
      chooseFile: "Choose a .pgn file",
      dropHint: "Drop a .pgn file here",
      pasteLabel: "Or paste PGN text",
      loadPgn: "Load PGN",
      gamesTitle: "Games in this file",
      gameFallback: "Game {{number}}",
      versus: "vs",
      fenTitle: "Set a position up",
      fenLabel: "Paste a FEN",
      loadFen: "Set position",
      currentTitle: "This position",
      currentFen: "Current FEN",
      currentPgn: "Current PGN",
      copy: "Copy",
      copied: "Copied",
      copyFailed: "Could not copy — select the text and copy it by hand.",
      errors: {
        emptyPgn: "No PGN found in that input.",
        pgn: "Could not read this PGN. {{detail}}",
        pgnGame: "Could not read game {{number}} in this file. {{detail}}",
        fen: "Could not read this FEN. {{detail}}",
        file: "Could not read that file.",
      },
    },
  },
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
};

export default en;
