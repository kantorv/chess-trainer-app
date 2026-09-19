import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { type Score } from "./engineAnalysis";
import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { gameFromChess, initialFenOf, type Game } from "./gameModel";
import { gameToPgn } from "./gameTree";
import { parsePgnGame } from "./pgn";
import {
  chessFromSavedGame,
  newSavedGameId,
  resultOfFen,
  SAVED_GAMES_PATH,
  sameSavedGameEvals,
  savedGameCatalogOf,
  savedGameEvalsMap,
  savedGameFrom,
  savedGameOf,
  savedGameSummary,
  savedGameToGame,
  type SavedGame,
  type SavedGameEval,
} from "./savedGames";

/** A game built by playing SAN moves, the way the engine screen grows one. */
const playedGame = (moves: readonly string[], startFen?: string): Game => {
  const chess = new Chess(startFen);
  for (const san of moves) chess.move(san);
  return gameFromChess(chess);
};

const scholarsMate = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];

const save = (game: Game, overrides: Partial<SavedGame> = {}): SavedGame => ({
  ...savedGameOf(
    "g1",
    game,
    DEFAULT_ENGINE_SETTINGS,
    new Date("2026-09-07T10:00:00.000Z"),
  ),
  ...overrides,
});

describe("gameToPgn — the linear game's PGN", () => {
  it("round-trips a game through the existing parser", () => {
    const game = playedGame(["e4", "e5", "Nf3", "Nc6"]);

    const reparsed = parsePgnGame(gameToPgn(game));

    expect(reparsed.moves.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
    // Every ply still carries the position it produced, which is the whole
    // contract the move list and the ply navigation read.
    expect(reparsed.moves.map((move) => move.fen)).toEqual(
      game.moves.map((move) => move.fen),
    );
  });

  it("keeps a game that started from a position, and its move numbering", () => {
    // Black to move at move 20 — a game the Board Editor handed over.
    const setUp = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 20";
    const game = playedGame(["Kh8", "Ra8#"], setUp);

    const pgn = gameToPgn(game);
    const reparsed = parsePgnGame(pgn);

    expect(pgn).toContain(`[FEN "${setUp}"]`);
    expect(pgn).toContain("20... Kh8");
    expect(initialFenOf(reparsed)).toBe(setUp);
    expect(reparsed.moves).toHaveLength(2);
  });

  it("writes a moveless game as its result alone", () => {
    expect(gameToPgn(playedGame([]))).toBe("*");
  });
});

describe("resultOfFen", () => {
  it("reads a checkmate from the position, from whichever side gave it", () => {
    const white = playedGame(scholarsMate);
    expect(resultOfFen(white.moves.at(-1)!.fen)).toBe("1-0");

    const black = playedGame(["f3", "e5", "g4", "Qh4#"]);
    expect(resultOfFen(black.moves.at(-1)!.fen)).toBe("0-1");
  });

  it("calls a stalemate a draw and an unfinished game unfinished", () => {
    expect(resultOfFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toBe("1/2-1/2");
    expect(resultOfFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(
      "*",
    );
  });

  it("answers a FEN it cannot read rather than throwing", () => {
    expect(resultOfFen("not a position")).toBe("*");
  });
});

describe("savedGameOf — writing a game down", () => {
  it("stores the moves as PGN, with the settings beside them", () => {
    const saved = save(playedGame(["e4", "e5"]), {});

    expect(saved.settings).toEqual(DEFAULT_ENGINE_SETTINGS);
    expect(savedGameToGame(saved)!.moves.map((move) => move.san)).toEqual([
      "e4",
      "e5",
    ]);
  });

  it("names the players by the side the reader took", () => {
    const asBlack = savedGameOf("g1", playedGame(["e4"]), {
      ...DEFAULT_ENGINE_SETTINGS,
      playAs: "black",
      skillLevel: 3,
    });

    expect(asBlack.pgn).toContain('[White "Stockfish (level 3)"]');
    expect(asBlack.pgn).toContain('[Black "Player"]');
  });

  it("records how the game ended, and leaves an unfinished one open", () => {
    expect(save(playedGame(scholarsMate)).pgn).toContain('[Result "1-0"]');
    // `*` is the PGN placeholder, which `gameTag` already reports as absent —
    // so nothing renders it as a result.
    expect(save(playedGame(["e4"])).pgn).toContain('[Result "*"]');
  });

  it("keeps the date the game was first written down", () => {
    const saved = savedGameOf(
      "g1",
      playedGame(["e4", "e5"]),
      DEFAULT_ENGINE_SETTINGS,
      new Date("2026-09-07T10:00:00.000Z"),
      "2026-09-01T08:00:00.000Z",
    );

    expect(saved.savedAt).toBe("2026-09-01T08:00:00.000Z");
    expect(saved.updatedAt).toBe("2026-09-07T10:00:00.000Z");
  });

  it("writes a game as Unfiled — the folder rides beside it, not in it", () => {
    expect(save(playedGame(["e4"])).folderId).toBeNull();
  });
});

describe("the evals a record carries (CTA-50)", () => {
  const game = playedGame(["e4", "e5"]);

  it("leaves the evals out of a record nothing was evaluated in", () => {
    expect(save(playedGame(["e4"])).evals).toBeUndefined();
  });

  it("writes the scores beside the PGN as a per-ply list, ply 0 included", () => {
    const saved = savedGameOf(
      "g1",
      game,
      DEFAULT_ENGINE_SETTINGS,
      undefined,
      undefined,
      undefined,
      new Map<string, Score>([
        [initialFenOf(game), { kind: "cp", value: 20 }],
        [game.moves[0].fen, { kind: "cp", value: 30 }],
      ]),
    );

    // Ply 0 is the starting position; ply 1 the position after 1. e4.
    expect(saved.evals).toEqual([
      { ply: 0, kind: "cp", value: 20 },
      { ply: 1, kind: "cp", value: 30 },
    ]);
  });

  it("keeps scores learned for positions this game does not reach out of the record", () => {
    const saved = savedGameOf(
      "g1",
      playedGame(["e4"]),
      DEFAULT_ENGINE_SETTINGS,
      undefined,
      undefined,
      undefined,
      new Map<string, Score>([["8/8/8/8/8/8/8/8 w - - 0 1", { kind: "cp", value: 0 }]]),
    );

    expect(saved.evals).toBeUndefined();
  });

  it("reads the evals back into the FEN-keyed map the move list looks up", () => {
    const saved = savedGameOf(
      "g1",
      game,
      DEFAULT_ENGINE_SETTINGS,
      undefined,
      undefined,
      undefined,
      new Map<string, Score>([[game.moves[1].fen, { kind: "mate", value: -3 }]]),
    );

    const map = savedGameEvalsMap(saved.evals, game);

    expect(map.get(game.moves[1].fen)).toEqual({ kind: "mate", value: -3 });
    expect(map.size).toBe(1);
  });

  it("skips an eval for a ply the game does not have", () => {
    const map = savedGameEvalsMap(
      [{ ply: 9, kind: "cp", value: 30 }],
      playedGame(["e4"]),
    );

    expect(map.size).toBe(0);
  });

  it("treats two records with the same evals as identical, and different evals as not", () => {
    const withEval: SavedGameEval[] = [{ ply: 1, kind: "cp", value: 30 }];

    expect(
      sameSavedGameEvals(withEval, [{ ply: 1, kind: "cp", value: 30 }]),
    ).toBe(true);
    // Absent and empty are the same answer.
    expect(sameSavedGameEvals(undefined, [])).toBe(true);
    expect(sameSavedGameEvals(withEval, undefined)).toBe(false);
    expect(sameSavedGameEvals(withEval, [{ ply: 1, kind: "cp", value: 31 }])).toBe(
      false,
    );
    expect(
      sameSavedGameEvals(withEval, [{ ply: 1, kind: "mate", value: 3 }]),
    ).toBe(false);
    expect(sameSavedGameEvals(withEval, [{ ply: 2, kind: "cp", value: 30 }])).toBe(
      false,
    );
  });
});

describe("savedGameFrom — the evals a stored row carries", () => {
  it("reads a record stored before evals with the field absent — no version bump", () => {
    const row = savedGameFrom({
      id: "g1",
      pgn: "1. e4 *",
      savedAt: "x",
      updatedAt: "x",
    });

    expect(row?.evals).toBeUndefined();
  });

  it("keeps the evals it does have", () => {
    const row = savedGameFrom({
      id: "g1",
      pgn: "1. e4 *",
      savedAt: "x",
      updatedAt: "x",
      evals: [{ ply: 1, kind: "cp", value: 30 }],
    });

    expect(row?.evals).toEqual([{ ply: 1, kind: "cp", value: 30 }]);
  });

  it("drops a malformed eval entry, never the game", () => {
    const row = savedGameFrom({
      id: "g1",
      pgn: "1. e4 *",
      savedAt: "x",
      updatedAt: "x",
      evals: [
        { ply: "one" },
        { ply: 1, kind: "cp", value: 30 },
        "nonsense",
        { ply: -1, kind: "cp", value: 1 },
      ],
    });

    expect(row?.evals).toEqual([{ ply: 1, kind: "cp", value: 30 }]);
  });
});

describe("chessFromSavedGame — resuming", () => {
  it("hands back a live game at the position it was left at", () => {
    const saved = save(playedGame(["e4", "e5", "Nf3"]));

    const chess = chessFromSavedGame(saved)!;

    expect(chess.history()).toEqual(["e4", "e5", "Nf3"]);
    expect(chess.turn()).toBe("b");
    // And it plays on from there, which is the whole point.
    expect(() => chess.move("Nc6")).not.toThrow();
  });

  it("resumes a game that started from a handed-over position", () => {
    const setUp = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 20";
    const chess = chessFromSavedGame(save(playedGame(["Kh8"], setUp)))!;

    expect(chess.history()).toEqual(["Kh8"]);
    expect(chess.fen()).toContain("7k");
  });

  it("reports a record it cannot read rather than throwing", () => {
    expect(chessFromSavedGame(save(playedGame(["e4"]), { pgn: "1. Zz9" }))).toBe(
      undefined,
    );
  });
});

describe("savedGameFrom — reading a stored row back", () => {
  it("fills the settings in for a record that has none", () => {
    const row = savedGameFrom({
      id: "g1",
      pgn: "1. e4 *",
      savedAt: "2026-09-07T10:00:00.000Z",
      updatedAt: "2026-09-07T10:00:00.000Z",
    });

    expect(row?.settings).toEqual(DEFAULT_ENGINE_SETTINGS);
  });

  it("keeps the settings it does have, and repairs the ones it got wrong", () => {
    const row = savedGameFrom({
      id: "g1",
      pgn: "1. e4 *",
      savedAt: "x",
      updatedAt: "x",
      settings: { skillLevel: 3, playAs: "black", depth: "deep" },
    });

    expect(row?.settings.skillLevel).toBe(3);
    expect(row?.settings.playAs).toBe("black");
    expect(row?.settings.depth).toBe(DEFAULT_ENGINE_SETTINGS.depth);
  });

  it("rejects anything that is not a saved game", () => {
    for (const value of [null, 7, "g1", {}, { id: "g1" }, { id: "", pgn: "x" }]) {
      expect(savedGameFrom(value)).toBe(undefined);
    }
  });

  it("reads a record stored before folders as Unfiled — no version bump", () => {
    const row = savedGameFrom({
      id: "g1",
      pgn: "1. e4 *",
      savedAt: "x",
      updatedAt: "x",
    });

    expect(row?.folderId).toBeNull();
  });

  it("reads an unreadable folderId as Unfiled too", () => {
    const row = savedGameFrom({
      id: "g1",
      pgn: "1. e4 *",
      savedAt: "x",
      updatedAt: "x",
      folderId: 7,
    });

    expect(row?.folderId).toBeNull();
  });
});

describe("savedGameSummary", () => {
  it("says how long the game is, how it stands and how it was played", () => {
    const saved = savedGameOf("g1", playedGame(scholarsMate), {
      ...DEFAULT_ENGINE_SETTINGS,
      skillLevel: 7,
      playAs: "black",
    });

    expect(savedGameSummary(saved, savedGameToGame(saved))).toEqual({
      // The scholars' mate is seven half-moves, numbered as four full moves.
      moves: 4,
      result: "1-0",
      playAs: "black",
      skillLevel: 7,
    });
  });

  it("reports no result for a game still being played", () => {
    const saved = save(playedGame(["e4", "e5"]));

    expect(savedGameSummary(saved, savedGameToGame(saved)).result).toBe(undefined);
  });

  it("survives a record whose game could not be parsed", () => {
    const saved = save(playedGame(["e4"]), { pgn: "1. Zz9" });

    expect(savedGameSummary(saved, undefined).moves).toBe(0);
  });
});

describe("savedGameCatalogOf — the games as a catalog", () => {
  it("puts every readable game in one category, in the order given", () => {
    const games = [
      save(playedGame(["e4", "e5"]), { id: "g1" }),
      save(playedGame(["d4"]), { id: "g2" }),
    ];

    const catalog = savedGameCatalogOf(games);

    expect(catalog.categories.map((category) => category.path)).toEqual([
      SAVED_GAMES_PATH,
    ]);
    expect(catalog.items.map((item) => item.id)).toEqual(["g1", "g2"]);
    expect(catalog.items.every((item) => item.kind === "game")).toBe(true);
    // Positions is a projection of items, and a library of games has none.
    expect(catalog.positions).toEqual([]);
  });

  it("carries the parsed game, so a destination replays it without re-reading", () => {
    const catalog = savedGameCatalogOf([save(playedGame(["e4", "e5", "Nf3"]))]);
    const [item] = catalog.items;

    expect(item.kind).toBe("game");
    if (item.kind !== "game") return;
    expect(item.game.moves.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
  });

  it("leaves out a record it cannot parse rather than throwing", () => {
    const catalog = savedGameCatalogOf([
      save(playedGame(["e4"]), { id: "good" }),
      save(playedGame(["e4"]), { id: "bad", pgn: "1. Zz9" }),
    ]);

    expect(catalog.items.map((item) => item.id)).toEqual(["good"]);
  });
});

describe("newSavedGameId", () => {
  it("is URL-safe, so it can travel in ?saved= and ?game=", () => {
    expect(newSavedGameId()).toMatch(/^g[0-9a-z]+$/);
  });

  it("does not collide for two games started in the same millisecond", () => {
    const now = new Date("2026-09-07T10:00:00.000Z");

    expect(newSavedGameId(now, 0.1)).not.toBe(newSavedGameId(now, 0.9));
  });
});
