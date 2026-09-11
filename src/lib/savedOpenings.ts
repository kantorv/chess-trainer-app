import { finalFenOf, gameTag, type GameHeaders } from "./gameModel";
import { mainlineGame, treeToPgn, type GameTree } from "./gameTree";
import { parsePgnTree } from "./pgn";

/**
 * **The reader's saved openings** — what one is when it is written down, and how
 * it is read back.
 *
 * The Openings screen grows a {@link GameTree} move by move
 * (`lib/gameTree.ts`); this is the layer that lets a position worth coming back
 * to outlive the tab. It is [`savedAnalyses.ts`](./savedAnalyses.ts) again, in
 * the same three-way split (pure model here, `localStorage` in
 * [`savedOpeningStore.ts`](./savedOpeningStore.ts), a `useSyncExternalStore`
 * binding in `views/tools/openings/saved/useSavedOpenings.ts`) and for the same
 * reason — but two things are deliberately **not** carried over from an
 * analysis, because an opening is not an analysis board:
 *
 * - **No place in the tree.** An analysis records *where the reader was
 *   standing* (SAN from the root) because a tree has no natural "current"
 *   position. An opening is a line to be replayed and branched, so it reopens at
 *   ply 0 — the tree itself, side lines and all, is the whole point.
 * - **No engine settings.** An analysis is worked under an engine; an opening is
 *   just explored. There is nothing to restore but the orientation, which rides
 *   along for the same reason it does on an analysis: coming back to a position
 *   you saved from the Black side should not turn it around.
 *
 * What an opening adds instead is the **note** — a reader's own one-line name
 * for the position, prompted when it is saved and editable afterward on the
 * Saved openings screen. It is the thing a row is named by, since a position
 * begun from an empty board carries no players to name it after.
 *
 * Like an analysis, the record is **PGN** (`treeToPgn` out, `parsePgnTree` back)
 * rather than a serialised tree: side lines are the one thing an opening
 * explorer keeps, and PGN is what this app already round-trips.
 */

/** One position the reader saved on the Openings screen. Plain JSON. */
export type SavedOpening = {
  /** Stable for the life of the record. */
  id: string;
  /** The whole tree, side lines included, as PGN — see the note above. */
  pgn: string;
  /** Which way the board was facing when it was saved. */
  orientation: "white" | "black";
  /** The reader's own name for the position. May be empty. */
  note: string;
  /** ISO 8601, when it was first saved. */
  savedAt: string;
  /** ISO 8601, when it was last changed. What "newest first" sorts on. */
  updatedAt: string;
};

/** The category path the saved openings sit under. */
export const SAVED_OPENINGS_PATH = "saved";

/** The folder's name is chrome the app ships, so it is a locale key. */
export const SAVED_OPENINGS_LABEL_KEY = "savedOpenings.title";

/** The `Event` tag a saved opening carries. */
export const SAVED_OPENING_EVENT = "Openings";

/**
 * The `White` / `Black` tag a saved opening carries — the same placeholder an
 * analysis uses, because PGN has no way to say "nobody in particular" and a tag
 * pair has to be there for the file to be one.
 */
export const SAVED_OPENING_PLAYER = "Opening";

/**
 * A fresh id — the clock plus a little randomness, in `[0-9a-z]` because the
 * value travels in a URL (`?openings=`).
 *
 * The same minter the saved games use rather than a second copy of it: an id is
 * unique within its own store, and the stores are separate, so there is nothing
 * here for a second rule to say.
 */
export { newSavedGameId as newSavedOpeningId } from "./savedGames";

/** `YYYY.MM.DD`, the PGN `Date` tag's format, in the reader's own timezone. */
const pgnDate = (when: Date): string =>
  [
    when.getFullYear(),
    `${when.getMonth() + 1}`.padStart(2, "0"),
    `${when.getDate()}`.padStart(2, "0"),
  ].join(".");

/**
 * The tag pairs a saved opening is written with. Language-independent, as a PGN
 * tag has to be. `Result` is `"*"` — an opening is not a game with an outcome,
 * and `gameTag` already reports `"*"` as absent. The tree's *own* headers win
 * over these, so an opening begun from a library position keeps its players.
 */
export const savedOpeningHeaders = (now: Date = new Date()): GameHeaders => ({
  Event: SAVED_OPENING_EVENT,
  Site: "Chess Trainer",
  Date: pgnDate(now),
  Round: "-",
  White: SAVED_OPENING_PLAYER,
  Black: SAVED_OPENING_PLAYER,
  Result: "*",
});

/**
 * Write an opening down: the whole tree as PGN, the orientation it was viewed
 * from, and the note.
 *
 * `savedAt` is carried in rather than derived so that editing the note of a
 * record saved yesterday keeps yesterday's date — the record is updated, not
 * replaced.
 */
export const savedOpeningOf = (
  id: string,
  tree: GameTree,
  orientation: "white" | "black",
  note: string,
  now: Date = new Date(),
  savedAt: string = now.toISOString(),
): SavedOpening => ({
  id,
  pgn: treeToPgn({
    ...tree,
    headers: { ...savedOpeningHeaders(now), ...tree.headers },
  }),
  orientation,
  note,
  savedAt,
  updatedAt: now.toISOString(),
});

/** The tree of a saved opening, or `undefined` for a record that will not parse. */
export const savedOpeningToTree = (
  saved: SavedOpening,
): GameTree | undefined => {
  try {
    return parsePgnTree(saved.pgn);
  } catch {
    // A record written by a broken build, or edited by hand in the dev tools.
    // The screen still lists it — and can still delete it — but cannot open it.
    return undefined;
  }
};

/** The final position of the mainline — what a card previews and "play from here" hands on. */
export const savedOpeningFen = (
  saved: SavedOpening,
  tree: GameTree,
): string => finalFenOf(mainlineGame(tree));

/** Whether a value parsed out of storage is a saved opening. Structural, on purpose. */
export const isSavedOpening = (value: unknown): value is SavedOpening => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id !== "" &&
    typeof row.pgn === "string" &&
    row.pgn !== "" &&
    typeof row.savedAt === "string" &&
    typeof row.updatedAt === "string"
  );
};

/**
 * One stored row, normalised — the note and the orientation filled in from the
 * defaults for anything the record does not have, so an older or hand-edited
 * entry reopens rather than being dropped.
 */
export const savedOpeningFrom = (value: unknown): SavedOpening | undefined => {
  if (!isSavedOpening(value)) return undefined;
  // Read the untrusted fields off the raw object: the guard above only vouches
  // for the four it actually checks, and a narrowed type would let the rest be
  // taken on trust.
  const row: Record<string, unknown> = { ...value };

  return {
    ...value,
    note: typeof row.note === "string" ? row.note : "",
    orientation: row.orientation === "black" ? "black" : "white",
  };
};