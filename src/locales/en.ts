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
    savedOpenings: "Saved openings",
    /** The reader's own repertoires (CTA-61), and the screen they come in on. */
    repertoires: "My repertoires",
    addRepertoire: "Add repertoire",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      engine: "Engine",
      maskedPieces: "Masked Pieces",
      games: "Games",
      tools: "Tools",
      analysisBoard: "Analysis Board",
      openings: "Openings",
      repertoires: "Repertoires",
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
  /** The evaluation bar and the captured-pieces strips — on every play/analysis board. */
  board: {
    evalBar: "Evaluation",
    capturedByWhite: "Captured by White",
    capturedByBlack: "Captured by Black",
  },
  /** The engine's lines — `views/shared/BestVariations.tsx`, on three screens. */
  variations: {
    /**
     * The header checkbox's label (CTA-56) — the checkbox is the block's own
     * control: clearing it hides the lines, for analysing on one's own.
     */
    title: "Variations",
    depth: "Depth {{depth}}",
    thinking: "Waiting for the engine…",
    partial: "{{shown}} of {{requested}} lines so far.",
    /**
     * The row's chevron's spoken label (CTA-56) — an `aria-label` over an
     * icon, which says none of this on its own, so it has to carry the
     * variation and the score itself.
     */
    expand: "Variation {{rank}}, {{score}} — show the full line",
    collapse: "Variation {{rank}}, {{score}} — collapse the line",
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
    /** Read by a screen reader before a side line's moves. */
    variation: "Variation",
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
      /** The engine's on/off switch above the tab strip — the tab's own name. */
      engineOn: "Engine",
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
    hint: "Every game you play against the engine is written down as you play it. Pick one up where you left it, file it into a folder, or open it for study.",
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
    /**
     * A folder with no readable name — a half-broken store can produce one
     * (`gameFolderFrom` normalises a broken name to empty rather than dropping
     * the folder). The folders' CRUD refuses empty names; only a hand-edited
     * store reaches this.
     */
    untitled: "Untitled folder",
    /**
     * The folder system (CTA-46), the savedOpenings block's `folder` below over
     * the games' own store. Chrome only — a folder's name is the reader's own
     * words, never a key.
     */
    folder: {
      /** The breadcrumb's first crumb — standing at the top of the tree. */
      root: "All games",
      /** The top bar's create button. */
      newFolder: "New folder",
      renameFolder: "Rename folder",
      moveFolder: "Move folder",
      /** The per-game filing control — the one the openings do not have. */
      moveGame: "Move game",
      deleteFolder: "Delete folder",
      /** The folder's own download — one .pgn of everything under it. */
      download: "Download this folder as PGN",
      /** The game move dialog's "none" choice — a game with no folder. */
      unfiled: "Unfiled",
      /** The folder move dialog's "none" row — the move's other destination. */
      topLevel: "Top level",
      /** Both the create and the rename dialog's field. */
      name: "Folder name",
      save: "Save",
      cancel: "Cancel",
      /**
       * The delete confirmation for a non-empty folder: the contents stay —
       * games become Unfiled, sub-folders re-parent up a level.
       */
      deleteConfirm:
        "Deleting this folder keeps its contents: games filed in it become Unfiled, and its sub-folders move up one level.",
      deleteCounts:
        "This folder holds {{games}} games and {{subFolders}} sub-folders.",
      /** A folder card's caption, counting everything under it. */
      count_one: "{{count}} game",
      count_other: "{{count}} games",
      /** An empty folder's body, once the reader has drilled in. */
      empty: "This folder is empty.",
    },
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
    /**
     * The top-bar button to the Analysis Board — the screen the sidebar's
     * single Analysis entry hides (CTA-58), so the board is reached from here.
     */
    new: "New",
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
    /**
     * The top-bar button to the Openings board — the screen the sidebar's
     * single Openings entry hides (CTA-42), so the board is reached from here.
     */
    new: "New",
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
      position: "Position",
    },
    /** Hand the position on screen to Play with Engine — the Board Editor's wording. */
    playFromHere: "Play from here",
    /** The pinned next-moves bar under the moves list — a fork's choices (CTA-54). */
    nextMoves: "Next moves",
    /** The empty-tree hint of the flowing tree view (the Openings explorer, a Library repertoire line). */
    tree: {
      empty: "Play a move, or set a position up from the Position tab.",
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
  /**
   * The **Repertoires** section (CTA-61) — the reader's own opening
   * repertoires, brought in as a `.pgn` file or pasted text, listed like the
   * saved screens and read on the unified v2 board. The list reuses the
   * saved-list machinery, which reads `view.*`, `remove`, `select`,
   * `selectAll`, `selected` and `download` out of this block.
   */
  repertoires: {
    title: "Repertoires",
    count: "Repertoires: {{count}}",
    empty:
      "No repertoires yet. Add one from a .pgn file, or paste its PGN, and it appears here.",
    hint: "Your own opening repertoires. Open one to read its lines on the board, side lines and all, with the engine beside you.",
    storage:
      "Repertoires are kept in this browser only. Clearing site data removes them, and they do not follow you to another device.",
    /** A repertoire whose tags carry no name and the reader typed none. */
    untitled: "Untitled repertoire",
    /** A repertoire's size: its mainline, and the side lines off it. */
    moves_one: "{{count}} move",
    moves_other: "{{count}} moves",
    variations_one: "{{count}} variation",
    variations_other: "{{count}} variations",
    /** A record from before the one-game rule, which opens on the choice. */
    needsChoice: "Several games — open to merge or split",
    view: {
      label: "View",
      list: "List",
      compact: "Small boards",
      comfortable: "Big boards",
    },
    open: "Open",
    add: "Add",
    remove: "Delete this repertoire",
    select: "Select this repertoire",
    selectAll: "Select all repertoires",
    selected: "{{count}} selected",
    download: "Download selected as PGN",
    /** The screen a repertoire is brought in on. */
    upload: {
      title: "Add a repertoire",
      intro:
        "Choose a .pgn file, or paste its text below. Both are read the same way: every line is checked before anything is kept.",
      name: "Name",
      nameHelp: "Leave empty to take the name from the file's own tags.",
      pick: "Choose a .pgn file",
      paste: "…or paste PGN here",
      save: "Add pasted PGN",
      reading: "Reading…",
      problem: {
        empty: "That holds no PGN.",
        "too-large": "That is too large to keep in this browser.",
        unreadable: "No line in it could be read.",
        storage:
          "It could not be saved — this browser's storage is full or unavailable.",
      },
    },
    /**
     * The per-repertoire settings screen (`/repertoires/<id>/settings`). One
     * key per control; a new option adds its own here and in `he.ts`
     * (see `lib/repertoireSettings.ts`, "Adding an option").
     */
    settings: {
      title: "Repertoire settings",
      open: "Settings",
      sections: {
        general: "General",
        board: "Board",
      },
      name: "Title",
      nameHelp: "Shown in the list and above the board.",
      description: "Description",
      descriptionHelp: "Your own notes: what this repertoire covers, what to remember.",
      color: "Main color",
      colorHelp: "The side you play this repertoire as. Its board opens facing it.",
      protected: "Protected",
      protectedHelp:
        "Changes made on its board can't be written into it — only saved as a copy — until this is off. Copies are never protected.",
      showArrows: "Show next-move arrows",
      showArrowsHelp:
        "The board opens with arrows for the moves that follow the position on it: the main line in green, side lines in blue. You can still switch them for a session. Games always start without them.",
      white: "White",
      black: "Black",
      save: "Save",
      cancel: "Cancel",
      problem: "It could not be saved — this browser's storage is full or unavailable.",
    },
    /**
     * A text of several games: a repertoire is one game (a mainline with side
     * lines), so the reader merges them into one or splits them into many.
     */
    choice: {
      title_one: "This PGN holds {{count}} game",
      title_other: "This PGN holds {{count}} games",
      explain:
        "A repertoire is one game: a mainline with its side lines. Choose how to bring these in.",
      skipped_one: "{{count}} game has no moves or could not be read, and is left out.",
      skipped_other: "{{count}} games have no moves or could not be read, and are left out.",
      merge: "Merge into one repertoire",
      mergeHelp:
        "One tree: the first game's line is the mainline, and wherever another game leaves it becomes a side line. Comments in the file are not kept.",
      mergeUnavailable:
        "These games start from different positions, so they cannot share one tree.",
      split_one: "Keep as {{count}} repertoire",
      split_other: "Split into {{count}} repertoires",
      splitHelp:
        "Each game becomes a repertoire of its own, named after the game, all in a new folder named after the file.",
      folderFailed:
        "Could not make a folder for them — the limit is {{max}} folders, or this browser's storage is full.",
      tooMany: "That would pass the limit of {{max}} repertoires in this browser.",
      legacy:
        "This was saved as several games. A repertoire is one game with side lines — choose how to keep it.",
    },
    /**
     * The folders repertoires are filed under — one level: a folder holds
     * repertoires, never another folder.
     */
    folder: {
      unfiled: "Unfiled",
      back: "All repertoires",
      new: "New folder",
      newTitle: "New folder",
      rename: "Rename folder",
      delete: "Delete folder",
      download: "Download this folder as PGN",
      name: "Folder name",
      save: "Save",
      cancel: "Cancel",
      count_one: "{{count}} repertoire",
      count_other: "{{count}} repertoires",
      deleteConfirm_one: "Its {{count}} repertoire moves to Unfiled; nothing is deleted.",
      deleteConfirm_other: "Its {{count}} repertoires move to Unfiled; nothing is deleted.",
      move: "Move to folder",
      moveTitle: "Move to folder",
      empty: "This folder is empty. Move repertoires here from the list.",
    },
    /**
     * Playing a repertoire against the trainer (`/repertoires/<id>/play`,
     * CTA-63) — a scripted opponent that answers only from the repertoire.
     */
    /** The games a repertoire is played as (CTA-63) — `lib/repertoireGames.ts`. */
    games: {
      open: "Games",
      end: { title: "Get to the end" },
      backtrack: { title: "Backtracking" },
    },
    play: {
      side: "Your side",
      white: "White",
      black: "Black",
      restart: "Restart from the start position",
      download: "Download with your additions as PGN",
      back: "Back to the board",
      /** The engine's switch — off by default: a drill does not show the answer. */
      engine: "Engine",
      engineHelp:
        "Shows the engine's best lines above the tabs and the evaluation bar. It never plays a move; its settings are in the Engine tab.",
      sideHelp:
        "The trainer plays the other side. Changing it starts again from the first move; what you added is kept.",
      /** The switch that draws the next-move arrows — off by default. */
      arrows: "Show next-move arrows",
      arrowsHelp:
        "Arrows for the moves that follow the position on the board: the main line in green, side lines in blue.",
      autoplay: "Autoplay",
      autoplayHelp:
        "The trainer answers your moves from the repertoire, picking among its lines at random. Off, you move both sides.",
      tabs: {
        settings: "Settings",
        score: "Score",
        map: "Map",
      },
      /** Backtracking's Map tab — the repertoire as a tree. */
      map: {
        label: "The repertoire as a tree: covered lines in green, your way here highlighted",
        here: "You are here",
        left_one: "{{count}} line left",
        left_other: "{{count}} lines left",
        done: "Every line is covered.",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        fullScreen: "Open the map full screen",
        fit: "Fit the whole tree",
        close: "Close the map",
        mouseHint: "Scroll to zoom, drag to move",
        showMoves: "Show moves",
        zoomToRead: "Zoom in to read the moves",
        goTo: "Go to {{move}}",
        size: "{{lines}}, {{moves}}",
        lines_one: "{{count}} line",
        lines_other: "{{count}} lines",
        moves_one: "{{count}} move",
        moves_other: "{{count}} moves",
        added_one: "{{count}} added",
        added_other: "{{count}} added",
      },
      /** Game mode's tally — this session only. */
      score: {
        successes: "Right",
        failures: "Wrong",
        accuracy: "Accuracy",
        help: "Each position counts once: your first try there. Retries after a wrong move don't count again. The score is for this session only.",
        reset: "Reset score",
        startOver: "Start over",
        finished_one: "{{count}} line finished",
        finished_other: "{{count}} lines finished",
        covered: "Lines covered: {{covered}} of {{total}}",
      },
      status: {
        thinking: "The trainer is choosing a move…",
        yourMove: "Your move.",
        outOfBook:
          "The repertoire ends here. Every move you play now adds to it.",
        tryAgain: "That move isn't in the repertoire. Try again.",
        lineComplete: "You reached the end of this line. Restart for another.",
        lineCovered: "Line covered. Going back to the next line to cover…",
        allCovered: "Every line is covered. Well done!",
        required: "Play the marked move: the other lines from here are already covered.",
      },
    },
    /**
     * What to do with a session's changes to a repertoire (CTA-63) — the strip
     * the player shows while there are any.
     */
    changes: {
      title: "Unsaved changes",
      added_one: "{{count}} move added",
      added_other: "{{count}} moves added",
      update: "Update repertoire",
      updateHelp: "Make these changes part of this repertoire.",
      copy: "Save as copy",
      copyHelp: "Keep this repertoire as it is, and save a copy with your changes.",
      discard: "Discard",
      copyName: "{{name}} (copy)",
      /** The strip on a protected repertoire: no Update, its settings instead. */
      protected: {
        note: "This repertoire is protected: save your changes as a copy, or switch protection off in its settings (leaving this board loses the changes).",
        settings: "Open settings",
      },
      problem: {
        storage: "It could not be saved — this browser's storage is full or unavailable.",
        "too-many": "There is no room for another repertoire in this browser.",
      },
    },
    /** The board a repertoire is read on. */
    detail: {
      missing: "There is no such repertoire in this browser.",
      back: "Back to repertoires",
      loading: "Reading this line…",
      unreadable: "This repertoire could not be read.",
      tabs: {
        moves: "Moves",
        tree: "Tree",
        engine: "Engine",
      },
    },
  },
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
  /**
   * The **Development** section (CTA-60) — the five boards composed from the
   * unified board core (`.claude/rules/chessboard-v2.md`). Dev-only: the
   * sidebar folder and the routes are behind `import.meta.env.DEV`, so no
   * Development screen, route, test id or storage key reaches the deployed
   * build.
   *
   * **These strings are the one exception, deliberately.** A catalog is one
   * plain object, so a property cannot be tree-shaken out of it; gating the
   * block would give up `he: typeof en` (a missing translation as a compile
   * error) and `locales.test.ts`'s assertion that every nav label resolves in
   * both languages — which is the only thing covering a dev-only label, the
   * kind nobody would notice missing. A few hundred bytes of dead text is the
   * cheaper price. `.claude/rules/chessboard-v2.md` §6 carries the reasoning.
   *
   * It is a block of its own and a thin one on purpose. Everything a v2 board
   * says that a shipped board already says is read from that screen's block —
   * `analysis.*` for the engine settings and the position tab, `masking.*` for
   * the mask editor, `openings.*` for the explorer, and the shared
   * `moveList.*` / `variations.*` / `promotion.*` / `board.*` for the pieces
   * every board renders. A derived board that needed a locale block of its own
   * would not be derived.
   */
  dev: {
    folder: "Development",
    /** The five boards, in the order the spec derives them. */
    screens: {
      analysis: "Analysis v2",
      play: "Play with Engine v2",
      masked: "Masked Pieces v2",
      openings: "Openings v2",
      repertoire: "Repertoire v2",
    },
    /**
     * The panel's tab strip. Named here rather than read from five screens'
     * blocks because the strip is the shared skeleton's, and a tab that means
     * the same thing on five boards should not be five keys.
     */
    tabs: {
      moves: "Moves",
      engine: "Engine",
      position: "Position",
      mask: "Mask",
      tree: "Tree",
      info: "Info",
    },
    /** The header slot's controls, where a v2 board's differ from a shipped one's. */
    controls: {
      newGame: "New game",
      newBoard: "New board",
      save: "Save",
      saved: "Saved",
    },
    /** Openings v2's explorer footer — the book's continuations from here. */
    book: {
      title: "Book continuations",
      empty: "No known continuations from here.",
    },
    /** Repertoire v2, whose line comes out of the shipped `.pgn` catalog. */
    repertoire: {
      /** No `?game=` arrived and the catalog offered nothing to fall back to. */
      missing: "No repertoire line loaded.",
      /** Above the line's name: where it came from. */
      source: "From the library",
    },
  },
};

export default en;
