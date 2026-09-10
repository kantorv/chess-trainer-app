import {
  analysisSettingsFrom,
  type AnalysisSettings,
} from "./analysisSettings";
import { gameTag, type Game, type GameHeaders } from "./gameModel";
import {
  fenAtNode,
  mainlineGame,
  nodeAtSanPath,
  treeToPgn,
  type GameTree,
  type VariationNode,
} from "./gameTree";
import {
  libraryCatalogOf,
  type LibraryCatalog,
  type LibraryCategory,
  type LibraryGame,
} from "./libraryCatalog";
import { parsePgnGame, parsePgnTree } from "./pgn";

/**
 * **The reader's analysis boards** — what one is when it is written down, and
 * how it is read back.
 *
 * The Analysis Board grows a {@link GameTree} move by move
 * (`lib/gameTree.ts`); this is the layer that lets that work outlive the tab.
 * It is [`savedGames.ts`](./savedGames.ts) again, in the same three-way split
 * (pure model here, `localStorage` in
 * [`savedAnalysisStore.ts`](./savedAnalysisStore.ts), a `useSyncExternalStore`
 * binding in `views/tools/analysis/saved/useSavedAnalyses.ts`) and for the same
 * reasons — so only what is **different** is written out below.
 *
 * ## The one real difference: a tree, not a line
 *
 * A saved engine game is one line of play, so it is written with `gameToPgn` and
 * read back with `parsePgnGame`. An analysis is the opposite: side lines are the
 * whole point of the screen, and `chess.js` `loadPgn` discards `( … )`. So the
 * pair here is {@link treeToPgn} out and `parsePgnTree` back —
 * the round trip `lib/gameTree.ts` and `lib/pgn.ts` already test in both
 * directions. PGN is still the format, for every reason it is there: it is what
 * this app parses in two directions, so a record survives the next version of
 * the app and can be pasted anywhere else.
 *
 * ## And a second: *where* the reader was is part of the record
 *
 * A game against the engine is resumed at its last move, because that is the
 * only position it can be played on from. A tree has no such position — the
 * reader may have been standing three moves deep inside a side line — so the
 * record carries that place, and both the card's preview board and the resumed
 * screen open on it.
 *
 * It is carried as **SAN from the root** ({@link sanPathTo}), never as a node
 * id: ids are minted per tree, so the id would name nothing once the PGN has
 * been re-parsed. The board's orientation rides along for the same reason the
 * engine settings do — coming back to your own analysis should not turn it
 * around.
 */

/** One analysis board the reader worked on. Plain JSON, deliberately. */
export type SavedAnalysis = {
  /** Stable for the life of the analysis, including across a reopen. */
  id: string;
  /** The whole tree, side lines included, as PGN — see the note above. */
  pgn: string;
  /** The engine knobs it was worked under, restored when it is reopened. */
  settings: AnalysisSettings;
  /** Where the reader was standing, as SAN from the start position. */
  path: readonly string[];
  /** Which way the board was facing. */
  orientation: "white" | "black";
  /** ISO 8601, when the analysis was first written down. */
  savedAt: string;
  /** ISO 8601, when it was last worked on. What "newest first" sorts on. */
  updatedAt: string;
};

/** The category path the saved analyses sit under, and their reference segment. */
export const SAVED_ANALYSES_PATH = "saved";

/** The folder's name is chrome the app ships, so it is a locale key. */
export const SAVED_ANALYSES_LABEL_KEY = "savedAnalyses.title";

/** The `Event` tag a saved analysis carries when it is not a game's. */
export const SAVED_ANALYSIS_EVENT = "Analysis Board";

/**
 * The `White` / `Black` tag a saved analysis carries when it is not a game's.
 *
 * PGN has no way to say "nobody in particular", and a tag pair has to be there
 * for the file to be one — so this is the placeholder, and the Saved analyses
 * screen tells it from a real name to decide whether a row is named by its
 * players or by the translated generic.
 */
export const SAVED_ANALYSIS_PLAYER = "Analysis";

/**
 * A fresh id — the clock plus a little randomness, in `[0-9a-z]` because the
 * value travels in a URL (`?game=` and `?analysis=`).
 *
 * The same minter the saved games use rather than a second copy of it: an id is
 * unique within its own store, and the two stores are separate, so there is
 * nothing here for a second rule to say.
 */
export { newSavedGameId as newSavedAnalysisId } from "./savedGames";

/** `YYYY.MM.DD`, the PGN `Date` tag's format, in the reader's own timezone. */
const pgnDate = (when: Date): string =>
  [
    when.getFullYear(),
    `${when.getMonth() + 1}`.padStart(2, "0"),
    `${when.getDate()}`.padStart(2, "0"),
  ].join(".");

/**
 * The tag pairs a saved analysis is written with.
 *
 * Language-independent, as a PGN tag has to be: the record travels to Load PGN's
 * Info tab, to an export and to any other reader of the file, none of which know
 * what language this app happened to be in. `Result` is `"*"` — an analysis is
 * not a game with an outcome, and `gameTag` already reports `"*"` as absent, so
 * nothing renders it. The tree's *own* headers win over these, so an analysis
 * begun from a library game keeps that game's players and event.
 */
export const savedAnalysisHeaders = (now: Date = new Date()): GameHeaders => ({
  Event: SAVED_ANALYSIS_EVENT,
  Site: "Chess Trainer",
  Date: pgnDate(now),
  Round: "-",
  White: SAVED_ANALYSIS_PLAYER,
  Black: SAVED_ANALYSIS_PLAYER,
  Result: "*",
});

/**
 * Write an analysis down: the whole tree as PGN, the knobs it was worked under,
 * and where the reader was standing.
 *
 * `savedAt` is carried in rather than derived so that adding a move to an
 * analysis begun yesterday keeps yesterday's date — the record is updated, not
 * replaced, which is what makes the id stable across the whole of it.
 */
export const savedAnalysisOf = (
  id: string,
  tree: GameTree,
  path: readonly string[],
  settings: AnalysisSettings,
  orientation: "white" | "black",
  now: Date = new Date(),
  savedAt: string = now.toISOString(),
): SavedAnalysis => ({
  id,
  pgn: treeToPgn({
    ...tree,
    // The tree's own tags win: a game opened from a library keeps its players,
    // and a `FEN` header naming the position it started from is what makes it
    // reload as that position rather than as a new board.
    headers: { ...savedAnalysisHeaders(now), ...tree.headers },
  }),
  settings,
  path: [...path],
  orientation,
  savedAt,
  updatedAt: now.toISOString(),
});

/** The tree of a saved analysis, or `undefined` for a record that will not parse. */
export const savedAnalysisToTree = (
  saved: SavedAnalysis,
): GameTree | undefined => {
  try {
    return parsePgnTree(saved.pgn);
  } catch {
    // A record written by a broken build, or edited by hand in the dev tools.
    // The screen still lists it — and can still delete it — but cannot open it.
    return undefined;
  }
};

/** Where the reader was, resolved against a tree: a node id, or `null` for ply 0. */
export const savedAnalysisNode = (
  saved: SavedAnalysis,
  tree: GameTree,
): string | null => nodeAtSanPath(tree, saved.path);

/** The position a saved analysis was left on — what its card previews. */
export const savedAnalysisFen = (
  saved: SavedAnalysis,
  tree: GameTree,
): string => fenAtNode(tree, savedAnalysisNode(saved, tree));

/** Whether a value parsed out of storage is a saved analysis. Structural, on purpose. */
export const isSavedAnalysis = (value: unknown): value is SavedAnalysis => {
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
 * One stored row, normalised — the settings, the path and the orientation filled
 * in from the defaults for anything the record does not have, so an older or
 * hand-edited entry reopens rather than being dropped.
 */
export const savedAnalysisFrom = (value: unknown): SavedAnalysis | undefined => {
  if (!isSavedAnalysis(value)) return undefined;
  // Read the untrusted fields off the raw object: the guard above only vouches
  // for the four it actually checks, and a narrowed type would let the rest be
  // taken on trust.
  const row: Record<string, unknown> = { ...value };

  return {
    ...value,
    settings: analysisSettingsFrom(row.settings),
    path: Array.isArray(row.path)
      ? row.path.filter((san): san is string => typeof san === "string")
      : [],
    orientation: row.orientation === "black" ? "black" : "white",
  };
};

/** What a row shows about an analysis without opening it. Pure, so it is testable. */
export type SavedAnalysisSummary = {
  /** How many half-moves the mainline runs to. */
  moves: number;
  /** How many nodes there are in total — mainline plus every side line. */
  nodes: number;
  /** How deep into the tree the reader was standing. */
  ply: number;
};

/** Every node in a tree, counted — the mainline and every side line alike. */
const countNodes = (tree: GameTree): number => {
  const walk = (nodes: readonly VariationNode[]): number =>
    nodes.reduce((total, node) => total + 1 + walk(node.children), 0);
  return walk(tree.moves);
};

export const savedAnalysisSummary = (
  saved: SavedAnalysis,
  tree: GameTree | undefined,
): SavedAnalysisSummary => ({
  moves: tree === undefined ? 0 : mainlineGame(tree).moves.length,
  nodes: tree === undefined ? 0 : countNodes(tree),
  ply: saved.path.length,
});

/**
 * The saved analyses as a **library catalog** — one category, one `LibraryGame`
 * per record that parses, in the order they were given.
 *
 * The same one reason `savedGameCatalogOf` exists: `?game=` resolves a reference
 * against a catalog (`lib/gameReference.ts`), so presenting them as one is what
 * lets "open this in Load PGN" be the hand-off that screen already has rather
 * than a second transport. The item's `game` is the **mainline** — that is what
 * a `LibraryGame` is and what a replay screen walks; the side lines are still in
 * the `pgn` beside it, which is what the Analysis Board re-reads.
 */
export const savedAnalysisCatalogOf = (
  analyses: readonly SavedAnalysis[],
): LibraryCatalog => {
  const category: LibraryCategory = {
    id: SAVED_ANALYSES_PATH,
    path: SAVED_ANALYSES_PATH,
    labelKey: SAVED_ANALYSES_LABEL_KEY,
    children: [],
  };

  const items: LibraryGame[] = [];
  for (const saved of analyses) {
    let game: Game;
    try {
      game = parsePgnGame(saved.pgn);
    } catch {
      continue;
    }

    items.push({
      kind: "game",
      id: saved.id,
      category: SAVED_ANALYSES_PATH,
      // English, and never rendered by this app: the Saved analyses screen
      // writes its own translated rows. It is here because a `LibraryItem`
      // carries a name, and a PGN's players are the honest answer to what this
      // is — which for an analysis begun from a library game is that game.
      name: {
        en: `${gameTag(game.headers, "White") ?? "White"} – ${
          gameTag(game.headers, "Black") ?? "Black"
        }`,
      },
      pgn: saved.pgn,
      game,
    });
  }

  return libraryCatalogOf([category], items, []);
};
