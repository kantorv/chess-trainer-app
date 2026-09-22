import { describe, expect, it, vi } from "vitest";

import { savedAnalysisOf } from "./savedAnalyses";
import { saveAnalysis, savedAnalysesSnapshot } from "./savedAnalysisStore";
import { playedGamesSnapshot, savePlayedGame } from "./playedGameStore";
import { playedGameOf } from "./playedGames";
import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { DEFAULT_ANALYSIS_SETTINGS } from "./analysisSettings";
import { treeFromGame } from "./gameTree";
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
  loadSavedRepertoires,
  resetSavedRepertoireStore,
  updateRepertoireSettings,
} from "./savedRepertoireStore";
import { parsePgnGame } from "./pgn";

/* `src/test/setup.ts` deletes the databases between tests, and forgets what each store read. */

const record = (id: string, name = "", pgn = "1. e4 e5 *"): SavedRepertoire => {
  const reading = readRepertoireText(pgn);
  if (!reading.ok) throw new Error("fixture did not read");
  return savedRepertoireOf(id, reading.games[0], name, undefined, new Date("2026-09-18T10:00:00Z"));
};

describe("the saved-repertoires store", () => {
  const ids = () => savedRepertoiresSnapshot()?.map((row) => row.id);

  it("starts empty, keeps what is written, and survives a fresh read", async () => {
    expect(await loadSavedRepertoires()).toEqual([]);
    expect(await saveRepertoire(record("a", "Caro"))).toBeUndefined();
    expect(findSavedRepertoire("a")).toEqual(record("a", "Caro"));

    // What a reload sees: IndexedDB read back through the normaliser, and nothing in localStorage.
    expect(localStorage.length).toBe(0);
    resetSavedRepertoireStore();
    expect(savedRepertoiresSnapshot()).toBeUndefined();
    expect(await loadSavedRepertoires()).toEqual([record("a", "Caro")]);
  });

  it("moves the repertoires out of the old localStorage key on the first read", async () => {
    localStorage.setItem(
      SAVED_REPERTOIRES_STORAGE_KEY,
      JSON.stringify([record("b"), record("a")]),
    );
    localStorage.setItem(`${SAVED_REPERTOIRES_STORAGE_KEY}.rev`, "1");
    expect((await loadSavedRepertoires()).map((row) => row.id)).toEqual(["b", "a"]);
    expect(localStorage.getItem(SAVED_REPERTOIRES_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(`${SAVED_REPERTOIRES_STORAGE_KEY}.rev`)).toBeNull();
    resetSavedRepertoireStore();
    expect((await loadSavedRepertoires()).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("lists newest first and keeps an identical re-save a no-op", async () => {
    await saveRepertoire(record("a"));
    await saveRepertoire(record("b"));
    const before = savedRepertoiresSnapshot();
    expect(ids()).toEqual(["b", "a"]);

    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);
    await saveRepertoire(record("a"));
    expect(listener).not.toHaveBeenCalled();
    expect(savedRepertoiresSnapshot()).toBe(before);

    await saveRepertoire(record("a", "renamed"));
    expect(listener).toHaveBeenCalled();
    expect(ids()).toEqual(["a", "b"]);
    unsubscribe();
  });

  it("deletes one, and caps the list", async () => {
    await saveRepertoire(record("a"));
    await removeSavedRepertoire("a");
    expect(savedRepertoiresSnapshot()).toEqual([]);

    for (let i = 0; i < MAX_SAVED_REPERTOIRES + 3; i += 1) await saveRepertoire(record(`r${i}`));
    expect(savedRepertoiresSnapshot()).toHaveLength(MAX_SAVED_REPERTOIRES);
  });

  it("deletes several in one write, and writes nothing for ids it does not hold", async () => {
    await saveRepertoire(record("a"));
    await saveRepertoire(record("b"));
    await saveRepertoire(record("c"));

    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);
    expect(await removeSavedRepertoires(["nope"])).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();

    expect(await removeSavedRepertoires(["a", "c", "nope"])).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(["b"]);
    unsubscribe();
  });

  it("drops a malformed row rather than rendering it", async () => {
    localStorage.setItem(
      SAVED_REPERTOIRES_STORAGE_KEY,
      JSON.stringify([record("good"), { id: "bad" }, "junk"]),
    );
    expect((await loadSavedRepertoires()).map((row) => row.id)).toEqual(["good"]);
  });

  it("reports a refused write rather than throwing, and leaves the list as it was", async () => {
    await saveRepertoire(record("a"));
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(await saveRepertoire(record("b"))).toBe("storage");
    vi.restoreAllMocks();
    expect(ids()).toEqual(["a"]);
  });

  it("lives in its own database: a wipe leaves games and analyses untouched", async () => {
    const game = parsePgnGame("1. e4 e5 *");
    await savePlayedGame(playedGameOf("g1", treeFromGame(game), [], DEFAULT_ENGINE_SETTINGS));
    await saveAnalysis(
      savedAnalysisOf("a1", treeFromGame(game), [], DEFAULT_ANALYSIS_SETTINGS, "white"),
    );
    await saveRepertoire(record("r1"));

    const games = playedGamesSnapshot() ?? [];
    const analyses = savedAnalysesSnapshot() ?? [];
    expect([games.length, analyses.length]).toEqual([1, 1]);

    expect(await clearSavedRepertoires()).toBeUndefined();
    expect(savedRepertoiresSnapshot()).toEqual([]);
    expect(playedGamesSnapshot()).toEqual(games);
    expect(savedAnalysesSnapshot()).toEqual(analyses);
  });

  it("edits a title and settings in place, keeping the list order", async () => {
    await saveRepertoire(record("a"));
    await saveRepertoire(record("b"));
    expect(
      await updateRepertoireSettings("a", "Caro", {
        description: "Main line",
        color: "black",
        showArrows: false,
        chanceArrows: true,
        protected: true,
      }),
    ).toBeUndefined();

    const rows = savedRepertoiresSnapshot() ?? [];
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

  it("writes nothing for an unchanged edit or an unknown id", async () => {
    await saveRepertoire(record("a", "Caro"));
    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);

    await updateRepertoireSettings("a", "Caro", record("a").settings);
    await updateRepertoireSettings("nope", "X", record("a").settings);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("counts a settings change as a change for an idempotent re-save", async () => {
    await saveRepertoire(record("a"));
    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);
    await saveRepertoire({
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

  it("adds a split's records at the top in order, all in one write", async () => {
    await saveRepertoire(record("old"));
    expect(await addRepertoires([record("s1"), record("s2")])).toBeUndefined();
    expect(ids()).toEqual(["s1", "s2", "old"]);
  });

  it("replaces a record in its own place", async () => {
    await saveRepertoire(record("c"));
    await saveRepertoire(record("b"));
    await saveRepertoire(record("a"));
    expect(await addRepertoires([record("b1"), record("b2")], "b")).toBeUndefined();
    expect(ids()).toEqual(["a", "b1", "b2", "c"]);
  });

  it("refuses a set that would pass the cap, and writes nothing", async () => {
    await saveRepertoire(record("old"));
    const many = Array.from({ length: MAX_SAVED_REPERTOIRES }, (_, i) => record(`s${i}`));
    expect(await addRepertoires(many)).toBe("too-many");
    expect(ids()).toEqual(["old"]);
    // Replacing the one row makes room for exactly the cap.
    expect(await addRepertoires(many, "old")).toBeUndefined();
    expect(savedRepertoiresSnapshot()).toHaveLength(MAX_SAVED_REPERTOIRES);
  });
});
