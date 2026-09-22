import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { isReferenceRead, loadReferencedGames, resolveGameReference } from "./gameReference";
import { parsePgnTree } from "./pgn";
import {
  findPlayedGame,
  loadPlayedGames,
  MAX_PLAYED_GAMES,
  PLAYED_GAMES_STORAGE_KEY,
  playedGamesSnapshot,
  removePlayedGame,
  resetPlayedGameStore,
  savePlayedGame,
} from "./playedGameStore";
import { MASK_PRESETS, withMaskEntry } from "./pieceMask";
import {
  playedGameFen,
  playedGameFrom,
  playedGameHeaders,
  resultOfFen,
  playedGameOf,
  playedGameSummary,
  playedGameToTree,
} from "./playedGames";

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

  it("writes a resignation as the result, the side that resigned losing", () => {
    const game = playedGameOf(
      "r",
      parsePgnTree("1. e4 e5 *"),
      [],
      DEFAULT_ENGINE_SETTINGS,
      undefined,
      new Date(),
      undefined,
      "white",
    );
    expect(game.pgn).toContain('[Result "0-1"]');
    expect(game.pgn).toContain('[Termination "White resigns"]');
    expect(game.pgn.trim().endsWith("0-1")).toBe(true);
    expect(game.resigned).toBe("white");
    expect(playedGameFrom(JSON.parse(JSON.stringify(game)))?.resigned).toBe("white");
    expect(playedGameSummary(game, playedGameToTree(game)).result).toBe("0-1");
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
    expect(playedGameSummary(game, playedGameToTree(game)).result).toBe("*");
  });
});

describe("the played games' store", () => {
  const ids = () => playedGamesSnapshot()?.map((game) => game.id);

  it("keeps its own database, and nothing in localStorage", async () => {
    await savePlayedGame(record("a", "1. e4 *"));
    expect(localStorage.length).toBe(0);
    // Forget what was read: a second read comes from IndexedDB itself.
    resetPlayedGameStore();
    expect(playedGamesSnapshot()).toBeUndefined();
    expect((await loadPlayedGames()).map((game) => game.id)).toEqual(["a"]);
  });

  it("moves the games out of the old localStorage key on the first read", async () => {
    localStorage.setItem(
      PLAYED_GAMES_STORAGE_KEY,
      JSON.stringify([record("b", "1. d4 *"), record("a", "1. e4 *")]),
    );
    expect((await loadPlayedGames()).map((game) => game.id)).toEqual(["b", "a"]);
    expect(localStorage.getItem(PLAYED_GAMES_STORAGE_KEY)).toBeNull();
    resetPlayedGameStore();
    expect((await loadPlayedGames()).map((game) => game.id)).toEqual(["b", "a"]);
  });

  it("puts a new game and a game with a new move at the top", async () => {
    await savePlayedGame(record("a", "1. e4 *"));
    await savePlayedGame(record("b", "1. d4 *"));
    expect(ids()).toEqual(["b", "a"]);
    await savePlayedGame(record("a", "1. e4 e5 *", [], "2026-01-02T10:00:00Z"));
    expect(ids()).toEqual(["a", "b"]);
    // The day it began is the stored one.
    expect(findPlayedGame("a")?.savedAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("writes a new place in the tree in place, keeping the order and the date last played", async () => {
    await savePlayedGame(record("a", "1. e4 e5 *", ["e4", "e5"]));
    await savePlayedGame(record("b", "1. d4 *"));
    await savePlayedGame(record("a", "1. e4 e5 *", ["e4"], "2026-03-01T10:00:00Z"));
    expect(ids()).toEqual(["b", "a"]);
    expect(findPlayedGame("a")?.path).toEqual(["e4"]);
    expect(findPlayedGame("a")?.updatedAt).toBe("2026-01-01T10:00:00.000Z");
    // …and so it reads back after a reload.
    resetPlayedGameStore();
    expect((await loadPlayedGames()).map((game) => game.id)).toEqual(["b", "a"]);
  });

  it("does nothing for a record identical to the stored one", async () => {
    await savePlayedGame(record("a", "1. e4 *"));
    const before = playedGamesSnapshot();
    await savePlayedGame(record("a", "1. e4 *", [], "2026-05-05T10:00:00Z"));
    expect(playedGamesSnapshot()).toBe(before);
  });

  it("keeps a burst of autosaves one record, each seeing the one before", async () => {
    await Promise.all([
      savePlayedGame(record("a", "1. e4 *")),
      savePlayedGame(record("a", "1. e4 e5 *", ["e4", "e5"])),
      savePlayedGame(record("a", "1. e4 e5 *", ["e4"])),
    ]);
    expect(ids()).toEqual(["a"]);
    expect(findPlayedGame("a")?.path).toEqual(["e4"]);
  });

  it("drops the oldest past the cap", async () => {
    for (let index = 0; index <= MAX_PLAYED_GAMES; index += 1) {
      await savePlayedGame(record(`g${index}`, "1. e4 *"));
    }
    expect(playedGamesSnapshot()).toHaveLength(MAX_PLAYED_GAMES);
    expect(findPlayedGame("g0")).toBeUndefined();
  });

  it("forgets one", async () => {
    await savePlayedGame(record("a", "1. e4 *"));
    await removePlayedGame("a");
    expect(playedGamesSnapshot()).toHaveLength(0);
  });

  it("hands a game on with ?game=play/games/<id>, once the store is read", async () => {
    await savePlayedGame(record("a", "1. e4 (1. d4) 1... e5 *"));
    resetPlayedGameStore();
    expect(isReferenceRead("play/games/a")).toBe(false);
    await loadReferencedGames("play/games/a");
    expect(isReferenceRead("play/games/a")).toBe(true);
    const item = resolveGameReference("play/games/a");
    expect(item?.id).toBe("a");
    expect(item?.pgn).toContain("(1. d4)");
    expect(resolveGameReference("play/games/missing")).toBeUndefined();
  });
});

/** The FEN after playing SAN moves from the start. */
const fenAfter = (moves: readonly string[]): string => {
  const chess = new Chess();
  for (const san of moves) chess.move(san);
  return chess.fen();
};

describe("resultOfFen", () => {
  it("reads a checkmate from the position, from whichever side gave it", () => {
    expect(resultOfFen(fenAfter(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]))).toBe("1-0");
    expect(resultOfFen(fenAfter(["f3", "e5", "g4", "Qh4#"]))).toBe("0-1");
  });

  it("calls a stalemate a draw and an unfinished game unfinished", () => {
    expect(resultOfFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toBe("1/2-1/2");
    expect(resultOfFen(fenAfter([]))).toBe("*");
  });

  it("answers a FEN it cannot read rather than throwing", () => {
    expect(resultOfFen("not a position")).toBe("*");
  });
});

describe("playedGameHeaders", () => {
  it("names the reader and the engine by side, and dates the game", () => {
    const headers = playedGameHeaders(
      { ...DEFAULT_ENGINE_SETTINGS, playAs: "black", skillLevel: 7 },
      "*",
      new Date(2026, 8, 7),
    );
    expect(headers.White).toBe("Stockfish (level 7)");
    expect(headers.Black).toBe("Player");
    expect(headers.Date).toBe("2026.09.07");
    expect(headers.Event).toBe("Play with Engine");
  });
});

describe("a masked game's costume (CTA-79)", () => {
  const COSTUME = { pieces: MASK_PRESETS.nonPawns, notation: false };

  const masked = (id: string, mask = COSTUME) =>
    playedGameOf(
      id,
      parsePgnTree("1. e4 *"),
      [],
      DEFAULT_ENGINE_SETTINGS,
      undefined,
      at("2026-01-01T10:00:00Z"),
      undefined,
      undefined,
      mask,
    );

  it("rides on the record and reads back", () => {
    const saved = masked("m");
    expect(saved.mask).toEqual(COSTUME);
    expect(playedGameFrom(JSON.parse(JSON.stringify(saved)))?.mask).toEqual(COSTUME);
    expect(playedGameSummary(saved, playedGameToTree(saved)).masked).toBe(true);
  });

  it("is absent on an unmasked game, and a record from before reads as one", () => {
    const plain = record("p", "1. e4 *");
    expect(plain.mask).toBeUndefined();
    expect(playedGameFrom(plain)?.mask).toBeUndefined();
    expect(playedGameSummary(plain, playedGameToTree(plain)).masked).toBe(false);
  });

  it("reads an unreadable costume as unmasked, never throwing", () => {
    const saved = masked("m");
    for (const broken of [
      "nonPawns",
      { pieces: { ...MASK_PRESETS.nonPawns, wQ: "bP" } },
      { pieces: { wK: "wK" } },
      { notation: false },
    ]) {
      expect(playedGameFrom({ ...saved, mask: broken })?.mask).toBeUndefined();
    }
    // The notation defaults to on.
    expect(playedGameFrom({ ...saved, mask: { pieces: MASK_PRESETS.allIdentical } })?.mask)
      .toEqual({ pieces: MASK_PRESETS.allIdentical, notation: true });
  });

  it("is written in place when only the costume changes", async () => {
    await savePlayedGame(masked("a"));
    await savePlayedGame(record("b", "1. d4 *"));
    const changed = { pieces: withMaskEntry(MASK_PRESETS.nonPawns, "wQ", "wQ"), notation: true };
    await savePlayedGame(masked("a", changed));
    expect(playedGamesSnapshot()?.map((game) => game.id)).toEqual(["b", "a"]);
    expect(findPlayedGame("a")?.mask).toEqual(changed);
  });
});
