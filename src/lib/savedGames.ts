import { Chess } from "chess.js";

import { type Score } from "./engineAnalysis";
import { engineSettingsFrom, type EngineSettings } from "./engineSettings";
import {
  finalFenOf,
  gameTag,
  initialFenOf,
  type Game,
  type GameHeaders,
} from "./gameModel";
import { gameToPgn } from "./gameTree";
import { parsePgnGame } from "./pgn";

/**
 * **The reader's games against the engine** — what one is when it is written
 * down, and how it is read back.
 *
 * Play with Engine grows a `Game` move by move (`lib/gameModel.ts`); this is the
 * layer that lets that game outlive the tab. It is the pure half, in the shape
 * the rest of `src/lib/` is written in: it takes its games as a parameter, never
 * touches `localStorage`, and nothing here throws. The storage half is
 * [`savedGameStore.ts`](./savedGameStore.ts) and the React binding is
 * its reader was the Saved games list (deleted, CTA-74) — the three-way split
 * every store in `src/lib/` keeps.
 *
 * ## A saved game is a PGN and the settings it was played under
 *
 * **PGN, not a serialised `Game`.** The move list, the ply navigation and the
 * board controls all speak `Game`, and a `Game` is a *walk* — every move carries
 * the FEN after it, so writing the object out would store a position per half
 * move for no gain. PGN is the format the app already parses in two directions,
 * so a saved game round-trips through `parsePgnGame` exactly as a pasted one
 * does, and a record written by one version of the app is still readable by the
 * next. {@link gameToPgn} is the writer that was missing; `parsePgnGame` is the
 * reader that already existed.
 *
 * The settings ride beside it because **resuming has to put the engine back**:
 * a game played at Skill Level 3 from the Black side is not the same game once
 * it continues at level 20 with the reader on White. They are not in the PGN
 * tags — a tag pair is what the game *was*, and these are how the next move gets
 * made — so they are a field of their own, read back through
 * `engineSettingsFrom` rather than trusted.
 */

/** One game the reader played against the engine. Plain JSON, deliberately. */
export type SavedGame = {
  /** Stable for the life of the game, including across resumes. */
  id: string;
  /** The whole of the moves, as PGN — see the note above. */
  pgn: string;
  /** The engine knobs it was played under, restored when it is resumed. */
  settings: EngineSettings;
  /** ISO 8601, when the first move was written down. */
  savedAt: string;
  /** ISO 8601, when it was last added to. What "newest first" sorts on. */
  updatedAt: string;
  /**
   * The folder the game is filed under, or `null` for **Unfiled** — the state a
   * pre-folder record (CTA-46) is already in. A folder is not a game
   * ([`savedGameFolders.ts`](./savedGameFolders.ts)); this is the plain id that
   * joins them, and the store, not the writer of a record, is what keeps it
   * across the saves the autosave effect makes.
   */
  folderId: string | null;
  /**
   * The scores the engine finished searching while the game was played, as a
   * per-ply list beside the PGN (CTA-50) — each entry the evaluation of the
   * position *after* its ply, ply 0 being the starting position. A per-ply list
   * rather than `[%eval]` comments inside the PGN, which would touch the shared
   * PGN writer (`gameToPgn`, also used by saved analyses) and need a comment
   * parser on read-back. Absent until the first eval is learned; read back
   * through `savedGameFrom`, which drops a malformed entry, never the game.
   */
  evals?: SavedGameEval[];
};

/** One stored eval: the score of the position after one ply. Plain JSON. */
export type SavedGameEval = {
  /** The half-move this is the evaluation *after*; 0 is the starting position. */
  ply: number;
  kind: Score["kind"];
  /** Centipawns, or moves to mate, signed so that positive favours White. */
  value: number;
};

/** The `Event` tag every saved game carries — what these games all are. */
export const SAVED_GAME_EVENT = "Play with Engine";

/**
 * A fresh id.
 *
 * The clock plus a little randomness: two games started in the same millisecond
 * in two tabs must not collide, and the value travels in a URL (`?game=` and
 * `?saved=`), so it stays in `[0-9a-z]`. It is not a hash of the game — the id
 * has to be stable while the game is still growing.
 */
export const newSavedGameId = (
  now: Date = new Date(),
  entropy: number = Math.random(),
): string =>
  `g${now.getTime().toString(36)}${Math.floor(entropy * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;

/** `YYYY.MM.DD`, the PGN `Date` tag's format, in the reader's own timezone. */
const pgnDate = (when: Date): string =>
  [
    when.getFullYear(),
    `${when.getMonth() + 1}`.padStart(2, "0"),
    `${when.getDate()}`.padStart(2, "0"),
  ].join(".");

/**
 * How the game stands, as a PGN result terminator.
 *
 * Read off the position rather than tracked as state: `chess.js` already knows
 * whether a position is mate, stalemate or a draw by the other rules, and the
 * final FEN is the one thing a saved game always has. An unfinished game is
 * `"*"`, which `gameTag` already reports as absent — so nothing renders it.
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
 * The tag pairs a saved game is written with — who played, on which side, and
 * how it stands.
 *
 * The reader is named `"Player"` and the engine by its strength, because a PGN
 * tag is language-independent notation: it travels to an export and to any
 * other reader of the file, none of which know what
 * language this app happened to be in. The game's *own* headers win over these
 * (`gameFromChess` writes a `FEN` tag for a game set up from a position), so a
 * game handed over by the Board Editor still reloads as itself.
 */
export const savedGameHeaders = (
  settings: EngineSettings,
  result: string,
  now: Date = new Date(),
): GameHeaders => ({
  Event: SAVED_GAME_EVENT,
  Site: "Chess Trainer",
  Date: pgnDate(now),
  Round: "-",
  White: settings.playAs === "white" ? "Player" : engineName(settings),
  Black: settings.playAs === "white" ? engineName(settings) : "Player",
  Result: result,
});

/**
 * The evals a game carries, as the record's per-ply list (CTA-50).
 *
 * The engine reports scores keyed by the FEN they describe — that is how the
 * screen accumulates them (`usePlayWithEngine`) — and this walks the game's own
 * plies against that map, so only positions *this game* reaches are recorded
 * and a score the session learned for some other position stays out. Each entry
 * is the evaluation of the position *after* its ply, ply 0 being the starting
 * position; a position reached twice (a repetition) is one entry per ply, all
 * reading the same score.
 */
const evalsOf = (
  game: Game,
  evalsByFen: ReadonlyMap<string, Score> | undefined,
): SavedGameEval[] => {
  if (evalsByFen === undefined || evalsByFen.size === 0) return [];

  const entries: SavedGameEval[] = [];
  const start = evalsByFen.get(initialFenOf(game));
  if (start !== undefined) {
    entries.push({ ply: 0, kind: start.kind, value: start.value });
  }
  for (const move of game.moves) {
    const score = evalsByFen.get(move.fen);
    if (score !== undefined) {
      entries.push({ ply: move.ply, kind: score.kind, value: score.value });
    }
  }
  return entries;
};

/**
 * Write a game down: its moves as PGN, plus the settings to resume it under.
 *
 * `savedAt` is carried in rather than derived so that adding a move to a game
 * saved yesterday keeps yesterday's date — the record is updated, not replaced,
 * which is what makes the id stable across a whole game. `folderId` is `null`
 * by default because the autosave effect — the one caller — cannot know where
 * the reader filed the game; the *store* carries the stored folder forward
 * (`saveGame`), so a record this writes never strips an assignment. The evals
 * ride beside the PGN as a per-ply list ({@link SavedGame.evals}), and are
 * left out entirely until the first one is learned, so an unevaluated game's
 * record stays byte-identical to what a pre-eval build wrote.
 */
export const savedGameOf = (
  id: string,
  game: Game,
  settings: EngineSettings,
  now: Date = new Date(),
  savedAt: string = now.toISOString(),
  folderId: string | null = null,
  evalsByFen?: ReadonlyMap<string, Score>,
): SavedGame => {
  const result = resultOfFen(finalFenOf(game));
  const evals = evalsOf(game, evalsByFen);

  return {
    id,
    pgn: gameToPgn({
      ...game,
      // The game's own tags win: a `FEN` header naming the position it started
      // from is what makes it reload as that game rather than as a new one.
      headers: { ...savedGameHeaders(settings, result, now), ...game.headers },
    }),
    settings,
    savedAt,
    updatedAt: now.toISOString(),
    folderId,
    ...(evals.length > 0 ? { evals } : {}),
  };
};

/**
 * The evals a stored record carries, read back into the FEN-keyed map the move
 * list looks a ply's score up in. Each entry names the ply it is the
 * evaluation *after*; this walks the resumed game to turn those plies back
 * into the FENs the engine reported them under. A ply the game does not have —
 * a record written for a longer game, or a hand-edited one — is skipped, never
 * thrown on.
 */
export const savedGameEvalsMap = (
  evals: SavedGameEval[] | undefined,
  game: Game,
): Map<string, Score> => {
  const map = new Map<string, Score>();
  if (evals === undefined) return map;

  for (const entry of evals) {
    const fen =
      entry.ply === 0 ? initialFenOf(game) : game.moves[entry.ply - 1]?.fen;
    if (fen !== undefined) {
      map.set(fen, { kind: entry.kind, value: entry.value });
    }
  }
  return map;
};

/** Whether two records' evals would read back identically. */
export const sameSavedGameEvals = (
  a: SavedGameEval[] | undefined,
  b: SavedGameEval[] | undefined,
): boolean => {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;

  return left.every((entry, index) => {
    const other = right[index];
    return (
      entry.ply === other.ply &&
      entry.kind === other.kind &&
      entry.value === other.value
    );
  });
};

/** The moves of a saved game, or `undefined` for a record that will not parse. */
export const savedGameToGame = (saved: SavedGame): Game | undefined => {
  try {
    return parsePgnGame(saved.pgn);
  } catch {
    // A record written by a broken build, or edited by hand in the dev tools.
    // The screen still lists it — and can still delete it — but cannot open it.
    return undefined;
  }
};

/**
 * A live `chess.js` at the end of a saved game — what resuming needs, since the
 * screen plays on by mutating an instance rather than by replaying a `Game`.
 */
export const chessFromSavedGame = (saved: SavedGame): Chess | undefined => {
  const chess = new Chess();
  try {
    chess.loadPgn(saved.pgn);
  } catch {
    return undefined;
  }
  return chess;
};

/** Whether a value parsed out of storage is a saved game. Structural, on purpose. */
export const isSavedGame = (value: unknown): value is SavedGame => {
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

/** One eval entry read back out of storage, or `undefined` for a malformed one. */
const savedGameEvalFrom = (value: unknown): SavedGameEval | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;

  if (
    typeof row.ply !== "number" ||
    !Number.isInteger(row.ply) ||
    row.ply < 0
  ) {
    return undefined;
  }
  if (row.kind !== "cp" && row.kind !== "mate") return undefined;
  if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
    return undefined;
  }

  return { ply: row.ply, kind: row.kind, value: row.value };
};

/**
 * One stored row, normalised — the settings filled in from the defaults for
 * anything the record does not have, so an older or hand-edited entry resumes
 * rather than being dropped.
 *
 * The folder is the one field *added* to the record (CTA-46), and this is why
 * there is no version bump: `folderId` arriving as anything but a usable id —
 * absent, non-string, empty — reads as `null`, Unfiled. Every pre-folder record
 * is already Unfiled, so the normalisation is not a migration, it is the same
 * default the field has always had.
 *
 * The evals (CTA-50) are read the same way, per entry: a malformed one is
 * dropped, never the game. A record with no evals — every pre-CTA-50 one —
 * reads as absent, so the field stays out of the normalised row and an old
 * record round-trips unchanged.
 */
export const savedGameFrom = (value: unknown): SavedGame | undefined => {
  if (!isSavedGame(value)) return undefined;
  // Read the untrusted field off the raw object: the guard above only vouches
  // for the four it actually checks, and a narrowed type would let the rest be
  // taken on trust.
  const row: Record<string, unknown> = { ...value };

  const evals = Array.isArray(row.evals)
    ? row.evals.map(savedGameEvalFrom).filter((entry) => entry !== undefined)
    : [];

  return {
    ...value,
    settings: engineSettingsFrom(value.settings),
    folderId:
      typeof row.folderId === "string" && row.folderId !== ""
        ? row.folderId
        : null,
    // `undefined`, not a conditional spread: the raw `evals` the spread above
    // carried must be neutralised when none of its entries survived.
    evals: evals.length > 0 ? evals : undefined,
  };
};

/** What a row shows about a game without opening it. Pure, so it is testable. */
export type SavedGameSummary = {
  /** How many full moves have been played — half-moves rounded up. */
  moves: number;
  /** The result terminator, or `undefined` while the game is still on. */
  result?: string;
  /** The side the reader was playing. */
  playAs: EngineSettings["playAs"];
  /** `Skill Level` the engine was set to. */
  skillLevel: number;
};

export const savedGameSummary = (
  saved: SavedGame,
  game: Game | undefined,
): SavedGameSummary => {
  const result = game === undefined ? undefined : gameTag(game.headers, "Result");

  return {
    // Half-moves rounded up to full moves, the way the move list numbers them.
    moves: Math.ceil((game?.moves.length ?? 0) / 2),
    ...(result === undefined ? {} : { result }),
    playAs: saved.settings.playAs,
    skillLevel: saved.settings.skillLevel,
  };
};
