import { DEFAULT_POSITION } from "chess.js";
import { gameTag, type GameHeaders } from "./gameModel";
import {
  countVariations,
  mainline,
  mergeTrees,
  treeToPgn,
  type GameTree,
  type VariationNode,
} from "./gameTree";
import { PgnParseError, parsePgnTree, readPgnTags, splitPgnGames } from "./pgn";
import { chapterPrefix } from "./pgnLibrary";
import { MAX_UPLOAD_CHARS } from "./pgnUploads";
import {
  DEFAULT_REPERTOIRE_SETTINGS,
  repertoireSettingsFrom,
  type RepertoireSettings,
} from "./repertoireSettings";

/**
 * **The reader's own repertoires** — what one is when it is written down, how
 * a text is read on the way in, and the two ways a text of many games becomes
 * repertoires (CTA-61).
 *
 * The three-way split every record in `src/lib/` has: the pure model here, the
 * `localStorage` half in [`savedRepertoireStore.ts`](./savedRepertoireStore.ts),
 * the `useSyncExternalStore` binding in `views/repertoires/useSavedRepertoires.ts`.
 *
 * ## A repertoire is one game
 *
 * **One mainline, with its side lines branching off it** — the shape a
 * repertoire has on lichess or in a book, and the one the board reads. A file
 * of *many* games is not a repertoire in that sense, however it is labelled: a
 * Chessable-style export writes each line as a game of its own (the shipped
 * 2.c3 sampler: 14 games in `"N) "` chapters, none of them with a side line), and
 * a lichess study writes each chapter as one. Such a text is **not stored as
 * it is.** {@link readRepertoireText} reads it into its games, and the reader
 * picks one of two operations:
 *
 * - **Merge** ({@link mergedRepertoireOf}) — every game folded into one tree
 *   (`mergeTrees`): the first game's line is the mainline, and where a later
 *   game leaves it, that becomes a side line. Offered only when every game
 *   starts from the same position, since a tree has one start. What a merge
 *   loses is the files' `{ comments }` — the tree does not carry them.
 * - **Split** ({@link splitRepertoiresOf}) — every game its own repertoire,
 *   named by the game (`"2...Qa5 · #1"`) and filed together in a folder named
 *   after the text, each keeping its original text, comments and all.
 *
 * A text of **one** game needs neither and is stored as written. A game with
 * no moves — an introduction chapter that is all prose — is skipped by both,
 * and counted, so the screen can say so.
 *
 * ## A file and a paste are the same record
 *
 * The text is normalised first (line endings, surrounding whitespace) —
 * a `<textarea>` turns `\r\n` into `\n` and a file does not — and a record is
 * built from the text and the reader's name alone, never from a file name,
 * which a paste does not have. `savedRepertoires.test.ts` and
 * `RepertoireUpload.test.tsx` assert the two routes agree.
 *
 * ## What the record carries beside the PGN
 *
 * Read once, when it is brought in, so a list never parses a tree to draw a
 * card: {@link SavedRepertoire.previewFen}, the position where it first
 * branches, and {@link SavedRepertoire.stats}, its size. Plus the reader's
 * {@link SavedRepertoire.settings} and the `folderId` it is filed under.
 */

/** How big a repertoire is — read off its tree when it is brought in. */
export type RepertoireStats = {
  /** Full moves along the mainline, half-moves rounded up. */
  moves: number;
  /** Side lines, however long each runs (`countVariations`). */
  variations: number;
};

/** One repertoire the reader brought in. Plain JSON. */
export type SavedRepertoire = {
  /** Stable for the life of the record — the `/repertoires/<id>` segment. */
  id: string;
  /** The reader's name for it, or the one its own tags carried. May be empty. */
  name: string;
  /**
   * **One game** as PGN: the original text of a single-game file or of one
   * game of a split, or the merged tree written out by `treeToPgn`. A record
   * holding several — written before the one-game rule — is read as needing
   * a merge or a split ({@link isMultiGameRepertoire}), not as a repertoire.
   */
  pgn: string;
  /** Where the repertoire first branches — what a preview board draws. */
  previewFen: string;
  /** Its size, for a caption. Absent on a record from before it was kept. */
  stats?: RepertoireStats;
  /**
   * The reader's settings for it — description, the side it is played from,
   * and whatever is added next ([`repertoireSettings.ts`](./repertoireSettings.ts)).
   * A record written before a setting existed reads as that setting's default.
   */
  settings: RepertoireSettings;
  /**
   * The folder it is filed under (`savedRepertoireFolders.ts`, one level), or
   * `null` for **Unfiled**. A split files its repertoires into a folder of
   * their own; otherwise the reader files them on the list.
   */
  folderId: string | null;
  /** ISO 8601, when it was brought in. */
  savedAt: string;
  /** ISO 8601, when it last changed. What "newest first" sorts on. */
  updatedAt: string;
};

/**
 * A fresh id — the same minter the other stores use, in `[0-9a-z]` because
 * the value travels in a URL.
 */
export { newSavedGameId as newSavedRepertoireId } from "./savedGames";

/**
 * The text as it is stored: `\r\n` and `\r` read as `\n`, and the whitespace
 * around the whole file dropped. What makes a paste and a file one record.
 */
export const normaliseRepertoireText = (text: string): string =>
  text.replace(/\r\n?/g, "\n").trim();

/* ------------------------------------------------------------------ *
 * Reading a text
 * ------------------------------------------------------------------ */

/** What is wrong with a text the reader tried to bring in. */
export type RepertoireProblem = "empty" | "too-large" | "unreadable";

/** One playable game of a text — a line, a chapter, or the whole repertoire. */
export type RepertoireGame = {
  /** 0-based position in the text. */
  index: number;
  /** Its own name — chapter and line, or players, or number. */
  name: string;
  /** Its original PGN, comments and all. */
  pgn: string;
  tree: GameTree;
};

export type RepertoireReading =
  | {
      ok: true;
      /** The name the text's own tags give it, if any. */
      name: string | undefined;
      /**
       * The games that have moves, in file order. One is a repertoire as it
       * stands; more asks the reader to merge or split.
       */
      games: RepertoireGame[];
      /** Games left out: no moves (an all-prose chapter), or would not parse. */
      skipped: number;
      /** Whether the games can be merged: more than one, all from one start. */
      mergeable: boolean;
    }
  | { ok: false; problem: RepertoireProblem; detail?: string };

/**
 * The name a text's tags give it: the first game's `StudyName` (a lichess
 * study), else its `Event` — unless that is a lichess `"<study>: <chapter>"`,
 * whose study half is the name. A Chessable-style export carries neither, and
 * then the reader names it.
 */
export const repertoireNameOf = (text: string): string | undefined => {
  const [first] = splitPgnGames(text);
  if (first === undefined) return undefined;
  const tags = readPgnTags(first);
  return gameTag(tags, "StudyName") ?? gameTag(tags, "Event");
};

/**
 * Whether the texts name their chapters on the `White` tag, Chessable-style —
 * `"12) 2...d5 3.exd5 …"`: most games carrying an `"N) "` prefix, over at
 * least two distinct numbers.
 */
const namesChaptersOnWhite = (tags: readonly GameHeaders[]) => {
  const numbered = new Set<number>();
  let withPrefix = 0;
  for (const tag of tags) {
    const white = gameTag(tag, "White");
    const order = white === undefined ? undefined : chapterPrefix(white).order;
    if (order !== undefined) {
      numbered.add(order);
      withPrefix += 1;
    }
  }
  return numbered.size >= 2 && withPrefix >= tags.length / 2;
};

/**
 * Each game's own name, read off its tags: `"<chapter> · <line>"` for a
 * Chessable-style file (the `"N) "`-stripped `White` tag, then `Black`);
 * otherwise its `ChapterName`, its two players, or its `Event` —
 * `gameDisplayName`'s precedence — else its number.
 */
export const repertoireGameNamesOf = (chunks: readonly string[]): string[] => {
  const tags = chunks.map(readPgnTags);
  const chaptered = namesChaptersOnWhite(tags);

  return tags.map((tag, index) => {
    const white = gameTag(tag, "White");
    const black = gameTag(tag, "Black");
    if (chaptered) {
      const chapter = white === undefined ? undefined : chapterPrefix(white).label;
      return [chapter, black].filter(Boolean).join(" · ") || `${index + 1}`;
    }
    const players =
      white !== undefined || black !== undefined
        ? `${white ?? "?"} – ${black ?? "?"}`
        : undefined;
    return (
      gameTag(tag, "ChapterName") ?? players ?? gameTag(tag, "Event") ?? `${index + 1}`
    );
  });
};

/**
 * Read a text into its playable games, before anything is stored — the size
 * and emptiness rules are the uploads' (`checkUploadPgn`), and every game is
 * parsed as the board will parse it. A text with no playable game at all is
 * refused, with the first parse error as the detail when there was one.
 */
export const readRepertoireText = (text: string): RepertoireReading => {
  const normalised = normaliseRepertoireText(text);
  if (normalised === "") return { ok: false, problem: "empty" };
  if (normalised.length > MAX_UPLOAD_CHARS) {
    return { ok: false, problem: "too-large" };
  }

  const chunks = splitPgnGames(normalised);
  const names = repertoireGameNamesOf(chunks);
  const games: RepertoireGame[] = [];
  let firstProblem: string | undefined;

  chunks.forEach((chunk, index) => {
    let tree: GameTree;
    try {
      tree = parsePgnTree(chunk, index + 1);
    } catch (cause) {
      firstProblem ??= cause instanceof PgnParseError ? cause.message : String(cause);
      return;
    }
    if (tree.moves.length > 0) {
      games.push({ index, name: names[index], pgn: chunk, tree });
    }
  });

  if (games.length === 0) {
    return {
      ok: false,
      problem: "unreadable",
      ...(firstProblem !== undefined ? { detail: firstProblem } : {}),
    };
  }

  const start = games[0].tree.startFen;
  return {
    ok: true,
    name: repertoireNameOf(normalised),
    games,
    skipped: chunks.length - games.length,
    mergeable:
      games.length > 1 && games.every((game) => game.tree.startFen === start),
  };
};

/* ------------------------------------------------------------------ *
 * Building records
 * ------------------------------------------------------------------ */

/**
 * The position at the end of the moves **every** tree agrees on — walked down
 * them together while there is exactly one move anywhere at that depth. For
 * one tree, that is where it first branches: a one-tree repertoire's card
 * shows the position its side lines start from, not the start of the game.
 * Trees that start from different positions share nothing.
 */
export const repertoireTrunkFen = (trees: readonly GameTree[]): string => {
  const [first] = trees;
  if (first === undefined) return DEFAULT_POSITION;
  if (trees.some((tree) => tree.startFen !== first.startFen)) {
    return first.startFen;
  }

  let fen = first.startFen;
  let levels: readonly (readonly VariationNode[])[] = trees.map(
    (tree) => tree.moves,
  );

  for (;;) {
    if (levels.some((nodes) => nodes.length === 0)) return fen;
    const sans = new Set(levels.flatMap((nodes) => nodes.map((node) => node.san)));
    if (sans.size !== 1) return fen;
    fen = levels[0][0].fen;
    levels = levels.map((nodes) => nodes[0].children);
  }
};

/** A tree's size, as a caption prints it. */
export const repertoireStatsOf = (tree: GameTree): RepertoireStats => ({
  moves: Math.ceil(mainline(tree).length / 2),
  variations: countVariations(tree),
});

/** The fields every record starts with, whichever way it was made. */
const recordOf = (
  id: string,
  name: string,
  pgn: string,
  tree: GameTree,
  now: Date,
): SavedRepertoire => ({
  id,
  name,
  pgn,
  previewFen: repertoireTrunkFen([tree]),
  stats: repertoireStatsOf(tree),
  settings: DEFAULT_REPERTOIRE_SETTINGS,
  folderId: null,
  savedAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

/**
 * One game, stored as it was written — a text of exactly one game, or one
 * game picked out of a reading. Named by the reader, else by the text's tags.
 */
export const savedRepertoireOf = (
  id: string,
  game: RepertoireGame,
  typedName: string,
  textName: string | undefined,
  now: Date = new Date(),
): SavedRepertoire =>
  recordOf(id, typedName.trim() || textName || "", game.pgn, game.tree, now);

/**
 * **Merge**: every game folded into one tree, the first game's line its
 * mainline (see the module note). The PGN is the merged tree written out,
 * under the repertoire's name as its `Event`. `undefined` when the games
 * cannot be merged — fewer than two, or from different starts.
 */
export const mergedRepertoireOf = (
  id: string,
  reading: Extract<RepertoireReading, { ok: true }>,
  typedName: string,
  now: Date = new Date(),
): SavedRepertoire | undefined => {
  if (!reading.mergeable) return undefined;
  const name = typedName.trim() || reading.name || "";
  const tree = mergeTrees(
    reading.games.map((game) => game.tree),
    reading.games[0].tree.startFen,
    { ...(name !== "" ? { Event: name } : {}), Result: "*" },
  );
  return recordOf(id, name, treeToPgn(tree), tree, now);
};

/**
 * **Split**: every game its own repertoire, in file order, each keeping its
 * own text, named by the game alone (`"2...Qa5 · #1"`) and filed under
 * `folderId` — the folder the split makes, named after the text
 * (`savedRepertoireFolders.ts`), which is what says where they came from.
 * `newId` is called once per record.
 */
export const splitRepertoiresOf = (
  newId: () => string,
  reading: Extract<RepertoireReading, { ok: true }>,
  folderId: string | null,
  now: Date = new Date(),
): SavedRepertoire[] =>
  reading.games.map((game) => ({
    ...recordOf(newId(), game.name, game.pgn, game.tree, now),
    folderId,
  }));

/**
 * **A repertoire changed on its board** (CTA-63) — the record with its one
 * game replaced by `tree`: the PGN written out by `treeToPgn`, and the
 * preview and size read off it again, so the list's card and caption follow.
 * Its id, name, settings, folder and `savedAt` are its own still; `updatedAt`
 * is now. Whatever the change was — moves added today, a line deleted or a
 * side line promoted later — it is a new tree, and this is the one way it
 * becomes the record.
 */
export const withRepertoireTree = (
  saved: SavedRepertoire,
  tree: GameTree,
  now: Date = new Date(),
): SavedRepertoire => ({
  ...saved,
  pgn: treeToPgn(tree),
  previewFen: repertoireTrunkFen([tree]),
  stats: repertoireStatsOf(tree),
  updatedAt: now.toISOString(),
});

/**
 * **A copy of a repertoire, with its changes** (CTA-63) — a new record under
 * `id` and `name`, holding `tree`, keeping the original's settings and folder,
 * so a shipped or borrowed repertoire can be made one's own without
 * overwriting it — and **unprotected** whatever the original was: a copy
 * exists to go on being edited. The PGN's `Event` is the copy's name, so a
 * download of it says which one it is.
 */
export const repertoireCopyOf = (
  saved: SavedRepertoire,
  tree: GameTree,
  id: string,
  name: string,
  now: Date = new Date(),
): SavedRepertoire => ({
  ...withRepertoireTree(
    saved,
    name === "" ? tree : { ...tree, headers: { ...tree.headers, Event: name } },
    now,
  ),
  id,
  name,
  settings: { ...saved.settings, protected: false },
  savedAt: now.toISOString(),
});

/**
 * The name a split's folder takes: the reader's, else the text's own — the
 * caller supplies a fallback for a text that has neither.
 */
export const splitFolderNameOf = (
  reading: Extract<RepertoireReading, { ok: true }>,
  typedName: string,
): string | undefined => typedName.trim() || reading.name || undefined;

/* ------------------------------------------------------------------ *
 * Reading a record back
 * ------------------------------------------------------------------ */

/**
 * Whether a stored record holds more than one game — one written before the
 * one-game rule. It is still listed and can still be deleted, but it opens
 * on the merge-or-split choice rather than on a board.
 */
export const isMultiGameRepertoire = (saved: SavedRepertoire): boolean =>
  splitPgnGames(saved.pgn).length > 1;

/** A record's one game as a tree, or `undefined` for one that will not parse. */
export const repertoireTreeOf = (saved: SavedRepertoire): GameTree | undefined => {
  try {
    return parsePgnTree(saved.pgn);
  } catch {
    return undefined;
  }
};

const statsFrom = (value: unknown): RepertoireStats | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  return typeof row.moves === "number" && typeof row.variations === "number"
    ? { moves: row.moves, variations: row.variations }
    : undefined;
};

/**
 * One stored row, normalised, or `undefined` for one that is not a repertoire.
 * The id and the text are required — a row without them has nothing to show —
 * and everything else falls back: an unreadable `previewFen` to the start
 * position, unreadable stats to none, an unreadable `folderId` to Unfiled, a
 * missing name to empty, and each setting to its default.
 */
export const savedRepertoireFrom = (
  value: unknown,
): SavedRepertoire | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id === "") return undefined;
  if (typeof row.pgn !== "string" || row.pgn === "") return undefined;
  if (typeof row.savedAt !== "string" || typeof row.updatedAt !== "string") {
    return undefined;
  }

  const stats = statsFrom(row.stats);
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : "",
    pgn: row.pgn,
    previewFen:
      typeof row.previewFen === "string" && row.previewFen !== ""
        ? row.previewFen
        : DEFAULT_POSITION,
    ...(stats !== undefined ? { stats } : {}),
    // Field by field, so an older record — or one with a single unreadable
    // setting — keeps everything it can.
    settings: repertoireSettingsFrom(row.settings),
    folderId:
      typeof row.folderId === "string" && row.folderId !== ""
        ? row.folderId
        : null,
    savedAt: row.savedAt,
    updatedAt: row.updatedAt,
  };
};
