import { Chess } from "chess.js";

import { engineSettingsFrom, type EngineSettings } from "./engineSettings";
import { finalFenOf, gameTag, type Game, type GameHeaders } from "./gameModel";
import { gameToPgn } from "./gameTree";
import {
  libraryCatalogOf,
  type LibraryCatalog,
  type LibraryCategory,
  type LibraryGame,
} from "./libraryCatalog";
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
 * `views/engine/saved/useSavedGames.ts` — the same three-way split
 * `pgnUploads.ts` / `pgnUploadStore.ts` / `views/pgn/useUploads.ts` already
 * uses, and for the same reason.
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
 *
 * ## It is also a tiny library, so `?game=` works
 *
 * Handing a saved game to the Analysis Board or to Load PGN is the hand-off
 * those two screens already have: `?game=<reference>` (`lib/gameReference.ts`),
 * which resolves a *reference into a catalog*. So {@link savedGameCatalogOf}
 * presents the saved games as one — a single category holding a `LibraryGame`
 * each — and the hand-off costs one registry entry rather than a second
 * transport. Nothing browses that catalog: the Saved games screen is its own,
 * under the Engine folder, because these are the reader's games rather than a
 * shipped library.
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
};

/** The category path the saved games sit under, and their reference segment. */
export const SAVED_GAMES_PATH = "saved";

/** The Saved games folder's name is chrome the app ships, so it is a locale key. */
export const SAVED_GAMES_LABEL_KEY = "savedGames.title";

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
 * tag is language-independent notation: it travels to Load PGN's Info tab, to
 * an export and to any other reader of the file, none of which know what
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
 * Write a game down: its moves as PGN, plus the settings to resume it under.
 *
 * `savedAt` is carried in rather than derived so that adding a move to a game
 * saved yesterday keeps yesterday's date — the record is updated, not replaced,
 * which is what makes the id stable across a whole game. `folderId` is `null`
 * by default because the autosave effect — the one caller — cannot know where
 * the reader filed the game; the *store* carries the stored folder forward
 * (`saveGame`), so a record this writes never strips an assignment.
 */
export const savedGameOf = (
  id: string,
  game: Game,
  settings: EngineSettings,
  now: Date = new Date(),
  savedAt: string = now.toISOString(),
  folderId: string | null = null,
): SavedGame => {
  const result = resultOfFen(finalFenOf(game));

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
  };
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
 */
export const savedGameFrom = (value: unknown): SavedGame | undefined => {
  if (!isSavedGame(value)) return undefined;
  // Read the untrusted field off the raw object: the guard above only vouches
  // for the four it actually checks, and a narrowed type would let the rest be
  // taken on trust.
  const row: Record<string, unknown> = { ...value };

  return {
    ...value,
    settings: engineSettingsFrom(value.settings),
    folderId:
      typeof row.folderId === "string" && row.folderId !== ""
        ? row.folderId
        : null,
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

/**
 * The saved games as a **library catalog** — one category, one `LibraryGame` per
 * record that parses, in the order they were given.
 *
 * It exists for one reason: `?game=` resolves a reference against a catalog
 * (`lib/gameReference.ts`), so presenting the saved games as one is what lets
 * "open this in the Analysis Board" be the hand-off those screens already have
 * rather than a second transport. A record that will not parse is simply absent
 * from it — the Saved games screen reads the *store*, not this, so such a row is
 * still listed and still removable.
 */
export const savedGameCatalogOf = (
  games: readonly SavedGame[],
): LibraryCatalog => {
  const category: LibraryCategory = {
    id: SAVED_GAMES_PATH,
    path: SAVED_GAMES_PATH,
    labelKey: SAVED_GAMES_LABEL_KEY,
    children: [],
  };

  const items: LibraryGame[] = [];
  for (const saved of games) {
    const game = savedGameToGame(saved);
    if (game === undefined) continue;

    items.push({
      kind: "game",
      id: saved.id,
      category: SAVED_GAMES_PATH,
      // English, and never rendered by this app: the Saved games screen writes
      // its own translated rows. It is here because a `LibraryItem` carries a
      // name, and a PGN's players are the honest answer to what this game is.
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
