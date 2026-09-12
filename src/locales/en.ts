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
    /** The games played on that screen, kept in this browser. */
    savedGames: "Saved games",
    /**
     * The same screen as `playWithEngine`, with the pieces in disguise. The
     * qualifier is not decoration: two sidebar entries with one accessible name
     * are two links a screen reader cannot tell apart.
     */
    maskedPlay: "Play with Engine (masked)",
    loadPgn: "Load PGN",
    analysisBoard: "Analysis Board",
    savedAnalyses: "Saved analyses",
    boardEditor: "Board Editor",
    openings: "Openings",
    savedOpenings: "Saved openings",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      engine: "Engine",
      maskedPieces: "Masked Pieces",
      games: "Games",
      tools: "Tools",
      openings: "Openings",
      /**
       * The Library section's root (was "User PGNs" before CTA-38). Its
       * sub-folders have no key here and never will: they are generated — one
       * per `.pgn` file under `src/data/pgn/` — and named from the file's own
       * `StudyName` tag or from `src/data/pgn.json`, so dropping a PGN in never
       * touches this catalog. The section itself is chrome, so it is named here.
       */
      library: "Library",
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
      /** The Library game detail's third tab — its PGN annotation text. */
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
   * The **Saved games** screen — the games the reader has played against the
   * engine (`views/engine/saved/`). Chrome, all of it: a saved game's own
   * notation is its PGN, and the tag pairs in it are written in PGN's own
   * vocabulary rather than in a language.
   */
  savedGames: {
    title: "Saved games",
    count: "Games: {{count}}",
    empty: "No saved games yet. Play a game against the engine and it appears here on its own.",
    hint: "Every game you play against the engine is written down as you play it. Pick one up where you left it, or open it for study.",
    /** Said plainly: this is a browser, not a backup — as the Uploads screen does. */
    storage: "Saved games are kept in this browser only. Clearing site data removes them, and they do not follow you to another device.",
    /** The line that identifies a game: which side the reader had. */
    playingAs: {
      white: "You played White",
      black: "You played Black",
    },
    /**
     * How it stands. `inProgress` is the `"*"` result — a game still being
     * played, which is most of this list.
     */
    result: {
      white: "White won",
      black: "Black won",
      draw: "Draw",
      inProgress: "In progress",
    },
    /**
     * The three-way view toggle in the top bar: the list the screen shipped
     * with, and the library list screen's own two board sizes.
     */
    view: {
      label: "View",
      list: "List",
      compact: "Small boards",
      comfortable: "Big boards",
    },
    /** The engine's `Skill Level` the game was played at. */
    level: "Level {{level}}",
    /** Plural forms, because a one-move game is a real row here. */
    moves_one: "{{count}} move",
    moves_other: "{{count}} moves",
    /** A stored record whose PGN no longer parses: it can only be deleted. */
    unreadable: "This game could not be read.",
    /** The three destinations — see `SavedGames.tsx` for why these three. */
    continue: "Continue",
    analyse: "Analysis",
    openInLoadPgn: "PGN viewer",
    remove: "Delete this game",
    /**
     * Picking games and taking them out as one `.pgn` — the list view only, see
     * `SavedGames.tsx`. These are the only games in the app that exist nowhere
     * else, so this is the one way out of the browser.
     */
    select: "Select this game",
    selectAll: "Select all games",
    selected: "{{count}} selected",
    download: "Download selected as PGN",
  },
  /**
   * The **Saved analyses** screen — the boards the reader has worked on at the
   * Analysis Board (`views/tools/analysis/saved/`). The same block shape as
   * `savedGames` above, minus the two things an analysis does not have (a result
   * and a side the reader was on) and plus the two it does: how many side lines
   * were tried, and how far in the reader had got.
   */
  savedAnalyses: {
    title: "Saved analyses",
    count: "Analyses: {{count}}",
    empty:
      "No saved analyses yet. Play a move on the Analysis Board, or load a game into it, and the board appears here on its own.",
    hint: "Every board you work on at the Analysis Board is written down as you go — side lines and all. Pick one up where you left it, or take the position somewhere else.",
    /** Said plainly: this is a browser, not a backup — as the Uploads screen does. */
    storage:
      "Saved analyses are kept in this browser only. Clearing site data removes them, and they do not follow you to another device.",
    /**
     * A board that is not a game: one begun from an empty board or from a
     * position carries no players to name it by, so it is named for what it is.
     */
    untitled: "Analysis board",
    /** Plural forms, because a one-move analysis is a real row here. */
    moves_one: "{{count}} move",
    moves_other: "{{count}} moves",
    /** Every move past the mainline — the side lines the reader tried and kept. */
    variations_one: "{{count}} variation",
    variations_other: "{{count}} variations",
    /** Where the reader stopped, as a half-move count from the start position. */
    atPly: "at ply {{ply}}",
    /** A stored record whose PGN no longer parses: it can only be deleted. */
    unreadable: "This analysis could not be read.",
    /**
     * The three-way view toggle in the top bar: the list the screen shipped
     * with, and the library list screen's own two board sizes.
     */
    view: {
      label: "View",
      list: "List",
      compact: "Small boards",
      comfortable: "Big boards",
    },
    /** The three destinations — see `SavedAnalyses.tsx` for why these three. */
    continue: "Continue",
    openInLoadPgn: "PGN viewer",
    play: "Play from here",
    remove: "Delete this analysis",
    /** Picking analyses and taking them out as one `.pgn`, side lines and all. */
    select: "Select this analysis",
    selectAll: "Select all analyses",
    selected: "{{count}} selected",
    download: "Download selected as PGN",
  },
  /**
   * The **Saved openings** screen — the positions the reader has saved on the
   * Openings screen (`views/tools/openings/saved/`). The savedAnalyses block
   * above, minus the export machinery an opening has no use for, and plus the
   * one thing an opening has that an analysis does not: a note, named by it
   * and editable in place. Since CTA-40 the list is filed into a tree of
   * folders — the save dialog's picker and the screen's folder browser share
   * the `folder` block below.
   */
  savedOpenings: {
    title: "Saved openings",
    count: "Openings: {{count}}",
    empty:
      "No saved openings yet. Play through an opening on the Openings screen and save it to keep it here.",
    hint: "Every position you save on the Openings screen is kept here with its whole tree of moves. Give it a note, and edit the note any time.",
    /** Said plainly: this is a browser, not a backup — as the Uploads screen does. */
    storage:
      "Saved openings are kept in this browser only. Clearing site data removes them, and they do not follow you to another device.",
    /**
     * A saved opening with no note yet. The note is what a row is named by, so
     * a nameless one falls back to the translated generic.
     */
    untitled: "Saved opening",
    /** Plural forms, because a one-move opening is a real row here. */
    moves_one: "{{count}} move",
    moves_other: "{{count}} moves",
    /** Every move past the mainline — the side lines the reader tried and kept. */
    variations_one: "{{count}} variation",
    variations_other: "{{count}} variations",
    /** A stored record whose PGN no longer parses: it can only be deleted. */
    unreadable: "This opening could not be read.",
    /**
     * The three-way view toggle in the top bar: the list the screen shipped
     * with, and the library list screen's own two board sizes.
     */
    view: {
      label: "View",
      list: "List",
      compact: "Small boards",
      comfortable: "Big boards",
    },
    /** The two destinations — see `SavedOpenings.tsx` for why these two. */
    continue: "Continue",
    play: "Play from here",
    remove: "Delete this opening",
    /**
     * The export controls (CTA-41), mirroring the savedGames block's naming —
     * see `SavedOpenings.tsx` for why they are list-view only and how the
     * picks persist across folder navigation.
     */
    select: "Select this opening",
    selectAll: "Select all openings",
    selected: "{{count}} selected",
    download: "Download selected as PGN",
    /** The note dialog — shared with the Openings screen's save prompt. */
    note: {
      label: "Note",
      save: "Save",
      cancel: "Cancel",
      /** The Openings screen asks for the note when saving a brand-new record. */
      saveTitle: "Save this opening",
      /** The Saved openings screen asks for it again when editing one. */
      editTitle: "Edit note",
      edit: "Edit note",
    },
    /**
     * The folder system (CTA-40): a folder picker in the save dialog, a folder
     * browser on the Saved openings screen, and the CRUD wording for both.
     * Chrome only — a folder's name is the reader's own words, never a key.
     */
    folder: {
      /** The breadcrumb's first crumb — standing at the top of the tree. */
      root: "All openings",
      /** The top bar's create button, and the save dialog's inline create. */
      newFolder: "New folder",
      renameFolder: "Rename folder",
      moveFolder: "Move folder",
      deleteFolder: "Delete folder",
      /** The folder's own download — one .pgn of everything under it (CTA-41). */
      download: "Download this folder as PGN",
      /** The save dialog's "no folder" choice — filing at the top level. */
      unfiled: "Unfiled",
      /** The move dialog's "none" row — the move's other destination. */
      topLevel: "Top level",
      /** The save dialog's section heading. */
      label: "Folder",
      /**
       * Said under the save dialog's picker: leaving it unchosen files the
       * opening by the default rule, which `useOpenings.saveOpening` owns.
       */
      defaultHint:
        "Leave it unchosen and the opening is filed by its opening name — an off-book position goes to Unfiled.",
      /** Both the create and the rename dialog's field. */
      name: "Folder name",
      save: "Save",
      cancel: "Cancel",
      /**
       * The delete confirmation for a non-empty folder: the contents stay —
       * openings become Unfiled, sub-folders re-parent up a level.
       */
      deleteConfirm:
        "Deleting this folder keeps its contents: openings filed in it become Unfiled, and its sub-folders move up one level.",
      deleteCounts:
        "This folder holds {{openings}} openings and {{subFolders}} sub-folders.",
      /** A folder card's caption, counting everything under it. */
      count_one: "{{count}} opening",
      count_other: "{{count}} openings",
      /** An empty folder's body, once the reader has drilled in. */
      empty: "This folder is empty.",
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
    /** Hand the position on screen to Play with Engine — the Board Editor's wording. */
    playFromHere: "Play from here",
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
      /** The three hand-offs: each opens another screen on the position being edited. */
      analysis: "Continue on the Analysis Board",
      play: "Play from here",
      openings: "Open in Openings",
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
   * The Openings screen. Chrome only: an opening's name and ECO code come
   * from the bundled eco.json data (`lib/openings.ts`), not from here.
   */
  openings: {
    tabs: {
      nextMoves: "Next moves",
      moves: "Moves",
    },
    current: {
      /** The book has loaded, but this position is not in it. */
      unknown: "No known opening yet.",
      /** The book itself is still loading. */
      loading: "Loading the opening book…",
      /** The ECO chip's accessible name — it is the link into the explorer. */
      open: "Explore {{eco}} in the Openings explorer",
    },
    nextMoves: {
      /** The explorer lists only moves the book names — this when it has none. */
      empty: "No known continuations from here.",
    },
    moves: {
      /** The variation tree before anything has been played. */
      empty: "No moves yet — play one on the board, or pick a book move from the Next moves tab.",
    },
    controls: {
      newGame: "New game",
      reset: "Reset",
      /** Hand this position off to Play with Engine — the Board Editor's wording. */
      playFromHere: "Play from here",
      /** Keep the position on screen — opens the note prompt before it is saved. */
      save: "Save",
    },
  },
  /**
   * The **Library** section's chrome — `t(`${section.chromeKey}.…`)`, the
   * shared key shape a library section carries, plus the keys a section whose
   * items are **games** needs: `list.moves` for a card's caption and
   * `detail.openInLoadPgn` for the hand-off only a game has. The shared key
   * shape is a floor, not a ceiling; a section adds what its item kinds need.
   * (Was `userPgns` before CTA-38 renamed "User PGNs" to "Library".)
   *
   * The folder and game names are *not* here. A folder is named from its file's
   * `StudyName` tag or from `src/data/pgn.json`, and a game from its
   * `ChapterName` or its players — which is what lets a new PGN file be a
   * drop-in rather than a two-file locale edit.
   */
  library: {
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
      category: "There is no such library folder.",
      position: "There is no such game in this folder.",
      back: "Back to the library",
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
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
};

export default en;
