/**
 * UI chrome only — the app shell's brand, navigation labels and the accessible
 * names of its controls. Board screens render chess notation, which is
 * language-independent and deliberately stays out of here.
 */
const en = {
  app: {
    brandMark: "CT",
    brandText: "Chess Trainer App",
  },
  nav: {
    ariaLabel: "Main navigation",
    toggleColorMode: "Toggle light and dark mode",
    switchLanguage: "Switch language",
    playWithEngine: "Play with Engine",
    /**
     * The same screen as `playWithEngine`, with the pieces in disguise. The
     * qualifier is not decoration: two sidebar entries with one accessible name
     * are two links a screen reader cannot tell apart.
     */
    maskedPlay: "Play with Engine (masked)",
    loadPgn: "Load PGN",
    analysisBoard: "Analysis Board",
    boardEditor: "Board Editor",
    /**
     * The three mates list screens. Each sits alone inside its own sub-folder,
     * so the label repeats the folder's word — with the section qualifier,
     * because a folder is a toggle and a screen is a link and a screen reader
     * announces the link on its own.
     */
    matesBasic: "Basic mates",
    matesAdvanced: "Advanced mates",
    matesComplex: "Complex mates",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      engine: "Engine",
      maskedPieces: "Masked Pieces",
      games: "Games",
      tools: "Tools",
      mates: "Mates",
      matesBasic: "Basic",
      matesAdvanced: "Advanced",
      matesComplex: "Complex",
      /**
       * The Positions section's root. Its *sub*-folders have no key here and
       * never will: they are generated from `src/data/positions.json` and named
       * from it, one per endgame category at any depth, which is what makes a
       * new category a data edit alone. The section itself is chrome, so it is
       * named here.
       */
      positions: "Positions",
      /**
       * The User PGNs section's root, and the same rule as Positions above: its
       * sub-folders are generated — one per `.pgn` file under `src/data/pgn/` —
       * and named from the file's own `StudyName` tag or from `src/data/pgn.json`,
       * so dropping a PGN in never touches this catalog.
       */
      userPgns: "User PGNs",
    },
  },
  /** The index screen — a landing page linking out to the real screens. */
  home: {
    title: "Get started",
    subtitle: "Pick a board or tool to open.",
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
      /** The User PGNs game detail's third tab — its PGN annotation text. */
      description: "Description",
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
  /** A read-only notation field — `views/shared/CopyableValue.tsx`, on two screens. */
  copyable: {
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Could not copy — select the text and copy it by hand.",
  },
  /**
   * Piece masking — the Masking tab of `views/masked/play/`, and the one
   * setting that reaches the shared move list and variations. Top-level like
   * the other shared-component namespaces: the mask is a concept two of them
   * now take a prop for, not something one screen owns.
   */
  masking: {
    tab: "Masking",
    white: "White",
    black: "Black",
    /** Over the twelve controls: what each real piece is drawn as. */
    drawnAs: "Drawn as",
    presets: {
      title: "Masking policy",
      /** The three policies of the specification's variants table (§8). */
      identity: "Show real pieces",
      nonPawns: "Non-pawns as pawns",
      allIdentical: "All pieces identical",
    },
    /** The six piece names, for the rows and the choices in them. */
    pieces: {
      k: "King",
      q: "Queen",
      r: "Rook",
      b: "Bishop",
      n: "Knight",
      p: "Pawn",
    },
    notation: "Hide masked pieces in the notation",
    notationHint:
      "A move by a masked piece is written as coordinates (g1f3) in the move list and the variations, so the notation does not name what the board is hiding.",
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
   * The Play with Engine screen — and Masked Pieces, which is that screen with
   * the pieces in disguise and so says all the same things about tabs, turns
   * and settings. Chrome only: SAN, the scores and the depth are notation and
   * numbers, and stay language-independent.
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
      errors: {
        emptyPgn: "No PGN found in that input.",
        pgn: "Could not read this PGN. {{detail}}",
        pgnGame: "Could not read game {{number}} in this file. {{detail}}",
        fen: "Could not read this FEN. {{detail}}",
        file: "Could not read that file.",
      },
    },
  },
  /**
   * The Board Editor. Chrome only: the FEN, the PGN and the square names are
   * notation and stay language-independent.
   */
  editor: {
    tabs: {
      position: "Position",
      fen: "FEN",
      pgn: "PGN",
    },
    palette: {
      white: "White pieces",
      black: "Black pieces",
      /** On the trash in one palette — it empties that colour off the board. */
      clear: "Take the {{color}} pieces off the board",
      colors: {
        white: "white",
        black: "black",
      },
      /** How the other kind of deletion works, said once under the board. */
      removeHint: "Drag a piece off the board — onto a palette or the trash — to remove it.",
    },
    fields: {
      turn: "Side to move",
      white: "White",
      black: "Black",
      castling: "Castling",
      whiteKingside: "White 0-0",
      whiteQueenside: "White 0-0-0",
      blackKingside: "Black 0-0",
      blackQueenside: "Black 0-0-0",
      enPassant: "En passant target",
      enPassantNone: "None",
    },
    controls: {
      /** The standard chess start — a board to begin arranging from. */
      startingPosition: "New board",
      /**
       * Back to the position the screen was opened on — shown only when it was
       * opened with one, so it never offers a position that does not exist.
       */
      arrivalPosition: "Reset",
      clearBoard: "Clear board",
      flip: "Flip board",
      /** The two hand-offs: both open another screen on the position being edited. */
      analysis: "Continue on the Analysis Board",
      play: "Play from here",
    },
    problems: {
      title: "This position cannot be played from yet:",
      noWhiteKing: "White has no king.",
      noBlackKing: "Black has no king.",
      extraKing: "One side has more than one king.",
      pawnOnBackRank: "A pawn is standing on the first or the last rank.",
      opponentInCheck: "The side not to move is already in check.",
      /** Under each of the three controls an illegal position switches off. */
      blocked: "Fix the position to use this.",
    },
    fen: {
      title: "Set a position up",
      label: "Paste a FEN",
      load: "Set position",
      currentTitle: "This position",
      currentFen: "Current FEN",
      error: "Could not read this FEN. {{detail}}",
    },
    pgn: {
      title: "Load a game",
      chooseFile: "Choose a .pgn file",
      dropHint: "Drop a .pgn file here",
      pasteLabel: "Or paste PGN text",
      load: "Load PGN",
      /** What loading one does here, which is not what it does elsewhere. */
      hint: "The game's final position is loaded into the editor.",
      gamesTitle: "Games in this file",
      gameFallback: "Game {{number}}",
      versus: "vs",
      errors: {
        empty: "No PGN found in that input.",
        parse: "Could not read this PGN. {{detail}}",
        parseGame: "Could not read game {{number}} in this file. {{detail}}",
        file: "Could not read that file.",
      },
    },
  },
  /**
   * The Mates section — **chrome only**. The positions' own names and
   * descriptions are per-language fields in `src/data/mates.json`, so adding a
   * position never touches this file; see `lib/matesCatalog.ts` for why.
   */
  mates: {
    /** Category labels, named here by each category's `labelKey` in the data. */
    categories: {
      basic: "Basic",
      advanced: "Advanced",
      complex: "Complex",
    },
    /** The list screen's panel. */
    list: {
      /*
        Deliberately not an i18next plural key (`count_one` / `count_other`):
        Hebrew's plural categories are not English's, so the two catalogs would
        stop shipping the same key set — which `locales.test.ts` asserts, and
        which the `typeof en` typing of `he` enforces in the other direction.
      */
      count: "Positions: {{count}}",
      /** Sub-folders of the category on screen, counted beside its own items. */
      folders: "Folders: {{count}}",
      empty: "No positions in this category yet.",
      hint: "Pick a position to open it on a board, then hand it to the Analysis Board or play it against the engine.",
      /**
       * The list screen's top bar: the name search and the card-size toggle.
       * Both are chrome the app ships in every section, so unlike a position's
       * own name they belong here — see the section's own comment above.
       */
      search: "Search positions",
      noMatches: "No positions match that search.",
      cardSize: {
        label: "Card size",
        compact: "Compact cards",
        comfortable: "Comfortable cards",
      },
    },
    /** The detail screen's panel. */
    detail: {
      back: "Back to {{category}}",
      fen: "Position (FEN)",
      openInAnalysis: "Open in Analysis Board",
      playWithEngine: "Play with Engine",
      openInEditor: "Open in Board Editor",
    },
    /** Whose move it is — the side that has to find the mate. */
    sideToMove: {
      w: "White to play",
      b: "Black to play",
    },
    /** An id or a category the URL names and the catalog does not have. */
    notFound: {
      category: "There is no such mates category.",
      position: "There is no such position in this category.",
      back: "Back to Basic mates",
    },
    /**
     * The sibling-nav panel that replaces the sidebar while a detail screen is
     * open (`views/library/LibrarySiblingNav.tsx`) — the landmark's own label
     * and its close control, which returns to this category's list.
     */
    leftPanel: {
      ariaLabel: "Other items in {{category}}",
      close: "Close",
    },
  },
  /**
   * The endgame Positions section — **chrome only**, and deliberately the same
   * key shape as `mates` above, because one pair of components
   * (`views/library/`) renders both and reads them by
   * `t(`${section.chromeKey}.…`)`.
   *
   * The category names are *not* here. They live in
   * `src/data/positions.json` as `{ en, he }` fields, which is what lets a new
   * category — at any depth — be a single data edit rather than a three-file
   * one; see `lib/positionsCatalog.ts`.
   */
  positions: {
    /** The list screen's panel. */
    list: {
      count: "Positions: {{count}}",
      /** Sub-categories of the one on screen — Rosettes under Queen vs Rook. */
      folders: "Categories: {{count}}",
      empty: "No positions in this category yet.",
      hint: "Pick a position to open it on a board, then hand it to the Analysis Board or play it against the engine.",
      search: "Search positions",
      noMatches: "No positions match that search.",
      cardSize: {
        label: "Card size",
        compact: "Compact cards",
        comfortable: "Comfortable cards",
      },
    },
    /** The detail screen's panel. */
    detail: {
      back: "Back to {{category}}",
      fen: "Position (FEN)",
      openInAnalysis: "Open in Analysis Board",
      playWithEngine: "Play with Engine",
      openInEditor: "Open in Board Editor",
    },
    /**
     * Whose move it is. Not always the attacker here, unlike the mates
     * section: a drawing defense or a mutual zugzwang is the defender's to
     * play, and that is the position's whole point.
     */
    sideToMove: {
      w: "White to play",
      b: "Black to play",
    },
    /** A path or an id the URL names and the catalog does not have. */
    notFound: {
      category: "There is no such endgame category.",
      position: "There is no such position in this category.",
      back: "Back to the endgame positions",
    },
    /** See `mates.leftPanel` above — same shape, same shared component. */
    leftPanel: {
      ariaLabel: "Other items in {{category}}",
      close: "Close",
    },
  },
  /**
   * The User PGNs section's chrome — `t(`${section.chromeKey}.…`)` again, in the
   * same shape the two sections above carry, plus the keys a section whose items
   * are **games** needs: `list.moves` for a card's caption and
   * `detail.openInLoadPgn` for the hand-off only a game has. The shared key
   * shape is a floor, not a ceiling; a section adds what its item kinds need.
   *
   * The folder and game names are *not* here. A folder is named from its file's
   * `StudyName` tag or from `src/data/pgn.json`, and a game from its
   * `ChapterName` or its players — which is what lets a new PGN file be a
   * drop-in rather than a two-file locale edit.
   */
  userPgns: {
    /** The list screen's panel. */
    list: {
      count: "Games: {{count}}",
      /**
       * A folder's sub-folders. In this section they are studies: a lichess
       * export of every study an author wrote is one file holding many, and
       * `loadPgnLibrary` gives each its own folder.
       */
      folders: "Studies: {{count}}",
      empty: "No games in this file yet.",
      hint: "Pick a game to replay it move by move, then hand it to the Analysis Board or take the position on screen to the engine.",
      /**
       * A game card's footer line, and the line under the name on its detail
       * page. Plural forms rather than one string: the rosettes study ships a
       * chapter that is a single move, and "1 moves" is the kind of thing a
       * reader notices.
       */
      moves_one: "{{count}} move",
      moves_other: "{{count}} moves",
      /**
       * The same two controls as the position sections carry, worded for a
       * library of games — a search here matches a chapter's title, its
       * players and its opening, not a position's name.
       */
      search: "Search games",
      noMatches: "No games match that search.",
      cardSize: {
        label: "Card size",
        compact: "Compact cards",
        comfortable: "Comfortable cards",
      },
    },
    /**
     * The **collection** screen — the index of a `.pgn` file that holds several
     * studies (`views/pgn/PgnCollection.tsx`), and its left-hand nav.
     *
     * A section-specific block, which the shared key shape explicitly allows:
     * only this section has files, so only this section has a kind of folder
     * that is a shelf of studies rather than a folder of games.
     */
    /**
     * The **Uploads** screen — the reader's own `.pgn` files
     * (`views/pgn/PgnUploads.tsx`). Chrome, all of it: the folder ships with
     * the app and is there before any file is, unlike the folders inside it,
     * which are named from the files themselves.
     */
    uploads: {
      /** The folder's name, in the sidebar and on the screen. */
      title: "Uploads",
      /** The button — a lichess study export is what it is mostly for. */
      upload: "Upload lichess study",
      count: "Files: {{count}}",
      empty: "Nothing uploaded yet. Pick a .pgn file — a lichess study export, a chess.com download, or any PGN.",
      hint: "In a lichess study, use the study menu → Export chapters, then pick the file here. An export of all of an author's studies works too: each study becomes a folder of its own.",
      /** Said plainly: this is a browser, not a backup. */
      storage: "Uploads are kept in this browser only. Clearing site data removes them, and they do not follow you to another device.",
      remove: "Remove {{name}}",
      /** What a file turned out to be — the `PgnKind` it loaded as. */
      kinds: {
        study: "Study",
        collection: "Studies",
        games: "Games",
        shelf: "Folder",
        uploads: "Uploads",
      },
      /** Why a picked file was not kept. Keyed by `UploadProblem`. */
      problems: {
        empty: "{{name}} is empty.",
        unreadable: "{{name}} holds no game that could be read.",
        "too-large": "{{name}} is too large to keep in this browser.",
        storage: "{{name}} could not be saved — this browser's storage is full.",
      },
    },
    collection: {
      studies_one: "{{count}} study",
      studies_other: "{{count}} studies",
      chapters_one: "{{count}} chapter",
      chapters_other: "{{count}} chapters",
      /** The `Annotator` tag the chapters agree on, when they do. */
      by: "by {{author}}",
      search: "Search studies",
      noMatches: "No studies match that search.",
      hint: "Pick a study to see its chapters.",
    },
    /** The detail screen's panel. */
    detail: {
      back: "Back to {{category}}",
      /** The top-right close button — the same destination as `back`, terser. */
      close: "Close",
      fen: "Position at this move (FEN)",
      openInAnalysis: "Analysis",
      openInLoadPgn: "PGN viewer",
      playWithEngine: "Play Engine",
      openInEditor: "Board Editor",
      /** The Description tab's empty state — a game whose PGN carried no comments. */
      noDescription: "This game has no annotations.",
    },
    /**
     * Only the *not-found* screens read this, since a game card is captioned by
     * its length rather than by whose move it is. Kept so the section carries
     * the shared shape whole.
     */
    sideToMove: {
      w: "White to play",
      b: "Black to play",
    },
    /** A path or an id the URL names and the catalog does not have. */
    notFound: {
      category: "There is no such PGN folder.",
      position: "There is no such game in this folder.",
      back: "Back to the user PGNs",
    },
    /** See `mates.leftPanel` above — same shape, same shared component. */
    leftPanel: {
      ariaLabel: "Other items in {{category}}",
      close: "Close",
    },
  },
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
};

export default en;
