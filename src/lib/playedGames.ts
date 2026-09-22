import { Chess } from "chess.js";

import type { Score } from "./engineAnalysis";
import { engineSettingsFrom, type EngineSettings } from "./engineSettings";
import { gameTag, type Game, type GameHeaders } from "./gameModel";
import {
  countVariations,
  fenAtNode,
  mainline,
  nodeAtSanPath,
  treeToPgn,
  type GameTree,
  type VariationNode,
} from "./gameTree";
import type { CatalogGame, GameCatalog } from "./gameCatalog";
import { parsePgnGame, parsePgnTree } from "./pgn";
import { pieceMaskFrom, samePieceMask, type PieceMask } from "./pieceMask";

/**
 * **The reader's games against the engine** (CTA-74) — Play with Engine's and,
 * since CTA-79, Masked Pieces' — what one is when it is written down, and how
 * it is read back.
 *
 * The three-way split every store keeps (pure model here, IndexedDB in
 * [`playedGameStore.ts`](./playedGameStore.ts), a `useSyncExternalStore`
 * binding in `views/engine/games/usePlayedGames.ts`). It replaced the
 * pre-CTA-74 linear saved game (`savedGames.ts`, deleted in CTA-79; its
 * records were never migrated). What a record is:
 *
 * - **A tree, not a line.** A move played by hand from an earlier position is
 *   a side line under it, so the record is `treeToPgn` out and
 *   `parsePgnTree` back — the saved analyses' pair, not `gameToPgn`.
 * - **Where the reader stands is part of it**, as SAN from the start
 *   (`sanPathTo` / `nodeAtSanPath`) — a node id would not survive the PGN
 *   round trip. The reader's **side** is `settings.playAs`, the way the old
 *   record carried it: the board faces it and the engine plays the other.
 * - **The evals are keyed by FEN**, not by ply: a ply cannot say which line
 *   it is on. Only positions the tree reaches are kept.
 * - **Flat.** No folders — the list is newest first and nothing else.
 * - **A masked game carries its costume** (CTA-79, {@link PlayedGameMask}):
 *   the mask and the notation switch, so Continue reopens it on
 *   `/engine/masked` in the same disguise. The PGN is the true game — a mask
 *   is a costume, never a rule — so the Analysis Board opens it unmasked. A
 *   record without one is an unmasked game, which every record from before
 *   is. The full reference is `.claude/rules/masked-pieces.md`.
 */

/**
 * A masked game's costume (CTA-79): how its pieces are drawn, and whether the
 * notation hides a masked piece's move. Present only on a game played on
 * Masked Pieces — whatever the mask is, the identity one included, since that
 * is still the screen the game is continued on.
 */
export type PlayedGameMask = {
  pieces: PieceMask;
  /** Whether the notation prints coordinates for a hidden piece's move. */
  notation: boolean;
};

/** Whether two records' costumes are the same — both absent included. */
export const samePlayedGameMask = (
  a: PlayedGameMask | undefined,
  b: PlayedGameMask | undefined,
): boolean =>
  a === undefined || b === undefined
    ? a === b
    : a.notation === b.notation && samePieceMask(a.pieces, b.pieces);

/** A stored costume read back, or `undefined` — an unreadable one reads as unmasked. */
const playedGameMaskFrom = (value: unknown): PlayedGameMask | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  const pieces = pieceMaskFrom(row.pieces);
  if (pieces === undefined) return undefined;
  // The notation defaults to the screen's own default: on.
  return { pieces, notation: row.notation !== false };
};

/** One stored eval: the score of one position the tree reaches. Plain JSON. */
export type PlayedGameEval = {
  fen: string;
  kind: Score["kind"];
  /** Centipawns, or moves to mate, signed so that positive favours White. */
  value: number;
};

/** One game played against the engine. Plain JSON, deliberately. */
export type PlayedGame = {
  /** Stable for the life of the game, including across resumes. */
  id: string;
  /** The whole tree, side lines included, as PGN. */
  pgn: string;
  /** The engine knobs it is played under; `playAs` is the reader's side. */
  settings: EngineSettings;
  /** Where the reader was standing, as SAN from the start position. */
  path: readonly string[];
  /** ISO 8601, when the first move was written down. */
  savedAt: string;
  /** ISO 8601, when a move was last added. What "newest first" sorts on. */
  updatedAt: string;
  /** The engine's finished scores for the positions the tree reaches. Absent until one is learned. */
  evals?: PlayedGameEval[];
  /** The side that resigned — the reader's; absent while the game is on. It decides the result. */
  resigned?: "white" | "black";
  /** A Masked Pieces game's costume (CTA-79); absent on an unmasked game. */
  mask?: PlayedGameMask;
};

/** The `Event` tag every played game carries — what these games all are. */
const PLAYED_GAME_EVENT = "Play with Engine";

/** `YYYY.MM.DD`, the PGN `Date` tag's format, in the reader's own timezone. */
const pgnDate = (when: Date): string =>
  [
    when.getFullYear(),
    `${when.getMonth() + 1}`.padStart(2, "0"),
    `${when.getDate()}`.padStart(2, "0"),
  ].join(".");

/**
 * How a position stands, as a PGN result terminator — read off the position
 * rather than tracked as state: `chess.js` already knows whether a position
 * is mate, stalemate or a draw by the other rules. An unfinished game is
 * `"*"`, and so is a FEN that will not load.
 */
export const resultOfFen = (fen: string): string => {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return "*";
  }

  if (chess.isCheckmate()) return chess.turn() === "w" ? "0-1" : "1-0";
  return chess.isGameOver() ? "1/2-1/2" : "*";
};

/** How the engine signs a game: its name and the strength it was set to. */
const engineName = (settings: EngineSettings): string =>
  `Stockfish (level ${settings.skillLevel})`;

/**
 * The tag pairs a played game is written with — who played, on which side,
 * and how it stands. The reader is `"Player"` and the engine is named by its
 * strength, because a PGN tag is language-independent notation: it travels to
 * an export and to any other reader of the file.
 */
export const playedGameHeaders = (
  settings: EngineSettings,
  result: string,
  now: Date = new Date(),
): GameHeaders => ({
  Event: PLAYED_GAME_EVENT,
  Site: "Chess Trainer",
  Date: pgnDate(now),
  Round: "-",
  White: settings.playAs === "white" ? "Player" : engineName(settings),
  Black: settings.playAs === "white" ? engineName(settings) : "Player",
  Result: result,
});

/**
 * How a game stands, as a PGN result: a resignation decides it (the side that
 * resigned loses), else the end of the mainline — mate, stalemate, a draw by
 * rule, or `"*"` while it is on.
 */
export const playedGameResult = (
  tree: GameTree,
  resigned?: "white" | "black",
): string => {
  if (resigned !== undefined) return resigned === "white" ? "0-1" : "1-0";
  return resultOfFen(mainline(tree).at(-1)?.fen ?? tree.startFen);
};

/** The played games' catalog path — their `?game=play/<path>/<id>` segment. */
export const PLAYED_GAMES_PATH = "games";

/** A fresh id — the shared minter; ids are unique within a store. */
export { newRecordId as newPlayedGameId } from "./recordId";

/** Every node of a tree, depth first. */
const nodesOf = (tree: GameTree): VariationNode[] => {
  const out: VariationNode[] = [];
  const walk = (nodes: readonly VariationNode[]) => {
    for (const node of nodes) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(tree.moves);
  return out;
};

/** The evals the tree's positions have, in tree order, each FEN once. */
const evalsOf = (
  tree: GameTree,
  evalsByFen: ReadonlyMap<string, Score> | undefined,
): PlayedGameEval[] => {
  if (evalsByFen === undefined || evalsByFen.size === 0) return [];
  const seen = new Set<string>();
  const entries: PlayedGameEval[] = [];
  for (const fen of [tree.startFen, ...nodesOf(tree).map((node) => node.fen)]) {
    if (seen.has(fen)) continue;
    seen.add(fen);
    const score = evalsByFen.get(fen);
    if (score !== undefined) entries.push({ fen, kind: score.kind, value: score.value });
  }
  return entries;
};

/**
 * Write a game down: the tree as PGN — this app's players, the engine's
 * strength and the result of the mainline in its tags — where the reader
 * stands, the settings (with `playAs` the reader's side) and the evals.
 *
 * The tags are **ours**, over the tree's own: a resumed tree carries the tags
 * of its last save, and the engine's level or the result may have moved on
 * since. The tree's `SetUp` / `FEN` survive, since ours do not name them.
 * `savedAt` is carried in, so the `Date` tag stays the day the game began.
 */
export const playedGameOf = (
  id: string,
  tree: GameTree,
  path: readonly string[],
  settings: EngineSettings,
  evalsByFen?: ReadonlyMap<string, Score>,
  now: Date = new Date(),
  savedAt: string = now.toISOString(),
  resigned?: "white" | "black",
  mask?: PlayedGameMask,
): PlayedGame => {
  const result = playedGameResult(tree, resigned);
  const evals = evalsOf(tree, evalsByFen);
  const headers = { ...tree.headers, ...playedGameHeaders(settings, result, new Date(savedAt)) };
  if (resigned !== undefined) {
    headers.Termination = `${resigned === "white" ? "White" : "Black"} resigns`;
  }
  return {
    id,
    pgn: treeToPgn({ ...tree, headers }),
    settings,
    path: [...path],
    savedAt,
    updatedAt: now.toISOString(),
    ...(evals.length > 0 ? { evals } : {}),
    ...(resigned !== undefined ? { resigned } : {}),
    ...(mask !== undefined ? { mask: { pieces: mask.pieces, notation: mask.notation } } : {}),
  };
};

/** The tree of a played game, or `undefined` for a record that will not parse. */
export const playedGameToTree = (saved: PlayedGame): GameTree | undefined => {
  try {
    return parsePgnTree(saved.pgn);
  } catch {
    // A record written by a broken build, or edited by hand. Still listed and
    // still removable, but it cannot be opened.
    return undefined;
  }
};

/** Where the reader was, resolved against a tree: a node id, or `null` for the start. */
export const playedGameNode = (saved: PlayedGame, tree: GameTree): string | null =>
  nodeAtSanPath(tree, saved.path);

/** The position a played game was left on. */
export const playedGameFen = (saved: PlayedGame, tree: GameTree): string =>
  fenAtNode(tree, playedGameNode(saved, tree));

/** A record's evals as the FEN-keyed map the move list reads. */
export const playedGameEvalsMap = (
  evals: readonly PlayedGameEval[] | undefined,
): Map<string, Score> =>
  new Map((evals ?? []).map((entry) => [entry.fen, { kind: entry.kind, value: entry.value }]));

/** Whether two records' evals would read back identically. */
export const samePlayedGameEvals = (
  a: readonly PlayedGameEval[] | undefined,
  b: readonly PlayedGameEval[] | undefined,
): boolean => {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.fen === right[index].fen &&
        entry.kind === right[index].kind &&
        entry.value === right[index].value,
    )
  );
};

/** One eval entry read back out of storage, or `undefined` for a malformed one. */
const playedGameEvalFrom = (value: unknown): PlayedGameEval | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.fen !== "string" || row.fen === "") return undefined;
  if (row.kind !== "cp" && row.kind !== "mate") return undefined;
  if (typeof row.value !== "number" || !Number.isFinite(row.value)) return undefined;
  return { fen: row.fen, kind: row.kind, value: row.value };
};

/**
 * One stored row, normalised — the settings, the path and the evals read field
 * by field, so an older or hand-edited entry resumes rather than being
 * dropped. Only an id, a PGN and the two dates are required.
 */
export const playedGameFrom = (value: unknown): PlayedGame | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    row.id === "" ||
    typeof row.pgn !== "string" ||
    row.pgn === "" ||
    typeof row.savedAt !== "string" ||
    typeof row.updatedAt !== "string"
  ) {
    return undefined;
  }
  const evals = Array.isArray(row.evals)
    ? row.evals.map(playedGameEvalFrom).filter((entry) => entry !== undefined)
    : [];
  const mask = playedGameMaskFrom(row.mask);
  return {
    id: row.id,
    pgn: row.pgn,
    settings: engineSettingsFrom(row.settings),
    path: Array.isArray(row.path)
      ? row.path.filter((san): san is string => typeof san === "string")
      : [],
    savedAt: row.savedAt,
    updatedAt: row.updatedAt,
    ...(evals.length > 0 ? { evals } : {}),
    ...(row.resigned === "white" || row.resigned === "black" ? { resigned: row.resigned } : {}),
    ...(mask !== undefined ? { mask } : {}),
  };
};

/** What a row shows about a game without opening it. Pure, so it is testable. */
export type PlayedGameSummary = {
  /** How many full moves the mainline runs to — half-moves rounded up. */
  moves: number;
  /** How many side lines branch off it. */
  variations: number;
  /** How it stands, as a PGN result — `"*"` while it is on. */
  result: string;
  /** The side the reader plays. */
  playAs: EngineSettings["playAs"];
  /** `Skill Level` the engine is set to. */
  skillLevel: number;
  /** Whether it was played on Masked Pieces — the list's marker, and where Continue goes. */
  masked: boolean;
};

export const playedGameSummary = (
  saved: PlayedGame,
  tree: GameTree | undefined,
): PlayedGameSummary => {
  return {
    moves: tree === undefined ? 0 : Math.ceil(mainline(tree).length / 2),
    variations: tree === undefined ? 0 : countVariations(tree),
    result: tree === undefined ? "*" : playedGameResult(tree, saved.resigned),
    playAs: saved.settings.playAs,
    skillLevel: saved.settings.skillLevel,
    masked: saved.mask !== undefined,
  };
};

/**
 * The played games as a **game catalog** (`lib/gameCatalog.ts`) — one entry
 * per record that parses — so `?game=play/games/<id>` hands one to the
 * Analysis Board through the ordinary hand-off (`lib/gameReference.ts`). The
 * item's `game` is the mainline; the side lines stay in the `pgn`, which is
 * what the Analysis Board re-reads.
 */
export const playedGameCatalogOf = (games: readonly PlayedGame[]): GameCatalog => {
  const entries: CatalogGame[] = [];
  for (const saved of games) {
    let game: Game;
    try {
      game = parsePgnGame(saved.pgn);
    } catch {
      continue;
    }
    entries.push({
      id: saved.id,
      // English and never rendered here: the list writes its own rows.
      name: `${gameTag(game.headers, "White") ?? "White"} – ${
        gameTag(game.headers, "Black") ?? "Black"
      }`,
      pgn: saved.pgn,
      game,
    });
  }
  return { path: PLAYED_GAMES_PATH, games: entries };
};
