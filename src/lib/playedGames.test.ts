import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { resolveGameReference } from "./gameReference";
import { parsePgnGame, parsePgnTree } from "./pgn";
import {
  findPlayedGame,
  MAX_PLAYED_GAMES,
  PLAYED_GAMES_STORAGE_KEY,
  playedGamesSnapshot,
  removePlayedGame,
  savePlayedGame,
} from "./playedGameStore";
import {
  playedGameFen,
  playedGameFrom,
  playedGameFromSavedGame,
  playedGameOf,
  playedGameSummary,
  playedGameToTree,
} from "./playedGames";
import { savedGameOf } from "./savedGames";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const at = (iso: string) => new Date(iso);

/** A record of `pgn` standing at `path`, written at `when`. */
const record = (id: string, pgn: string, path: string[] = [], when = "2026-01-01T10:00:00Z") =>
  // The session carries the day the game began; only `now` moves on.
  playedGameOf(
    id,
    parsePgnTree(pgn),
    path,
    DEFAULT_ENGINE_SETTINGS,
    undefined,
    at(when),
    "2026-01-01T10:00:00.000Z",
  );

beforeEach(() => localStorage.clear());

describe("a played game, written down and read back", () => {
  it("keeps the side lines, the place in the tree and the settings", () => {
    const game = playedGameOf(
      "p1",
      parsePgnTree("1. e4 (1. d4 d5) 1... e5 *"),
      ["e4"],
      { ...DEFAULT_ENGINE_SETTINGS, playAs: "black", skillLevel: 4 },
    );
    expect(game.pgn).toContain("(1. d4 d5)");
    expect(game.pgn).toContain('[White "Stockfish (level 4)"]');
    expect(game.pgn).toContain('[Black "Player"]');
    const tree = playedGameToTree(game)!;
    expect(playedGameFen(game, tree)).toBe(AFTER_E4);
  });

  it("writes the result of the mainline", () => {
    const mate = record("m", "1. f3 e5 2. g4 Qh4# 0-1");
    expect(mate.pgn).toContain('[Result "0-1"]');
    expect(playedGameSummary(mate, playedGameToTree(mate)).result).toBe("0-1");
  });

  it("keeps an eval per position the tree reaches, and none it does not", () => {
    const evals = new Map([
      [AFTER_E4, { kind: "cp" as const, value: 30 }],
      ["8/8/8/8/8/8/8/K6k w - - 0 1", { kind: "cp" as const, value: 0 }],
    ]);
    const game = playedGameOf("e", parsePgnTree("1. e4 *"), [], DEFAULT_ENGINE_SETTINGS, evals);
    expect(game.evals).toEqual([{ fen: AFTER_E4, kind: "cp", value: 30 }]);
  });

  it("reads a stored row field by field, and refuses one with no PGN", () => {
    const back = playedGameFrom({
      id: "x",
      pgn: "1. e4 *",
      savedAt: "a",
      updatedAt: "b",
      path: ["e4", 3],
      evals: [{ fen: AFTER_E4, kind: "cp", value: 1 }, { fen: "", kind: "cp", value: 2 }],
    });
    expect(back?.path).toEqual(["e4"]);
    expect(back?.settings).toEqual(DEFAULT_ENGINE_SETTINGS);
    expect(back?.evals).toHaveLength(1);
    expect(playedGameFrom({ id: "x", savedAt: "a", updatedAt: "b" })).toBeUndefined();
  });

  it("summarises the mainline's length and the side lines", () => {
    const game = record("s", "1. e4 (1. d4) 1... e5 (1... c5) 2. Nf3 *");
    expect(playedGameSummary(game, playedGameToTree(game))).toMatchObject({
      moves: 2,
      variations: 2,
      playAs: "white",
    });
    expect(playedGameSummary(game, playedGameToTree(game)).result).toBeUndefined();
  });

  it("reads a game of the old store under a new id, at its end", () => {
    const old = savedGameOf("old", parsePgnGame("1. e4 e5 *"), DEFAULT_ENGINE_SETTINGS);
    const game = playedGameFromSavedGame(old, "new")!;
    expect(game.id).toBe("new");
    expect(game.path).toEqual(["e4", "e5"]);
    expect(game.savedAt).toBe(old.savedAt);
  });
});

describe("the played games' store", () => {
  it("keeps its own key", () => {
    savePlayedGame(record("a", "1. e4 *"));
    expect(localStorage.getItem(PLAYED_GAMES_STORAGE_KEY)).toContain('"id":"a"');
    expect(localStorage.getItem("chessapp.savedGames.v1")).toBeNull();
  });

  it("puts a new game and a game with a new move at the top", () => {
    savePlayedGame(record("a", "1. e4 *"));
    savePlayedGame(record("b", "1. d4 *"));
    expect(playedGamesSnapshot().map((game) => game.id)).toEqual(["b", "a"]);
    savePlayedGame(record("a", "1. e4 e5 *", [], "2026-01-02T10:00:00Z"));
    expect(playedGamesSnapshot().map((game) => game.id)).toEqual(["a", "b"]);
    // The day it began is the stored one.
    expect(findPlayedGame("a")?.savedAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("writes a new place in the tree in place, keeping the order and the date last played", () => {
    savePlayedGame(record("a", "1. e4 e5 *", ["e4", "e5"]));
    savePlayedGame(record("b", "1. d4 *"));
    savePlayedGame(record("a", "1. e4 e5 *", ["e4"], "2026-03-01T10:00:00Z"));
    expect(playedGamesSnapshot().map((game) => game.id)).toEqual(["b", "a"]);
    expect(findPlayedGame("a")?.path).toEqual(["e4"]);
    expect(findPlayedGame("a")?.updatedAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("does nothing for a record identical to the stored one", () => {
    savePlayedGame(record("a", "1. e4 *"));
    const before = localStorage.getItem(`${PLAYED_GAMES_STORAGE_KEY}.rev`);
    savePlayedGame(record("a", "1. e4 *", [], "2026-05-05T10:00:00Z"));
    expect(localStorage.getItem(`${PLAYED_GAMES_STORAGE_KEY}.rev`)).toBe(before);
  });

  it("drops the oldest past the cap", () => {
    for (let index = 0; index <= MAX_PLAYED_GAMES; index += 1) {
      savePlayedGame(record(`g${index}`, "1. e4 *"));
    }
    expect(playedGamesSnapshot()).toHaveLength(MAX_PLAYED_GAMES);
    expect(findPlayedGame("g0")).toBeUndefined();
  });

  it("forgets one", () => {
    savePlayedGame(record("a", "1. e4 *"));
    removePlayedGame("a");
    expect(playedGamesSnapshot()).toHaveLength(0);
  });

  it("hands a game on with ?game=play/games/<id>", () => {
    savePlayedGame(record("a", "1. e4 (1. d4) 1... e5 *"));
    const item = resolveGameReference("play/games/a");
    expect(item?.id).toBe("a");
    expect(item?.pgn).toContain("(1. d4)");
    expect(resolveGameReference("play/games/missing")).toBeUndefined();
  });
});
