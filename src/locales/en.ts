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
    /**
     * The engine's lobby at `/engine/games` (CTA-82; "Saved games" until then):
     * the games played against the engine, and the new-game form whose Start
     * button is how Play with Engine is reached — it has no nav entry of its own.
     */
    lobby: "Lobby",
    /** Play with Engine with the pieces in disguise (`/engine/masked`, CTA-79), beside the Lobby in the Engine folder. */
    maskedPlay: "Masked Pieces",
    analysisBoard: "Analysis Board",
    savedAnalyses: "Saved analyses",
    /** The Openings explorer (CTA-78) — shown under the folder's own name, a single entry. */
    openings: "Openings explorer",
    /** The reader's own repertoires (CTA-61) — shown under the folder's own name, a single entry (CTA-84). */
    repertoires: "My repertoires",
    /** The Library's two screens (CTA-75): the collections, and adding one. */
    libraryCollections: "Collections",
    addCollection: "Add collection",
    /** Settings' Export tab (CTA-86), in the Settings folder. */
    settingsExport: "Export",
    /** Settings' Import tab (CTA-89), in the Settings folder. */
    settingsImport: "Import",
    /** Settings' Storage tab (CTA-94), in the Settings folder. */
    settingsStorage: "Storage",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      engine: "Engine",
      analysisBoard: "Analysis Board",
      openings: "Openings",
      repertoires: "Repertoires",
      /**
       * The Library (CTA-75). Its collections are not folders here — they are
       * the rows of `/library`, named from their files and uploads.
       */
      library: "Library",
      /** The app's own settings (CTA-86) — one screen per tab. */
      settings: "Settings",
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
  /**
   * The shared board controls and the shared tag table (`BoardControls.tsx`,
   * `GameInfo.tsx`). Chrome only — SAN itself is language-independent.
   */
  gamePanel: {
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
   * Piece masking — the Masking tab of Masked Pieces (`views/engine/masked/`,
   * CTA-79), and the Saved games list's marker. Top-level like the other
   * shared-component namespaces: the mask is a prop the shared move list,
   * explorer and variations take, not something one screen owns.
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
      "A move by a masked piece is written as coordinates (g1f3) wherever a move is written — the move list, the map, the next moves, the engine's lines — so the notation does not name what the board is hiding.",
    /** The pinned engine lines' switch — off by default (CTA-79). */
    lines: "Show the engine's best lines",
    linesHint:
      "Off by default: an engine line is a list of the pieces the mask is hiding. The evaluation bar and the score are unaffected.",
    /** The Saved games list's marker on a game played on Masked Pieces. */
    marker: "Masked",
  },
  /**
   * The variations explorer's right-click menu on a move (CTA-64) — shared by
   * whichever board passes `onEditTree` to `TreeMoveList`.
   */
  moveMenu: {
    promote: "Promote variation",
    makeMainline: "Make main line",
    deleteFrom: "Delete from here",
    copyPgn: "Copy variation PGN",
    addComment: "Add comment",
    addAnnotation: "Add annotation…",
    playChances: "Play chances…",
    copied: "Variation PGN copied",
    copyFailed: "Could not copy — the clipboard is not available here.",
    deleteTitle: "Delete from",
    /** `moves` and `lines` are the two counts below, already worded. */
    deleteSummary: "{{moves}} / {{lines}} will be deleted.",
    moves_one: "{{count}} move",
    moves_other: "{{count}} moves",
    lines_one: "{{count}} line",
    lines_other: "{{count}} lines",
    delete: "Delete",
    cancel: "Cancel",
  },
  /**
   * How likely the trainer is to play each move at a branch (CTA-69) —
   * lichess-tools' `prc:N`, set per branch. The rules: `lib/playChance.ts`.
   */
  playChance: {
    title: "Play chances after",
    titleStart: "Play chances at the start",
    help: "How often the trainer plays each move here. Leave a field empty for automatic: moves with more lines in the next 8 plies are played more often. Numbers are scaled to 100%; 0 means never. Saved as prc:N in the move's comment, as lichess-tools writes it.",
    move: "Move",
    mark: "Chance",
    lines: "Lines",
    chance: "Played",
    auto: "Auto",
    /** The sum of the numbers typed, before scaling. */
    total: "Set: {{total}}% — scaled to 100%, the rest shared by the automatic moves.",
    invalid: "A chance is a number from 0 to 100.",
    save: "Save",
    cancel: "Cancel",
  },
  /** Adding or editing one comment on a move (CTA-69). */
  /**
   * The move menu's *Add annotation…* (CTA-97) — a move's NAG glyphs in three
   * tabs, one per section of `lib/moveAnnotations.ts`'s table. `meaning.*` is
   * keyed by each choice's `id` there.
   */
  nagDialog: {
    title: "Annotate",
    help: "One move assessment and one evaluation at a time; pick the active one again to remove it. Features are toggled one by one. Saved with the changes, as NAGs in the PGN.",
    close: "Close",
    tabs: {
      move: "Move Assessment",
      position: "Position Evaluation",
      features: "Positional Features & Commentary",
    },
    meaning: {
      good: "Good move",
      mistake: "Poor move or mistake",
      brilliant: "Very good or brilliant move",
      blunder: "Very poor move or blunder",
      interesting: "Interesting or speculative move",
      dubious: "Questionable or dubious move",
      forced: "Only move / forced move",
      worst: "Worst move",
      equal: "Equal position",
      unclear: "Unclear or volatile position",
      whiteSlight: "White has a slight advantage",
      blackSlight: "Black has a slight advantage",
      whiteModerate: "White has a moderate advantage",
      blackModerate: "Black has a moderate advantage",
      whiteDecisive: "White has a decisive advantage",
      blackDecisive: "Black has a decisive advantage",
      zugzwangWhite: "Zugzwang (White)",
      zugzwangBlack: "Zugzwang (Black)",
      initiativeWhite: "Initiative (White)",
      initiativeBlack: "Initiative (Black)",
      attackWhite: "Attack (White)",
      attackBlack: "Attack (Black)",
      compensation: "Compensation",
      counterplay: "Counterplay",
      zeitnot: "Zeitnot (severe time pressure)",
      withIdea: "With the idea of…",
      novelty: "Opening novelty",
    },
  },
  commentDialog: {
    addTitle: "Comment on",
    editTitle: "Edit the comment on",
    placeholder: "What is there to say about this move?",
    help: "Saved with the repertoire's changes. Ctrl+Enter saves. [%eval …]-style commands are kept as written.",
    save: "Save",
    cancel: "Cancel",
  },
  /**
   * The variations explorer's tree map (CTA-63, shared since CTA-72) — a
   * game tree drawn as a tree, in a tab and full screen.
   */
  treeMap: {
    title: "Map",
    covered: "Lines covered: {{covered}} of {{total}}",
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
  /**
   * The variations explorer's comment block (CTA-69, shared since CTA-72):
   * what the PGN says at the position on screen — its comments, and the
   * attributes read out of them.
   */
  annotations: {
    title: "Comment",
    /** The comment opening a variation, above the ones after its move. */
    before: "Before this move",
    add: "Add a comment",
    edit: "Edit this comment",
    delete: "Delete this comment",
    /**
     * An attribute's name. `[%key value]` commands the app does not know
     * print their own key; these are the ones it does.
     */
    keys: {
      eval: "Eval",
      depth: "Depth",
      mate: "Mate in",
      assessment: "Assessment",
      clk: "Clock",
      emt: "Time spent",
      cal: "Arrows",
      csl: "Squares",
      prc: "Play chance",
      games: "Games",
    },
  },
  moveList: {
    title: "Moves",
    /** Ply 0, a selectable entry of its own. */
    startPosition: "Start position",
    noMoves: "This game has no moves.",
    /** Read by a screen reader before a side line's moves. */
    variation: "Variation",
  },
  /**
   * The Play with Engine screen — and Masked Pieces, which is that screen with
   * the pieces in disguise and so says all the same things about tabs, turns
   * and settings. Chrome only: SAN, the scores and the depth are notation and
   * numbers, and stay language-independent.
   */
  playEngine: {
    tabs: {
      engine: "Engine",
      /** Play with Engine v2's (CTA-74) — the variations explorer's move list. */
      moves: "Moves",
    },
    /** Play with Engine v2's header controls (CTA-74). */
    game: {
      /**
       * The header's first control (CTA-91): the way back to the Lobby — an
       * arrow named by where it goes.
       */
      backToLobby: "Back to the Lobby",
      replay: "Replay — start over",
      resign: "Resign",
      cancel: "Cancel",
      replayConfirm: {
        title: "Start over?",
        body: "This game's saved progress is discarded and a new game begins from the start.",
        confirm: "Start over",
      },
      resignConfirm: {
        title: "Resign this game?",
        body: "You lose the game. You can still step through it and analyse it.",
        confirm: "Resign",
      },
      /** The footer's line once resigned. */
      resigned: "You resigned · {{result}}",
      /** The footer's line for an ending decided on the board (CTA-91). */
      ended: "Game over · {{result}}",
      /**
       * The game-over button (CTA-91): the ended game, opened on the
       * Analysis Board.
       */
      openAnalysis: "Open in analysis",
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
    },
  },
  /**
   * The engine's **Lobby** (`views/engine/games/`; the Saved games list of
   * CTA-74, a lobby since CTA-82) — the games, flat and newest first, each a
   * tree resumed where the reader left it, with their filters; and the
   * new-game form in the right-hand panel.
   */
  playedGames: {
    title: "Lobby",
    count: "Games: {{count}}",
    /** The count while a filter narrows the list. */
    countFiltered: "Games: {{shown}} of {{count}}",
    /** A filter that leaves nothing. */
    noMatch: "No games match these filters.",
    filters: {
      /** The side the reader played. */
      color: "Your side",
      all: "All",
      white: "White",
      black: "Black",
      /** The opening each game reached — the deepest one the book names along its mainline. */
      opening: "Opening",
      allOpenings: "All openings",
      openingLoading: "Reading the openings…",
    },
    /** The right-hand panel: a new game's options, and the button that starts it. */
    newGame: {
      title: "New game",
      side: "Play as",
      white: "White",
      black: "Black",
      /**
       * The Variations checkbox under the eval bar (CTA-90) — the same choice
       * as the pinned block's own header checkbox: whether the new game
       * starts with the engine's lines shown.
       */
      variations: "Variations",
      start: "Start",
      /** The form's two tabs (CTA-83). */
      tabs: {
        game: "Game",
        editor: "Board editor",
      },
      /** On the Game tab while the Board editor holds a position other than the standard start. */
      customPosition: "The game starts from a custom position.",
      customPositionEdit: "Edit",
      customPositionReset: "Use the standard start",
      /** Above Start while the edited position cannot be played from. */
      illegal: "Start is off until the position in the Board editor can be played from.",
    },
    loading: "Reading your saved games…",
    empty: "No saved games yet. Play a game against the engine and it appears here on its own.",
    storage: "Your games are kept in this browser only. Clearing site data removes them, and they do not follow you to another device.",
    /** A row's title: the pairing, White first. */
    players: "{{white}} - {{black}}",
    human: "Human",
    engine: "Stockfish level {{level}}",
    moves_one: "{{count}} move",
    moves_other: "{{count}} moves",
    variations_one: "{{count}} side line",
    variations_other: "{{count}} side lines",
    unreadable: "This game could not be read.",
    continue: "Continue",
    analyse: "Analysis",
    remove: "Delete this game",
    confirmDelete: {
      title: "Delete this game?",
      body: "It is removed from this browser, side lines and all.",
      cancel: "Cancel",
      confirm: "Delete",
    },
    problem: {
      storage: "The game could not be saved — this browser's storage refused it.",
    },
  },
  /**
   * The **Saved analyses** screen — the boards the reader has worked on at the
   * Analysis Board (`views/tools/analysis/saved/`): how many side lines were
   * tried, and how far in the reader had got.
   */
  savedAnalyses: {
    title: "Saved analyses",
    count: "Analyses: {{count}}",
    loading: "Reading your saved analyses…",
    empty:
      "No saved analyses yet. Work on a board at the Analysis Board and save it, and it appears here.",
    hint: "Every analysis you save on the Analysis Board is kept here — side lines, comments and all — filed into your folders. Open one to pick it up where you left it.",
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
    /** Opens it on the Analysis Board — the one destination (CTA-73). */
    open: "Open",
    /**
     * The top-bar button to the Analysis Board — the screen the sidebar's
     * single Analysis entry hides (CTA-58), so the board is reached from here.
     */
    new: "New",
    /**
     * The panel's new-analysis form (CTA-87): the shared position editor, and
     * the Start that opens the board on the edited position.
     */
    newAnalysis: {
      title: "New analysis",
      start: "Start",
      /** Above Start while the position in the editor cannot be analyzed. */
      illegal: "Start is off until the position in the board editor can be analyzed.",
      /** The editor's resets, in the form's header — the panel says "board", the buttons need not. */
      new: "New",
      clear: "Clear",
      flip: "Flip",
      /** The `.pgn` file pick beside the FEN field. */
      pgnFile: "PGN",
      /** The paste box under the editor — the file pick is above it, so no "or". */
      pasteLabel: "Paste PGN text",
    },
    /** Picking analyses and taking them out as one `.pgn`, side lines and all. */
    select: "Select this analysis",
    selectAll: "Select all analyses",
    selected: "{{count}} selected",
    download: "Download selected as PGN",
    deleteSelected: "Delete selected",
    /** Deleting the picks, asked first — the repertoires' dialog with these words. */
    bulkDelete: {
      title_one: "Delete {{count}} analysis?",
      title_other: "Delete {{count}} analyses?",
      text: "They are removed from this browser. This can't be undone.",
      confirm: "Delete",
    },
    /**
     * The nested folders (CTA-73) — the `folder` keys the shared folder
     * components (`views/shared/folders/`) read through `labelKey`.
     */
    folder: {
      untitled: "Untitled folder",
      root: "All analyses",
      newFolder: "New folder",
      renameFolder: "Rename folder",
      moveFolder: "Move folder",
      /** Filing one analysis — the key the shared move dialog reads. */
      moveGame: "Move analysis",
      deleteFolder: "Delete folder",
      download: "Download this folder as PGN",
      unfiled: "Unfiled",
      topLevel: "Top level",
      name: "Name",
      save: "Save",
      cancel: "Cancel",
      deleteConfirm:
        "Deleting this folder keeps its contents: analyses filed in it become Unfiled, and its sub-folders move up one level.",
      deleteCounts:
        "This folder holds {{games}} analyses and {{subFolders}} sub-folders.",
      count_one: "{{count}} analysis",
      count_other: "{{count}} analyses",
      empty: "This folder is empty.",
    },
  },
  analysis: {
    /** The Analysis Board's tabs (CTA-73; the Position tab CTA-87). */
    tabs: {
      moves: "Moves",
      map: "Map",
      load: "Load",
      export: "Export",
      engine: "Engine",
      arrows: "Arrows",
    },
    /**
     * The header's Play toggle (CTA-73): the engine plays the side not at
     * the bottom of the board, its best move each turn, until paused (or the
     * reader steps back). Disabled while the engine is off.
     */
    play: {
      start: "Let the engine play the other side",
      pause: "Pause the engine",
      engineOff: "Switch the engine on to let it play",
      /** The status line while Play is on: the engine searching, dots moving… */
      thinking: "Engine is thinking",
      /** …the depth its search has reached so far… */
      depth: "depth {{depth}}",
      /** …or the reader's turn. */
      yourMove: "Your move",
    },
    /** The header's engine switch — short, it sits beside three buttons. */
    engineSwitch: "Engine",
    /** Saving a board that is not a saved analysis yet: a name and a folder. */
    save: {
      open: "Save this analysis",
      title: "Save analysis",
      name: "Name",
      folder: "Folder",
      confirm: "Save",
    },
    /**
     * The changes strip over a saved analysis — `RepertoireChangesBar` with
     * this block's words (no protection: an analysis has none).
     */
    changes: {
      title: "Unsaved changes",
      saveOpen: "Unsaved changes — save or discard them",
      saveNothing: "No unsaved changes",
      added_one: "{{count}} move added",
      added_other: "{{count}} moves added",
      edited: "Lines or comments edited",
      update: "Update analysis",
      updateHelp: "Make these changes part of this saved analysis.",
      copy: "Save as copy",
      copyHelp: "Keep the saved analysis as it is, and save a copy with your changes.",
      discard: "Discard",
      copyName: "{{name}} (copy)",
      problem: {
        storage: "It could not be saved — this browser's storage is full or unavailable.",
        "too-many": "There is no room for another analysis in this browser.",
      },
    },
    /** The Load tab: a PGN (file or paste) or a FEN onto the board, unsaved. */
    load: {
      pgnTitle: "Load a game",
      pgnHelp: "It opens as a new analysis; save it to keep it. A file of several games can be merged into one tree or split into a folder of analyses.",
      loaded: "Loaded — a new analysis, not saved yet.",
      /** A split's folder, when the text names nothing. */
      splitFolder: "Imported analyses",
      choice: {
        title_one: "This PGN holds {{count}} game",
        title_other: "This PGN holds {{count}} games",
        explain: "Merge them into one tree on the board, or save each as an analysis of its own.",
        skipped_one: "{{count}} game has no moves or could not be read, and is left out.",
        skipped_other: "{{count}} games have no moves or could not be read, and are left out.",
        merge: "Merge onto the board",
        mergeHelp:
          "One tree: the first game's line is the mainline, and wherever another game leaves it becomes a side line. Comments and move marks are kept. Not saved until you save it.",
        mergeUnavailable:
          "These games start from different positions, so they cannot share one tree.",
        split_one: "Save as {{count}} analysis",
        split_other: "Split into {{count}} analyses",
        splitHelp:
          "Each game is saved as an analysis of its own, named after the game, all in a new folder named after the file.",
      },
      problem: {
        empty: "There is no PGN in that.",
        "too-large": "That is too large to load.",
        unreadable: "That could not be read as PGN.",
        storage: "It could not be saved — this browser's storage is full or unavailable.",
        folder: "Could not make a folder for them — the limit is {{max}} folders, or this browser's storage is full.",
        tooMany: "That would pass the limit of {{max}} analyses in this browser.",
      },
    },
    /** The link to a saved analysis' settings — on the board's header and every list row. */
    settingsLink: {
      open: "Analysis settings",
      unsaved: "Save or discard your changes first",
    },
    /** A saved analysis' settings screen (`/tools/analysis/saved/<id>/settings`). */
    settingsScreen: {
      title: "Analysis settings",
      missing: "There is no such analysis in this browser.",
      back: "Back to saved analyses",
      sections: {
        general: "General",
        board: "Board",
        folder: "Folder",
      },
      name: "Title",
      description: "Description",
      descriptionHelp: "Your notes on this analysis — shown under its title on the board.",
      color: "Side",
      white: "White",
      black: "Black",
      colorHelp: "The side the board opens facing. Flipping the board while you work does not change it.",
      arrowsHelp: "Whether the board opens drawing the next moves' arrows. The board's own switch changes them for a session.",
      save: "Save",
      cancel: "Cancel",
    },
    /** The Export tab: what the PGN keeps. */
    export: {
      include: "Include in the PGN",
      comments: "Comments",
      nags: "Move marks (NAGs)",
      variations: "Side lines",
      download: "Download .pgn",
    },
    /**
     * The Arrows tab (CTA-98): the next-move arrows switch, what sizes them and
     * their colours. The same fields sit on a saved analysis' settings screen.
     */
    arrows: {
      showHelp:
        "Show or hide the arrows of the moves that follow the position on screen. Off, only the move you point at in the next-moves bar gets one.",
      widthSource: "Next move arrows width source",
      sources: {
        none: "None",
        eval: "Evaluation",
        games: "Games",
        prc: "Play chance",
        lines: "Lines ahead",
      },
      sourceHelp: {
        none: "Colour only — the arrows every board draws.",
        eval: "The [%eval] in each move's comment: the best move is the widest, the others narrower by what they give up.",
        games: "The [%games N] in each move's comment: each move's share of the games.",
        prc: "The prc:N in each move's comment: the play chances, scaled to 100%.",
        lines: "How many lines follow each move within the next 8 plies — no tag needed.",
      },
      /** Under a width source no move in the tree carries. */
      unavailable: "No move in this analysis carries this tag.",
      drawnAsNone:
        "No move in this analysis carries the chosen tag, so the arrows are drawn as None until one does.",
      palette: "Next move arrows colours",
      palettes: {
        classic: "Classic",
        lichess: "Lichess",
        colorblind: "Colour-blind safe",
      },
      paletteHelp:
        "The main line, the side lines and the move you point at. A move without the chosen tag, where others have it, is drawn gray.",
    },
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
      /** The arrows of the next moves from the position on screen. */
      arrows: "Show next-move arrows",
      clear: "Clear the board",
    },
    /** The Load and Export tabs' shared words. */
    position: {
      chooseFile: "Choose a .pgn file",
      pasteLabel: "Or paste PGN text",
      /** The paste box's button: the text onto the board. */
      loadText: "Load",
      fenTitle: "Set a position up",
      fenLabel: "Paste a FEN",
      loadFen: "Set position",
      currentFen: "Current FEN",
      currentPgn: "PGN",
      errors: {
        fen: "Could not read this FEN. {{detail}}",
      },
    },
  },
  /**
   * The shared position editor (CTA-83, `views/shared/positionEditor/`) — top
   * level, like the other shared pieces' keys. Chrome only: the FEN, the PGN
   * and the square names are notation and stay language-independent.
   */
  positionEditor: {
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
       * Back to the editor's initial position — shown only when its host gave
       * one, so it never offers a position that does not exist.
       */
      initialPosition: "Reset",
      clearBoard: "Clear board",
      flip: "Flip board",
    },
    problems: {
      title: "This position cannot be played from yet:",
      noWhiteKing: "White has no king.",
      noBlackKing: "Black has no king.",
      extraKing: "One side has more than one king.",
      pawnOnBackRank: "A pawn is standing on the first or the last rank.",
      opponentInCheck: "The side not to move is already in check.",
      /** Under the FEN copy button, which an illegal position switches off. */
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
      load: "Load game",
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
   * The Openings explorer (`/openings`, CTA-78) — a v2 board with the opening
   * book beside it. Chrome only: an opening's name and ECO code come from the
   * bundled eco.json data (`lib/openings.ts`), not from here. What it shares
   * with the Analysis Board (the Load tab's errors, the engine settings, the
   * export) is read from `analysis.*`.
   */
  openings: {
    tabs: {
      book: "Book",
      moves: "Moves",
      map: "Map",
      load: "Load",
      export: "Export",
      engine: "Engine",
    },
    current: {
      /** The book has loaded, but this position is not in it. */
      unknown: "No known opening yet.",
      /** The book itself is still loading. */
      loading: "Loading the opening book…",
      /** The ECO chip's accessible name — it is the link into the explorer. */
      open: "Explore {{eco}} in the Openings explorer",
    },
    book: {
      /** The explorer lists only moves the book names — this when it has none. */
      empty: "No known continuations from here.",
      /** Above the list — what a click on a row does. */
      help: "Click a move to play it here. A move from an earlier position starts a side line.",
    },
    engineSwitch: "Engine",
    controls: {
      /** Hand this position off to Play with Engine as `?fen=`. */
      playFromHere: "Play from here",
      /** Hand the whole explored tree to the Analysis Board, as a new board. */
      analysis: "Open on the Analysis Board — everything explored here, as a new unsaved board",
    },
    /** The Load tab's merge choice — no split: nothing on this screen is saved. */
    load: {
      choice: {
        title_one: "This PGN holds {{count}} game",
        title_other: "This PGN holds {{count}} games",
        explain: "Merge them into one tree on the board.",
        skipped_one: "{{count}} game has no moves or could not be read, and is left out.",
        skipped_other: "{{count}} games have no moves or could not be read, and are left out.",
        merge: "Merge onto the board",
        mergeHelp:
          "One tree: the first game's line is the mainline, and wherever another game leaves it becomes a side line. Comments and move marks are kept.",
        mergeUnavailable:
          "These games start from different positions, so they cannot share one tree.",
      },
    },
  },
  /**
   * The **Library** (CTA-75) — collections of games, each a table, each game
   * an analysis board. Chrome only: a collection is named from its file (or by
   * the reader, for an upload) and a game by its players, so dropping a
   * `.pgn` into `src/data/library/` never touches this catalog.
   */
  library: {
    /** `/library` — the collections. */
    title: "Library",
    count_one: "{{count}} collection",
    count_other: "{{count}} collections",
    games_one: "{{count}} game",
    games_other: "{{count}} games",
    /** The fixed, read-only top-level folder of the shipped collections (CTA-88). */
    builtIn: "Built-in",
    /** The list's columns — a file manager's details view (CTA-88). */
    columns: {
      name: "Name",
      games: "Games",
      added: "Added",
      actions: "Actions",
    },
    /** The words box over the list — a collection's or a folder's name, or part of it. */
    filter: "Filter by name",
    shown: "{{shown}} of {{count}} collections",
    noMatches: "No collection's name matches.",
    add: "Add collection",
    /** A collection row's download — the whole collection, as one PGN. */
    download: "Download the whole collection as PGN",
    /** An uploaded collection's row — delete it, asked first. */
    delete: "Delete collection",
    hint: "A collection is one PGN file of many games — a tournament, a player's games. Open one to sort and filter its games, and open a game to analyse it: side lines, the engine, Play against it, the map and comments. File your collections in folders; the ones that ship with the app are in Built-in.",
    /**
     * The reader's folders (CTA-88) — the keys the shared folder dialogs read
     * (`views/shared/folders/`), and the rows' actions.
     */
    folder: {
      untitled: "Untitled folder",
      newFolder: "New folder",
      newSubFolder: "New sub-folder",
      renameFolder: "Rename folder",
      moveFolder: "Move folder",
      moveCollection: "Move collection",
      moveTo: "Move to…",
      deleteFolder: "Delete folder",
      download: "Download everything in this folder as one PGN",
      uploadHere: "Add a collection here",
      expand: "Open {{name}}",
      collapse: "Close {{name}}",
      topLevel: "Top level",
      name: "Folder name",
      save: "Save",
      cancel: "Cancel",
      deleteConfirm:
        "Deleting this folder keeps its contents: its collections and sub-folders move up to the folder it is in.",
      deleteCounts: "This folder holds {{games}} collections and {{subFolders}} sub-folders.",
    },
    /** The table screen — `/library/<collection>`. */
    table: {
      back: "All collections",
      filter: "Filter games",
      result: "Result",
      anyResult: "Any result",
      shown: "{{shown}} of {{count}} games",
      noMatches: "No games match the filter.",
      rowsPerPage: "Rows per page",
      /** An upload's table: its games from a file or a paste (CTA-77). */
      addGames: "Add games",
      addGamesHint: "Add games to this collection from a PGN file or pasted text",
      noGames: "This collection has no games yet — add some with Add games.",
      loading: "Reading the collection…",
      /**
       * The picks — a checkbox per row and the export bar in the top bar,
       * whose select-all takes every game the filters leave, on every page.
       */
      picks: {
        selectAll: "Select all games shown by the filters",
        selected: "{{count}} selected",
        download: "Download selected as one PGN",
        /** An uploaded collection's picked games, deleted from it. */
        deleteSelected: "Delete selected games from the collection",
        pick: "Select {{title}}",
        /**
         * The Analyse hand-off (CTA-77): the picked games saved to Saved
         * analyses, one analysis each, in a new folder named after the
         * collection, the count and the filters that are on.
         */
        analyse: "Analyse",
        analyseHint: "Save the selected games to Saved analyses, each its own analysis, in a new folder",
        analysing: "Saving the selected games to Saved analyses…",
        /** The side a player filter names, as the folder name carries it. */
        white: "white",
        black: "black",
        done_one: "{{count}} game added to Saved analyses, in “{{folder}}”.",
        done_other: "{{count}} games added to Saved analyses, in “{{folder}}”.",
        skipped_one: "{{count}} game could not be read and was left out.",
        skipped_other: "{{count}} games could not be read and were left out.",
        openFolder: "Open folder",
        problem: {
          read: "The games could not be read. Nothing was saved.",
          none: "None of the selected games can be read. Nothing was saved.",
          folder: "No new folder could be made — Saved analyses holds at most {{max}} folders. Nothing was saved.",
          tooMany: "Saved analyses holds at most {{max}} analyses, and these would pass it. Nothing was saved.",
          storage: "The browser refused to store the games — its storage may be full. Nothing was saved.",
        },
      },
      /** The `#` cell's mark on a game the index could not parse. */
      unreadable: "This game could not be read — its moves have an error.",
      /** The column headers — `lib/libraryCollections.ts`'s `COLLECTION_COLUMNS`. */
      columns: {
        number: "#",
        white: "White",
        whiteElo: "Elo",
        black: "Black",
        blackElo: "Elo",
        result: "Result",
        date: "Date",
        round: "Round",
        event: "Event",
        eco: "ECO",
        opening: "Opening",
        moves: "Moves",
      },
      /** Deleting an uploaded collection's picked games — asked first. */
      confirmDeleteGames: {
        title_one: "Delete {{count}} game?",
        title_other: "Delete {{count}} games?",
        body: "They are removed from “{{name}}” in this browser, and the games after them move up. This cannot be undone.",
        problem: "They could not be deleted — this browser's storage is unavailable, or the games have changed.",
      },
      shippedNote: "This collection ships with the app. Its games are read-only: changes you make on a game are saved as a copy in Saved analyses.",
      uploadedNote: "You added this collection; it is kept in this browser only. Changes to a game can update it in place or be saved as a copy next to it.",
    },
    /**
     * The table's filters, in the right-hand panel — each shown only where
     * the collection's games carry that field.
     */
    filters: {
      title: "Filters",
      clear: "Clear",
      player: "Player",
      color: "Played as",
      anyColor: "Either",
      asWhite: "White",
      asBlack: "Black",
      opening: "Opening",
      openingHelp: "A name, or the start of an ECO code (B9)",
      event: "Event",
      from: "From",
      to: "To",
      /** The opening-moves board at the foot of the panel (CTA-76). */
      moves: {
        title: "Opening moves",
        back: "Take back a move",
        reset: "Back to the start",
        flip: "Flip the board",
        start: "Play a move to keep the games that began with it",
        end: "No game in the collection goes further here",
        /** Where the tree's cut landed (CTA-92): one game does go on, alone. */
        single: "Only one game in the collection goes further here",
        none: "No game the other filters leave was played this way",
        /** Save tree as PGN (CTA-99): the tree below the board's position, as one PGN file. */
        save: "Save tree as PGN",
        saveDialog: {
          title: "Should we add games number as tag?",
          no: "No",
          tags: "Add tags",
          games: "\"games\" tag",
          gamesHelp: "How many of the games played each move: [%games 12]",
          prc: "\"prc\" tag",
          prcHelp: "Each move's share of its position's games, in percent: [%prc 40]",
          cancel: "Cancel",
          save: "Save",
        },
      },
    },
    confirmDelete: {
      title: "Delete {{name}}?",
      body_one: "Its {{count}} game is removed from this browser. This cannot be undone.",
      body_other: "Its {{count}} games are removed from this browser. This cannot be undone.",
      cancel: "Cancel",
      confirm: "Delete",
    },
    /** `/library/new` — a PGN file or a paste becomes a collection. */
    upload: {
      title: "Add a collection",
      intro: "A collection is one PGN text of many games — a tournament export, a player's games. It becomes a table of its own in the Library.",
      name: "Name",
      /** The folder the new collection is filed in (CTA-88). */
      folder: "Folder",
      chooseFile: "Choose a .pgn file",
      pasteLabel: "Or paste PGN text",
      read_one: "{{count}} game found",
      read_other: "{{count}} games found",
      /** A collection made with no games — filled later from its table (CTA-77). */
      empty: "Create empty collection",
      emptyName: "New collection",
      /** The same screen adding games to one of the reader's collections — `?into=<id>`. */
      intoTitle: "Add games to {{name}}",
      intoIntro: "A .pgn file or pasted PGN text of one game or many. Every game is checked, then added at the end of the collection.",
      intoSave: "Add games",
      save: "Add collection",
      pastedName: "Pasted collection",
      storage: "Collections you add are kept in this browser only. Clearing site data removes them, and they do not follow you to another device. Every game is checked when it is added — a few seconds for a tournament, a minute or more for 10,000 games, and some twenty minutes for the largest collections.",
      /** The index pass over an upload's games, before it is kept. */
      indexing: "Checking games… {{done}} of {{total}}",
      cancel: "Cancel",
      problem: {
        empty: "There is no PGN in that.",
        unreadable: "No game could be read in that.",
        "too-large": "That is too large — a collection can be up to about 100 million characters (some 100,000 games).",
        index: "The games could not be checked. Nothing was added.",
        storage: "It could not be saved — this browser's storage is full or unavailable.",
        missing: "That collection is gone.",
        file: "Could not read that file.",
      },
    },
    /** A path the Library does not have. */
    notFound: {
      collection: "There is no such collection.",
      game: "There is no such game in this collection.",
      back: "Back to the Library",
    },
    /** A game's board — `/library/<collection>/<game>`. */
    game: {
      tabs: {
        moves: "Moves",
        map: "Map",
        info: "Info",
        export: "Export",
        engine: "Engine",
      },
      of: "Game {{number}} of {{count}}",
      back: "Back to {{name}}",
      previous: "Previous game",
      next: "Next game",
      engineSwitch: "Engine",
      arrows: "Next-move arrows",
      unreadable: "This game could not be read.",
      /** The Export tab's hand-off to the Analysis Board. */
      openAnalysis: "Open in Analysis Board",
      openAnalysisHelp: "Opens this game on the Analysis Board, at the position on screen.",
      openAnalysisChanged: "Opens the game as the collection holds it, at the position on screen — your unsaved changes stay here.",
    },
    /**
     * The changes strip over a game of an **uploaded** collection — Update
     * writes it in place, Save as copy puts a copy right after it.
     */
    changes: {
      title: "Unsaved changes",
      saveOpen: "Unsaved changes — save or discard them",
      saveNothing: "No unsaved changes",
      added_one: "{{count}} move added",
      added_other: "{{count}} moves added",
      edited: "Lines or comments edited",
      update: "Update game",
      updateHelp: "Make these changes part of this game in the collection.",
      copy: "Save as copy",
      copyHelp: "Keep this game as it is, and add a copy with your changes right after it.",
      discard: "Discard",
      problem: {
        storage: "It could not be saved — this browser's storage is full or unavailable.",
        "too-large": "The collection would be too large to keep in this browser.",
        missing: "The collection or the game is gone.",
        "too-many": "There is no room for another analysis in this browser.",
      },
    },
    /**
     * The same strip over a game of a **shipped** collection, which is
     * read-only: its changes are kept only as a copy in Saved analyses.
     */
    shippedChanges: {
      title: "Unsaved changes",
      readOnly: "This game ships with the app and cannot be changed: save your changes as a copy in Saved analyses.",
      copy: "Save as copy",
      copyHelp: "Save this game with your changes as a new analysis in Saved analyses.",
      copyName: "{{name}} (copy)",
      discard: "Discard",
      problem: {
        storage: "It could not be saved — this browser's storage is full or unavailable.",
        "too-many": "There is no room for another analysis in this browser.",
        "too-large": "That is too large to keep in this browser.",
        missing: "The collection or the game is gone.",
      },
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
    loading: "Reading your repertoires…",
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
    select: "Select this repertoire",
    selectAll: "Select all repertoires",
    selected: "{{count}} selected",
    download: "Download selected as PGN",
    deleteSelected: "Delete selected",
    /** The bulk delete's confirm (CTA-68). */
    bulkDelete: {
      title_one: "Delete {{count}} repertoire?",
      title_other: "Delete {{count}} repertoires?",
      text: "They are removed from this browser. This can't be undone.",
      confirm: "Delete",
    },
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
        folder: "Folder",
      },
      folder: "Folder",
      folderHelp: "Where it is filed in the list.",
      folderNone: "No folders yet — make one from the list's New folder.",
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
      chanceArrows: "Show play chances",
      chanceArrowsHelp:
        "At the branches that carry play-chance marks, each arrow is drawn white with a magenta border — the likelier the move, the wider its arrow — and the moves bar prints each move's percentage. Unmarked branches keep the green and blue. You can still switch this for a session. Games always start without it.",
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
        "One tree: the first game's line is the mainline, and wherever another game leaves it becomes a side line. The file's comments and move marks are kept.",
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
      empty: "This folder is empty. Move repertoires here from their settings.",
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
      /** The header's Autoplay toggle: the label says what a click does. */
      autoplayOn: "Play — the trainer answers your moves",
      autoplayOff: "Pause — you move both sides",
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
      /** The switch that shows the play chances — off by default. */
      chanceArrows: "Show play chances",
      chanceArrowsHelp:
        "Where the position's branch carries play-chance marks: the arrows are drawn white with a magenta border — the likelier the move, the wider its arrow — and the bar prints each move's percentage.",
      autoplay: "Autoplay",
      autoplayHelp:
        "The trainer answers your moves from the repertoire, picking among its lines at random. Off, you move both sides.",
      tabs: {
        settings: "Settings",
        score: "Score",
        map: "Map",
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
      /** The header's Save button: opens the strip; disabled with nothing to save. */
      saveOpen: "Unsaved changes — save or discard them",
      saveNothing: "No unsaved changes",
      added_one: "{{count}} move added",
      added_other: "{{count}} moves added",
      /** The changes are edits alone — lines promoted or deleted, none added. */
      edited: "Lines or comments edited",
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
  /** Settings (`/settings/<tab>`, CTA-86) — one tab per concern. */
  settings: {
    title: "Settings",
    tabs: {
      export: "Export",
      import: "Import",
      storage: "Storage",
    },
    /** The Export tab: the reader's data as PGN files and a manifest, in one zip. */
    export: {
      intro:
        "Download your data as one .zip: PGN files that any chess program reads, and a manifest.json saying how they fit back together.",
      categories: {
        collections: "Collections",
        games: "Games",
        analyses: "Analyses",
        repertoires: "Repertoires",
      },
      includeShipped_one: "Include the {{count}} shipped collection",
      includeShipped_other: "Include the {{count}} shipped collections",
      run: "Export",
      working: "Exporting…",
      done: "Downloaded {{fileName}}.",
      failed: "The export could not be saved. Nothing was downloaded.",
      unreadable: "The games of “{{name}}” could not be read. Nothing was downloaded.",
      panel:
        "Games and Analyses are one PGN file each; every collection is a file of its own; repertoires are one file per folder, plus one for the unfiled ones. Your uploaded collections always go with Collections — the ones the app ships only when you ask. Nothing is changed or removed.",
    },
    /** The Import tab (CTA-89): an Export's zip read back into the app. */
    import: {
      intro:
        "Bring back a .zip made by Export — here or in another browser. You choose what to import and what happens where a folder is already here; nothing is written until you confirm.",
      choose: "Choose a .zip",
      reading: "Reading the file…",
      working: "Importing…",
      indexing: "Indexing “{{name}}”: {{done}} of {{total}} games",
      panel:
        "A clash is a folder that is both in the file and here (Unfiled always is; played games clash as a whole). Merge puts the file's items into it and keeps an item that is already here as it is — importing the same file twice changes nothing. Override replaces what the folder holds with the file's. Skip leaves the folder as it is. Folders that are not here yet are created, empty ones too.",
      /** The choice dialog. */
      dialog: {
        title: "Import {{fileName}}",
        from: "Exported on {{date}} by version {{version}}.",
        run: "Import",
        cancel: "Cancel",
        shipped_one: "The file holds {{count}} built-in collection. It is not imported: it ships with the app.",
        shipped_other: "The file holds {{count}} built-in collections. They are not imported: they ship with the app.",
        conflicts_one: "{{count}} folder is already here:",
        conflicts_other: "{{count}} folders are already here:",
        counts: "{{incoming}} in the file · {{existing}} here",
        folderChoice: "For this folder:",
        toggle: "Choose for this folder",
        preview: "Will add {{added}}, replace {{replaced}}, skip {{skipped}}, create {{folders}} folders.",
        refusedRecords: "Not imported: it would come to {{total}}, past the limit of {{max}}.",
        refusedFolders: "Not imported: it would need {{total}} folders, past the limit of {{max}}.",
        dropsOldest_one: "Played games are kept up to {{max}}: the oldest game will be dropped.",
        dropsOldest_other: "Played games are kept up to {{max}}: the {{count}} oldest games will be dropped.",
      },
      choices: {
        merge: "Merge",
        override: "Override",
        skip: "Skip",
      },
      choiceHelp: {
        merge: "The file's items go into the folder; an item already here stays as it is.",
        override: "What the folder holds is replaced by the file's items.",
        skip: "Nothing from the file goes into the folder.",
      },
      /** How the top level is named in each category's clash list. */
      top: {
        collections: "Top level",
        games: "Your played games",
        analyses: "Unfiled",
        repertoires: "Unfiled",
      },
      /** The report, one line per category. */
      result: {
        done: "{{category}}: {{added}} added, {{replaced}} replaced, {{skipped}} skipped, {{folders}} folders created.",
        refusedRecords: "{{category}}: not imported — it would come to {{total}}, past the limit of {{max}}.",
        refusedFolders: "{{category}}: not imported — it would need {{total}} folders, past the limit of {{max}}.",
        storage: "{{category}}: the browser refused to store it. Part of it may have been written.",
        tooMany: "{{category}}: not imported — the limit was reached while importing.",
        indexing: "{{category}}: a collection's games could not be indexed. The collections before it were imported.",
      },
      /** The dialog for a file that cannot be imported. */
      incompatible: {
        title: "This file cannot be imported",
        problem: {
          "not-zip": "“{{fileName}}” is not a .zip file.",
          "no-manifest": "“{{fileName}}” has no manifest.json, so it was not made by Export.",
          malformed: "The manifest.json in “{{fileName}}” cannot be read.",
          foreign: "The manifest.json in “{{fileName}}” is not this app's.",
          newer: "“{{fileName}}” was made by a newer version of the app (format {{version}}). Update the app to import it.",
          "missing-file": "“{{fileName}}” does not hold {{path}}, which its manifest names.",
          unreadable: "{{path}} in “{{fileName}}” does not match its manifest.",
        },
        advice: "You can still bring its PGN files in by hand:",
        collections: "a collection — the Library's upload",
        analyses: "analyses and played games — the Analysis Board's Load tab",
        repertoires: "repertoires — Add repertoire",
        files: "The PGN files in it:",
        noFiles: "It holds no PGN files.",
        close: "Close",
      },
    },
    /** The Storage tab (CTA-94): how much space the app's data takes. */
    storage: {
      intro:
        "How much space this app's data takes on this device: the browser's own estimates for the whole origin, and your records — counted exactly, and sized by this app's own estimate, per category.",
      browser: {
        title: "Browser storage",
        usage: "Origin usage (estimate)",
        indexedDb: "IndexedDB usage (estimate)",
        /** Where the quota went: the reader's own look-up. */
        quotaNote: "The storage quota is not shown here; to see it, open your browser's developer tools.",
      },
      /** Where the browser reports no number at all. */
      notAvailable: "Not available",
      data: {
        title: "Your data",
        category: "Category",
        records: "Records",
        payload: "Estimated payload",
        categories: {
          playedGames: "Engine games",
          analyses: "Analyses",
          repertoires: "Repertoires",
          collectionGames: "Library games",
        },
      },
      note:
        "Payload sizes are this app's own estimate of what its records hold — not disk usage. The browser may compress, deduplicate and add index overhead, so they do not sum to the storage it reports.",
      panel:
        "Nothing here is written or removed. The browser's figures are its own estimates for the whole origin; the per-category sizes are this app's estimate of what your records hold, which the browser may store differently on disk. The built-in collections are files fetched over the network, not records in your browser, so they count towards the origin usage only.",
    },
  },
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
};

export default en;
