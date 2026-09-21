import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { DEFAULT_ANALYSIS_SETTINGS } from "../../../lib/analysisSettings";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { gameFromChess } from "../../../lib/gameModel";
import { emptyTree, addMove } from "../../../lib/gameTree";
import { savedAnalysisOf } from "../../../lib/savedAnalyses";
import { savedGameOf } from "../../../lib/savedGames";
import { savedOpeningOf } from "../../../lib/savedOpenings";
import {
  saveAnalysis,
  savedAnalysesSnapshot,
  SAVED_ANALYSES_STORAGE_KEY,
} from "../../../lib/savedAnalysisStore";
import {
  saveGame,
  savedGamesSnapshot,
  SAVED_GAMES_STORAGE_KEY,
} from "../../../lib/savedGameStore";
import {
  saveOpening,
  savedOpeningsSnapshot,
  SAVED_OPENINGS_STORAGE_KEY,
} from "../../../lib/savedOpeningStore";
import {
  clearDevStores,
  devSavedGamesSnapshot,
  devSavedOpeningsSnapshot,
  findDevSavedGame,
  saveDevGame,
  saveDevOpening,
  DEV_SAVED_GAMES_STORAGE_KEY,
  DEV_SAVED_OPENINGS_STORAGE_KEY,
  DEV_STORAGE_KEYS,
} from "./devStores";

/*
  The Development section's whole persistence promise (CTA-60, acceptance
  criterion 7): a dev board writes to dev-prefixed keys through the *shipped*
  record-store factory and normalisers, so autosave and resume are genuinely
  exercised while a v2 bug can never damage a real saved game, analysis or
  opening.

  Which means the assertion that matters is an assertion about **isolation**,
  in both directions, and it is worth making explicitly rather than trusting
  two string constants to stay different.
*/

/** A short real game, so the records under test are records the app could write. */
const playedGame = () => {
  const chess = new Chess();
  chess.move("e4");
  chess.move("e5");
  return gameFromChess(chess);
};

const aTree = () => {
  const added = addMove(emptyTree(), null, {
    san: "e4",
    from: "e2",
    to: "e4",
    fen: new Chess().move("e4").after,
  });
  return added.tree;
};

beforeEach(() => {
  localStorage.clear();
});

describe("the dev record stores", () => {
  it("use dev-prefixed keys, distinct from every shipped one", () => {
    for (const key of DEV_STORAGE_KEYS) {
      expect(key.startsWith("chessapp.dev.")).toBe(true);
    }

    const shipped = [
      SAVED_GAMES_STORAGE_KEY,
      SAVED_ANALYSES_STORAGE_KEY,
      SAVED_OPENINGS_STORAGE_KEY,
    ];
    for (const key of shipped) {
      expect(DEV_STORAGE_KEYS).not.toContain(key);
    }
    // And the pairing is deliberate, not accidentally overlapping.
    expect(DEV_SAVED_GAMES_STORAGE_KEY).not.toBe(SAVED_GAMES_STORAGE_KEY);
    expect(DEV_SAVED_OPENINGS_STORAGE_KEY).not.toBe(SAVED_OPENINGS_STORAGE_KEY);
  });

  it("writes a dev record where no shipped screen can see it", () => {
    saveDevGame(savedGameOf("dev-game", playedGame(), DEFAULT_ENGINE_SETTINGS));
    saveDevOpening(
      savedOpeningOf("dev-opening", aTree(), "white", "King's Pawn", null),
    );

    // The dev side has both.
    expect(devSavedGamesSnapshot()).toHaveLength(1);
    expect(devSavedOpeningsSnapshot()).toHaveLength(1);

    // The shipped side has none of them — this is the whole point.
    expect(savedGamesSnapshot()).toEqual([]);
    expect(savedAnalysesSnapshot()).toEqual([]);
    expect(savedOpeningsSnapshot()).toEqual([]);
  });

  it("leaves the shipped records untouched when the dev keys are wiped", () => {
    // A reader's real work, written by the shipped stores.
    saveGame(savedGameOf("real-game", playedGame(), DEFAULT_ENGINE_SETTINGS));
    saveAnalysis(
      savedAnalysisOf(
        "real-analysis",
        aTree(),
        ["e4"],
        DEFAULT_ANALYSIS_SETTINGS,
        "white",
      ),
    );
    saveOpening(
      savedOpeningOf("real-opening", aTree(), "white", "Mine", null),
    );

    // And a dev board's, beside it.
    saveDevGame(savedGameOf("dev-game", playedGame(), DEFAULT_ENGINE_SETTINGS));

    clearDevStores();

    expect(devSavedGamesSnapshot()).toEqual([]);
    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["real-game"]);
    expect(savedAnalysesSnapshot().map((row) => row.id)).toEqual([
      "real-analysis",
    ]);
    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual([
      "real-opening",
    ]);
  });

  it("does not read a shipped record back as a dev one", () => {
    saveGame(savedGameOf("real-game", playedGame(), DEFAULT_ENGINE_SETTINGS));

    expect(devSavedGamesSnapshot()).toEqual([]);
    expect(findDevSavedGame("real-game")).toBeUndefined();
  });

  it("is idempotent, so an autosave effect does not re-order the list", () => {
    // The rule the shipped stores keep, reused rather than restated — and the
    // reason a board can write on every move without churning a list.
    const record = savedGameOf(
      "dev-game",
      playedGame(),
      DEFAULT_ENGINE_SETTINGS,
    );
    saveDevGame(record);
    const first = devSavedGamesSnapshot();

    saveDevGame({ ...record, updatedAt: "2030-01-01T00:00:00.000Z" });

    // The same array by reference: nothing was written, so no revision moved.
    expect(devSavedGamesSnapshot()).toBe(first);
  });

  it("replaces a dev record in place, so one game is one row", () => {
    const chess = new Chess();
    chess.move("e4");
    saveDevGame(
      savedGameOf("dev-game", gameFromChess(chess), DEFAULT_ENGINE_SETTINGS),
    );
    chess.move("e5");
    saveDevGame(
      savedGameOf("dev-game", gameFromChess(chess), DEFAULT_ENGINE_SETTINGS),
    );

    expect(devSavedGamesSnapshot()).toHaveLength(1);
    expect(findDevSavedGame("dev-game")?.pgn).toContain("e5");
  });
});
