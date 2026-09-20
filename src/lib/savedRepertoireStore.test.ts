import { describe, expect, it, vi } from "vitest";

import { emptyTree } from "./gameTree";
import { savedAnalysisOf } from "./savedAnalyses";
import { saveAnalysis, savedAnalysesSnapshot } from "./savedAnalysisStore";
import { saveGame, savedGamesSnapshot } from "./savedGameStore";
import { savedGameOf } from "./savedGames";
import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { DEFAULT_ANALYSIS_SETTINGS } from "./analysisSettings";
import { treeFromGame } from "./gameTree";
import { savedOpeningOf } from "./savedOpenings";
import { saveOpening, savedOpeningsSnapshot } from "./savedOpeningStore";
import {
  readRepertoireText,
  savedRepertoireOf,
  type SavedRepertoire,
} from "./savedRepertoires";
import {
  clearSavedRepertoires,
  findSavedRepertoire,
  MAX_SAVED_REPERTOIRES,
  removeSavedRepertoire,
  removeSavedRepertoires,
  SAVED_REPERTOIRES_STORAGE_KEY,
  saveRepertoire,
  savedRepertoiresSnapshot,
  subscribeSavedRepertoires,
  addRepertoires,
  updateRepertoireSettings,
} from "./savedRepertoireStore";
import { parsePgnGame } from "./pgn";

/* `src/test/setup.ts` clears `localStorage` between tests, cache included. */

const record = (id: string, name = "", pgn = "1. e4 e5 *"): SavedRepertoire => {
  const reading = readRepertoireText(pgn);
  if (!reading.ok) throw new Error("fixture did not read");
  return savedRepertoireOf(id, reading.games[0], name, undefined, new Date("2026-09-18T10:00:00Z"));
};

describe("the saved-repertoires store", () => {
  it("starts empty, keeps what is written, and survives a fresh read", () => {
    expect(savedRepertoiresSnapshot()).toEqual([]);
    expect(saveRepertoire(record("a", "Caro"))).toBeUndefined();

    // What a reload sees: the raw storage, read back through the normaliser.
    const raw = JSON.parse(localStorage.getItem(SAVED_REPERTOIRES_STORAGE_KEY)!);
    expect(raw).toEqual([record("a", "Caro")]);
    expect(findSavedRepertoire("a")).toEqual(record("a", "Caro"));
  });

  it("lists newest first and keeps an identical re-save a no-op", () => {
    saveRepertoire(record("a"));
    saveRepertoire(record("b"));
    const before = savedRepertoiresSnapshot();
    expect(before.map((row) => row.id)).toEqual(["b", "a"]);

    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);
    saveRepertoire(record("a"));
    expect(listener).not.toHaveBeenCalled();
    expect(savedRepertoiresSnapshot()).toBe(before);

    saveRepertoire(record("a", "renamed"));
    expect(listener).toHaveBeenCalled();
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["a", "b"]);
    unsubscribe();
  });

  it("deletes one, and caps the list", () => {
    saveRepertoire(record("a"));
    removeSavedRepertoire("a");
    expect(savedRepertoiresSnapshot()).toEqual([]);

    for (let i = 0; i < MAX_SAVED_REPERTOIRES + 3; i += 1) saveRepertoire(record(`r${i}`));
    expect(savedRepertoiresSnapshot()).toHaveLength(MAX_SAVED_REPERTOIRES);
  });

  it("deletes several in one write, and writes nothing for ids it does not hold", () => {
    saveRepertoire(record("a"));
    saveRepertoire(record("b"));
    saveRepertoire(record("c"));

    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);
    expect(removeSavedRepertoires(["nope"])).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();

    expect(removeSavedRepertoires(["a", "c", "nope"])).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["b"]);
    unsubscribe();
  });

  it("drops a malformed row rather than rendering it", () => {
    localStorage.setItem(
      SAVED_REPERTOIRES_STORAGE_KEY,
      JSON.stringify([record("good"), { id: "bad" }, "junk"]),
    );
    localStorage.setItem(`${SAVED_REPERTOIRES_STORAGE_KEY}.rev`, "1");
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["good"]);
  });

  it("reports a full quota rather than throwing, and leaves the list as it was", () => {
    saveRepertoire(record("a"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveRepertoire(record("b"))).toBe("storage");
    vi.restoreAllMocks();
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["a"]);
  });

  it("lives under its own key: a wipe leaves games, analyses and openings untouched", () => {
    const game = parsePgnGame("1. e4 e5 *");
    saveGame(savedGameOf("g1", game, DEFAULT_ENGINE_SETTINGS));
    saveAnalysis(
      savedAnalysisOf("a1", treeFromGame(game), [], DEFAULT_ANALYSIS_SETTINGS, "white"),
    );
    saveOpening(savedOpeningOf("o1", emptyTree(), "white", "", null));
    saveRepertoire(record("r1"));

    const games = savedGamesSnapshot();
    const analyses = savedAnalysesSnapshot();
    const openings = savedOpeningsSnapshot();
    expect([games.length, analyses.length, openings.length]).toEqual([1, 1, 1]);

    expect(clearSavedRepertoires()).toBeUndefined();
    expect(savedRepertoiresSnapshot()).toEqual([]);
    expect(savedGamesSnapshot()).toEqual(games);
    expect(savedAnalysesSnapshot()).toEqual(analyses);
    expect(savedOpeningsSnapshot()).toEqual(openings);
  });

  it("edits a title and settings in place, keeping the list order", () => {
    saveRepertoire(record("a"));
    saveRepertoire(record("b"));
    expect(
      updateRepertoireSettings("a", "Caro", {
        description: "Main line",
        color: "black",
        showArrows: false,
        chanceArrows: true,
        protected: true,
      }),
    ).toBeUndefined();

    const rows = savedRepertoiresSnapshot();
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
    expect(rows[1]).toMatchObject({
      name: "Caro",
      settings: {
        description: "Main line",
        color: "black",
        showArrows: false,
        chanceArrows: true,
        protected: true,
      },
    });
  });

  it("writes nothing for an unchanged edit or an unknown id", () => {
    saveRepertoire(record("a", "Caro"));
    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);

    updateRepertoireSettings("a", "Caro", record("a").settings);
    updateRepertoireSettings("nope", "X", record("a").settings);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("counts a settings change as a change for an idempotent re-save", () => {
    saveRepertoire(record("a"));
    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);
    saveRepertoire({
      ...record("a"),
      settings: {
        description: "",
        color: "black",
        showArrows: true,
        chanceArrows: false,
        protected: true,
      },
    });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("adds a split's records at the top in order, all in one write", () => {
    saveRepertoire(record("old"));
    expect(addRepertoires([record("s1"), record("s2")])).toBeUndefined();
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["s1", "s2", "old"]);
  });

  it("replaces a record in its own place", () => {
    saveRepertoire(record("c"));
    saveRepertoire(record("b"));
    saveRepertoire(record("a"));
    expect(addRepertoires([record("b1"), record("b2")], "b")).toBeUndefined();
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["a", "b1", "b2", "c"]);
  });

  it("refuses a set that would pass the cap, and writes nothing", () => {
    saveRepertoire(record("old"));
    const many = Array.from({ length: MAX_SAVED_REPERTOIRES }, (_, i) => record(`s${i}`));
    expect(addRepertoires(many)).toBe("too-many");
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["old"]);
    // Replacing the one row makes room for exactly the cap.
    expect(addRepertoires(many, "old")).toBeUndefined();
    expect(savedRepertoiresSnapshot()).toHaveLength(MAX_SAVED_REPERTOIRES);
  });
});
