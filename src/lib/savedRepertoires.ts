import { DEFAULT_POSITION } from "chess.js";
import { gameTag } from "./gameModel";
import type { GameTree, VariationNode } from "./gameTree";
import { PgnParseError, parsePgnTree, readPgnTags, splitPgnGames } from "./pgn";
import { chapterPrefix } from "./pgnLibrary";
import { MAX_UPLOAD_CHARS } from "./pgnUploads";

/**
 * **The reader's own repertoires** — what one is when it is written down, how
 * it is checked on the way in, and how its lines are read back out (CTA-61).
 *
 * The three-way split every record in `src/lib/` has: the pure model here, the
 * `localStorage` half in [`savedRepertoireStore.ts`](./savedRepertoireStore.ts),
 * the `useSyncExternalStore` binding in `views/repertoires/useSavedRepertoires.ts`.
 * What is different about a repertoire is written out below; the rest is
 * [`savedOpenings.ts`](./savedOpenings.ts) again.
 *
 * ## One record is one file, however many lines it holds
 *
 * A repertoire is a *file* the reader brings in — a Chessable-style export of
 * 310 lines in 29 chapters, a lichess study that is one 9,000-node tree — and
 * it is kept as that file's text, whole. So the Alapin example is **one row**,
 * not 310: the lines are a reading of the text ({@link repertoireLinesOf}), not
 * records of their own. That is also what makes it exportable byte for byte.
 *
 * ## A file and a paste are the same record
 *
 * The record is built from the text and the name alone — never from a file
 * name, which a paste does not have — and the text is normalised first (line
 * endings, surrounding whitespace), because a `<textarea>` turns `\r\n` into
 * `\n` and a file does not. {@link savedRepertoireOf} is the one constructor
 * both routes call, and `savedRepertoires.test.ts` asserts the two agree.
 *
 * ## Checked once, on the way in
 *
 * {@link checkRepertoirePgn} parses **every** line as a tree before anything is
 * stored — the size and emptiness rules are `checkUploadPgn`'s, and the parse
 * is the one the board will use, so a file that would open as an empty board
 * is refused with a reason rather than kept. The one thing the check leaves on
 * the record is {@link SavedRepertoire.previewFen}, because a list of preview
 * boards must not parse a 9,000-node tree per card to draw one position.
 *
 * ## Folders, later
 *
 * `folderId` is on the record from the start, `null` meaning **Unfiled** as it
 * does for the saved games and openings, so the folder tree that comes later is
 * not a version bump. Nothing sets it yet.
 */

/** One repertoire the reader brought in. Plain JSON. */
export type SavedRepertoire = {
  /** Stable for the life of the record — the `/repertoires/<id>` segment. */
  id: string;
  /** The reader's name for it, or the one its own tags carried. May be empty. */
  name: string;
  /** The whole file, normalised — see {@link normaliseRepertoireText}. */
  pgn: string;
  /**
   * The position the repertoire first branches at — where every line still
   * agrees. What a preview board draws; see {@link repertoireTrunkFen}.
   */
  previewFen: string;
  /** Always `null` for now: Unfiled. See the module note. */
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

/** What is wrong with a repertoire the reader tried to bring in. */
export type RepertoireProblem = "empty" | "too-large" | "unreadable";

/** Whether a text is worth keeping, and what it turned out to hold. */
export type RepertoireCheck =
  | {
      ok: true;
      /** How many lines it holds. */
      lines: number;
      /** How many of those would not parse — kept, and shown as unreadable. */
      broken: number;
      /** See {@link SavedRepertoire.previewFen}. */
      previewFen: string;
      /** The name its own tags carry, or `undefined`. */
      name: string | undefined;
    }
  | { ok: false; problem: RepertoireProblem; detail?: string };

/**
 * The name a repertoire's tags give it: the first line's `StudyName` (a lichess
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
 * The position at the end of the moves **every** line agrees on — walked down
 * the trees together while there is exactly one move anywhere at that depth.
 * The Alapin example agrees on `1.e4 c5 2.c3` and then branches, so that is
 * what its card shows; a repertoire that disagrees from move one shows its
 * start position. Lines that start from different positions share nothing.
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

/**
 * Read a text the way the detail screen will read it, before storing it.
 *
 * The size and emptiness rules are the uploads' (`checkUploadPgn`), so the two
 * ways into `localStorage` share one ceiling. Then every line is parsed as a
 * tree: a text none of whose lines will read is refused with the first reason;
 * one with a broken line among many is kept, and that line says so when it is
 * picked — one bad line must not cost the reader the other 309.
 */
export const checkRepertoirePgn = (text: string): RepertoireCheck => {
  const normalised = normaliseRepertoireText(text);
  if (normalised === "") return { ok: false, problem: "empty" };
  if (normalised.length > MAX_UPLOAD_CHARS) {
    return { ok: false, problem: "too-large" };
  }

  const chunks = splitPgnGames(normalised);
  const trees: GameTree[] = [];
  let firstProblem: string | undefined;

  chunks.forEach((chunk, index) => {
    try {
      trees.push(parsePgnTree(chunk, index + 1));
    } catch (cause) {
      firstProblem ??=
        cause instanceof PgnParseError ? cause.message : String(cause);
    }
  });

  // A text with no moves in any line is not a repertoire, whatever its tags say.
  if (trees.every((tree) => tree.moves.length === 0)) {
    return {
      ok: false,
      problem: "unreadable",
      ...(firstProblem !== undefined ? { detail: firstProblem } : {}),
    };
  }

  return {
    ok: true,
    lines: chunks.length,
    broken: chunks.length - trees.length,
    previewFen: repertoireTrunkFen(trees),
    name: repertoireNameOf(normalised),
  };
};

/**
 * Write a repertoire down. The one constructor a file and a paste both go
 * through — the text normalised, the name trimmed and, when the reader typed
 * none, taken from the tags. `previewFen` comes from the check the caller has
 * already run on the same text, so nothing is parsed twice.
 */
export const savedRepertoireOf = (
  id: string,
  text: string,
  typedName: string,
  previewFen: string,
  now: Date = new Date(),
): SavedRepertoire => {
  const pgn = normaliseRepertoireText(text);
  return {
    id,
    name: typedName.trim() || repertoireNameOf(pgn) || "",
    pgn,
    previewFen,
    folderId: null,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
};

/* ------------------------------------------------------------------ *
 * Reading the lines back
 * ------------------------------------------------------------------ */

/** One line of a repertoire — one game of the file. */
export type RepertoireLine = {
  /** 0-based position in the file. What the Lines tab selects by. */
  index: number;
  /** What the Lines tab prints for it. */
  name: string;
  /** This line's own PGN, to be parsed as a tree when it is picked. */
  pgn: string;
};

/** A run of lines under one chapter heading — or, `label` undefined, none. */
export type RepertoireChapter = {
  label: string | undefined;
  lines: RepertoireLine[];
};

/**
 * Whether the file names its chapters on the `White` tag, Chessable-style —
 * `"12) 2...d5 3.exd5 …"`: most lines carrying an `"N) "` prefix, over at
 * least two distinct numbers. The shipped loader's `looksLikeRepertoire` asks
 * the same question with a floor of eight games, because there it decides
 * whether a file *is* a repertoire; here that is already known, so a
 * two-chapter file splits too.
 */
const namesChaptersOnWhite = (tags: readonly Record<string, string>[]) => {
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
 * The lines of a repertoire, grouped into its chapters — read off the tags
 * alone, so a 310-line file is listed without parsing one move of it.
 *
 * Two shapes, the two the shipped examples have:
 *
 * - **Chapters on `White`** (the Alapin): the `"N) "` prefix is the chapter
 *   and its order, the `Black` tag is the line. Unnumbered chapters —
 *   `"Introduction"` — come first in the file's order, then the numbered ones
 *   by N, which is the shipped loader's ordering rule.
 * - **Anything else** (the 1.d4 file, a lichess study): one untitled group,
 *   in file order, each line named by its `ChapterName`, its two players or
 *   its `Event` — `gameDisplayName`'s precedence — else its number.
 */
export const repertoireLinesOf = (pgn: string): RepertoireChapter[] => {
  const chunks = splitPgnGames(pgn);
  const tags = chunks.map(readPgnTags);

  if (namesChaptersOnWhite(tags)) {
    const byChapter = new Map<string, RepertoireChapter & { order?: number; first: number }>();
    chunks.forEach((chunk, index) => {
      const white = gameTag(tags[index], "White") ?? "";
      const { order, label } = chapterPrefix(white);
      let chapter = byChapter.get(white);
      if (chapter === undefined) {
        chapter = { label: label || undefined, order, first: index, lines: [] };
        byChapter.set(white, chapter);
      }
      chapter.lines.push({
        index,
        name: gameTag(tags[index], "Black") ?? `${index + 1}`,
        pgn: chunk,
      });
    });

    return [...byChapter.values()]
      .sort((a, b) => {
        if (a.order === undefined && b.order === undefined) return a.first - b.first;
        if (a.order === undefined) return -1;
        if (b.order === undefined) return 1;
        return a.order - b.order;
      })
      .map(({ label, lines }) => ({ label, lines }));
  }

  return [
    {
      label: undefined,
      lines: chunks.map((chunk, index) => {
        const tag = tags[index];
        const white = gameTag(tag, "White");
        const black = gameTag(tag, "Black");
        const players =
          white !== undefined || black !== undefined
            ? `${white ?? "?"} – ${black ?? "?"}`
            : undefined;
        return {
          index,
          name:
            gameTag(tag, "ChapterName") ??
            players ??
            gameTag(tag, "Event") ??
            `${index + 1}`,
          pgn: chunk,
        };
      }),
    },
  ];
};

/** What a row shows about a repertoire without opening it. */
export type SavedRepertoireSummary = {
  lines: number;
  /** Named chapters only — a flat file has none. */
  chapters: number;
};

export const savedRepertoireSummary = (
  saved: SavedRepertoire,
): SavedRepertoireSummary => {
  const chapters = repertoireLinesOf(saved.pgn);
  return {
    lines: chapters.reduce((total, chapter) => total + chapter.lines.length, 0),
    chapters: chapters.filter((chapter) => chapter.label !== undefined).length,
  };
};

/**
 * One line as a tree, or `undefined` for a line that will not parse. The
 * record was checked on the way in, but one broken line among many was kept.
 */
export const repertoireLineTree = (line: RepertoireLine): GameTree | undefined => {
  try {
    return parsePgnTree(line.pgn, line.index + 1);
  } catch {
    return undefined;
  }
};

/* ------------------------------------------------------------------ *
 * Reading a stored row
 * ------------------------------------------------------------------ */

/**
 * One stored row, normalised, or `undefined` for one that is not a repertoire.
 * The id and the text are required — a row without them has nothing to show —
 * and everything else falls back: an unreadable `previewFen` to the start
 * position, an unreadable `folderId` to Unfiled, a missing name to empty.
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

  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : "",
    pgn: row.pgn,
    previewFen:
      typeof row.previewFen === "string" && row.previewFen !== ""
        ? row.previewFen
        : DEFAULT_POSITION,
    folderId:
      typeof row.folderId === "string" && row.folderId !== ""
        ? row.folderId
        : null,
    savedAt: row.savedAt,
    updatedAt: row.updatedAt,
  };
};
