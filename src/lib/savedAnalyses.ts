import {
  analysisSettingsFrom,
  type AnalysisSettings,
} from "./analysisSettings";
import { gameTag, type Game, type GameHeaders } from "./gameModel";
import {
  countVariations,
  fenAtNode,
  mainlineGame,
  nodeAtSanPath,
  pathTo,
  treeToPgn,
  type GameTree,
  type VariationNode,
} from "./gameTree";
import type { CatalogGame, GameCatalog } from "./gameCatalog";
import { parsePgnGame, parsePgnTree, readPgnTags } from "./pgn";

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
 *
 * ## Written when the reader says so, named, and filed (CTA-73)
 *
 * The board used to write itself on every move; it is saved explicitly now
 * (Update / Save as copy / a new board's Save dialog), so a record carries
 * the reader's own **name** for it and the **folder** it is filed under —
 * `lib/savedAnalysisFolders.ts`, the saved games' nested tree again. A record
 * from before either field reads as Unfiled, named from its tags
 * ({@link savedAnalysisDerivedName}), so there is no version bump.
 *
 * ## Its settings (CTA-73)
 *
 * What the reader sets on the analysis' settings screen
 * (`/tools/analysis/saved/<id>/settings`), beside the name and the folder: a
 * **description**, the **side** the board opens facing (`orientation` — the
 * repertoire's main colour, so a flip on the board is the session's and an
 * Update does not write it), and whether the board opens **showing the
 * next-move arrows** (`showArrows`, on by default). Each reads as its default
 * on a record from before it.
 */

/** How long a description may be. */
export const MAX_ANALYSIS_DESCRIPTION_CHARS = 2000;

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
  /**
   * The side the board opens facing — set when it is first saved, from the
   * board as it faced, and changed on its settings screen.
   */
  orientation: "white" | "black";
  /** The reader's notes on it. May be empty. */
  description: string;
  /** Whether the board opens drawing the next-move arrows. */
  showArrows: boolean;
  /**
   * The reader's name for it. May be empty — a row then names it by its
   * players, or by the generic "Analysis board".
   */
  name: string;
  /** The folder it is filed under (`savedAnalysisFolders.ts`), or `null` for Unfiled. */
  folderId: string | null;
  /** ISO 8601, when the analysis was first written down. */
  savedAt: string;
  /** ISO 8601, when it was last worked on. What "newest first" sorts on. */
  updatedAt: string;
};

/** The saved analyses' catalog path — their `?game=analysis/<path>/<id>` segment. */
export const SAVED_ANALYSES_PATH = "saved";

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
 * Language-independent, as a PGN tag has to be: the record travels to an
 * export and to any other reader of the file, none of which know what language
 * this app happened to be in. `Result` is `"*"` — an analysis is
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
 * The name an analysis' tags give it, when the reader has given none: its
 * players, unless they are this screen's placeholder, else its `Event` unless
 * that is the placeholder too — else empty, which a row shows as the generic.
 * How a record from before names existed is named, and a new one's default.
 */
export const savedAnalysisDerivedName = (headers: GameHeaders): string => {
  const white = gameTag(headers, "White");
  const black = gameTag(headers, "Black");
  if (
    white !== undefined &&
    black !== undefined &&
    white !== SAVED_ANALYSIS_PLAYER &&
    black !== SAVED_ANALYSIS_PLAYER
  ) {
    return `${white} – ${black}`;
  }
  const event = gameTag(headers, "Event");
  return event !== undefined && event !== SAVED_ANALYSIS_EVENT ? event : "";
};

/**
 * Write an analysis down: the whole tree as PGN, the knobs it was worked under,
 * and where the reader was standing. Named from its tags and Unfiled — a
 * caller with a name or a folder spreads them over the result.
 *
 * `savedAt` is carried in rather than derived so that updating an analysis
 * begun yesterday keeps yesterday's date — the record is updated, not
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
  name: savedAnalysisDerivedName(tree.headers),
  folderId: null,
  description: "",
  showArrows: true,
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
    // A record from before names (CTA-73) is named by its tags.
    name:
      typeof row.name === "string"
        ? row.name
        : savedAnalysisDerivedName(readPgnTags(value.pgn)),
    folderId:
      typeof row.folderId === "string" && row.folderId !== "" ? row.folderId : null,
    description:
      typeof row.description === "string"
        ? row.description.slice(0, MAX_ANALYSIS_DESCRIPTION_CHARS)
        : "",
    showArrows: typeof row.showArrows === "boolean" ? row.showArrows : true,
  };
};

/** What the settings screen edits — every field of it, written at once. */
export type SavedAnalysisSettingsEdit = Pick<
  SavedAnalysis,
  "name" | "description" | "orientation" | "showArrows" | "folderId"
>;

/** What a row shows about an analysis without opening it. Pure, so it is testable. */
export type SavedAnalysisSummary = {
  /** How many full moves the mainline runs to — half-moves rounded up. */
  moves: number;
  /** How many nodes there are in total — mainline plus every side line. */
  nodes: number;
  /**
   * How many distinct side lines branch off the tree — the "N variations"
   * line's unit. A single side line counts once however many moves it runs
   * to; see {@link countVariations}.
   */
  variations: number;
  /**
   * How deep into the tree the reader was standing — resolved against `tree`,
   * not read off `saved.path` directly, so a path left stale by an edit since
   * the record was written cannot claim a depth deeper than where the record
   * actually reopens (`nodeAtSanPath` stops at the last SAN it still matches).
   */
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
): SavedAnalysisSummary => {
  if (tree === undefined) {
    return { moves: 0, nodes: 0, variations: 0, ply: saved.path.length };
  }

  const plies = mainlineGame(tree).moves.length;
  const nodes = countNodes(tree);
  return {
    // Half-moves rounded up to full moves, the way the move list numbers them.
    moves: Math.ceil(plies / 2),
    nodes,
    variations: countVariations(tree),
    // The path resolved against the tree, so a stale record (edited since it
    // was saved) reports the depth it actually reopens at rather than the
    // length of a path it can no longer fully walk.
    ply: pathTo(tree, nodeAtSanPath(tree, saved.path)).length,
  };
};

/**
 * The saved analyses as a **game catalog** (`lib/gameCatalog.ts`) — one entry
 * per record that parses, in the order they were given — so
 * `?game=analysis/saved/<id>` resolves through the ordinary hand-off
 * (`lib/gameReference.ts`) rather than a transport of its own. The entry's
 * `game` is the **mainline**; the side lines are still in the `pgn` beside it,
 * which is what the Analysis Board re-reads.
 */
export const savedAnalysisCatalogOf = (
  analyses: readonly SavedAnalysis[],
): GameCatalog => {
  const games: CatalogGame[] = [];
  for (const saved of analyses) {
    let game: Game;
    try {
      game = parsePgnGame(saved.pgn);
    } catch {
      continue;
    }

    games.push({
      id: saved.id,
      // English, and never rendered by this app: the Saved analyses screen
      // writes its own translated rows.
      name:
        saved.name ||
        `${gameTag(game.headers, "White") ?? "White"} – ${
          gameTag(game.headers, "Black") ?? "Black"
        }`,
      pgn: saved.pgn,
      game,
    });
  }

  return { path: SAVED_ANALYSES_PATH, games };
};

/**
 * **Split** (CTA-73): each game of a many-game text its own analysis, in file
 * order — named by the game (`readRepertoireText`'s names), opened at its
 * start facing White, worked under `settings`, and filed under `folderId`
 * (the folder the split makes, named after the text). `newId` is called once
 * per record.
 */
export const splitAnalysesOf = (
  newId: () => string,
  games: readonly { name: string; tree: GameTree }[],
  folderId: string | null,
  settings: AnalysisSettings,
  now: Date = new Date(),
): SavedAnalysis[] =>
  games.map((game) => ({
    ...savedAnalysisOf(newId(), game.tree, [], settings, "white", now),
    name: game.name,
    folderId,
  }));

/**
 * **The Library's picked games as analyses** (CTA-77, the collection
 * table's Analyse): each game its own analysis, in the order given — named
 * as a split names a game (`repertoireGameNamesOf`'s names, passed in),
 * opened at its start facing White, worked under `settings`, and filed under
 * `folderId` (the folder the batch makes).
 *
 * Unlike {@link splitAnalysesOf}, the game is **not re-parsed**: its PGN is
 * kept as the collection holds it. A collection's games were each parsed
 * with `parsePgnTree` when it came in — its index marks the ones that would
 * not, and the caller leaves those out — and a stored PGN keeps its side
 * lines and comments by being the text it is; re-writing it through a tree
 * would cost ~10 ms a game on the main thread, over a minute for a
 * 7,818-game pick. It is parsed when the analysis is opened, as any is.
 */
export const batchAnalysesOf = (
  newId: () => string,
  games: readonly { name: string; pgn: string }[],
  folderId: string | null,
  settings: AnalysisSettings,
  now: Date = new Date(),
): SavedAnalysis[] =>
  games.map((game) => ({
    id: newId(),
    pgn: game.pgn.trim(),
    settings,
    path: [],
    orientation: "white",
    description: "",
    showArrows: true,
    name: game.name,
    folderId,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }));
