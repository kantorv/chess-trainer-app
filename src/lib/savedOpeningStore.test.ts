import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";

import { addMove, emptyTree, fenAtNode, type GameTree } from "./gameTree";
import { savedOpeningOf, type SavedOpening } from "./savedOpenings";
import {
  clearSavedOpenings,
  findSavedOpening,
  MAX_SAVED_OPENINGS,
  removeSavedOpening,
  SAVED_OPENINGS_STORAGE_KEY,
  saveOpening,
  savedOpeningsSnapshot,
  subscribeSavedOpenings,
  updateSavedOpeningNote,
} from "./savedOpeningStore";

/*
  `src/test/setup.ts` clears `localStorage` between tests, and the store's cache
  is checked against a revision that lives *in* storage — so a clear takes the
  cache with it and each test below starts from an empty list without this file
  reaching into the module's internals.
*/

/** A tree grown by playing SAN down one line, the way the screen grows one. */
const grownTree = (moves: readonly string[]): GameTree => {
  let tree = emptyTree();
  let nodeId: string | null = null;

  for (const san of moves) {
    const move = new Chess(fenAtNode(tree, nodeId)).move(san);
    const added = addMove(tree, nodeId, {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: move.after,
    });
    tree = added.tree;
    nodeId = added.nodeId;
  }

  return tree;
};

const save = (
  id: string,
  moves: readonly string[],
  note = "",
  orientation: "white" | "black" = "white",
  folderId: string | null = null,
  now = new Date("2026-09-07T10:00:00.000Z"),
): SavedOpening =>
  savedOpeningOf(id, grownTree(moves), orientation, note, folderId, now);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the saved-openings store", () => {
  it("starts empty, and keeps an opening that is written to it", () => {
    expect(savedOpeningsSnapshot()).toEqual([]);

    expect(saveOpening(save("a1", ["e4", "e5"], "My line"))).toBe(undefined);

    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a1"]);
    expect(findSavedOpening("a1")?.note).toBe("My line");
  });

  it("survives a reload — the openings are read back out of storage", () => {
    saveOpening(save("a1", ["e4"]));

    const stored: unknown = JSON.parse(
      localStorage.getItem(SAVED_OPENINGS_STORAGE_KEY)!,
    );

    expect(Array.isArray(stored)).toBe(true);
    expect(savedOpeningsSnapshot()[0].pgn).toContain("1. e4");
  });

  it("replaces an opening in place, so a re-save under the same id is one row", () => {
    saveOpening(save("a1", ["e4"]));
    saveOpening(save("a1", ["e4", "e5"]));
    saveOpening(save("a1", ["e4", "e5", "Nf3"]));

    expect(savedOpeningsSnapshot()).toHaveLength(1);
    expect(savedOpeningsSnapshot()[0].pgn).toContain("Nf3");
  });

  it("lists them newest first, and moves one re-saved back to the top", () => {
    saveOpening(save("a1", ["e4"]));
    saveOpening(save("a2", ["d4"]));
    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a2", "a1"]);

    saveOpening(save("a1", ["e4", "e5"]));
    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a1", "a2"]);
  });

  it("keeps the date an opening was begun when it is re-saved", () => {
    saveOpening(
      save(
        "a1",
        ["e4"],
        "",
        "white",
        null,
        new Date("2026-09-01T08:00:00.000Z"),
      ),
    );
    saveOpening(
      save(
        "a1",
        ["e4", "e5"],
        "",
        "white",
        null,
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    );

    expect(savedOpeningsSnapshot()[0].savedAt).toBe("2026-09-01T08:00:00.000Z");
    expect(savedOpeningsSnapshot()[0].updatedAt).toBe("2026-09-07T10:00:00.000Z");
  });

  it("does nothing at all when the record would be identical", () => {
    saveOpening(save("a1", ["e4"]));
    saveOpening(save("a2", ["d4"]));
    const before = savedOpeningsSnapshot();

    // A double-clicked save button: the same record, again.
    saveOpening(save("a1", ["e4"]));

    // Not merely equal — the *same array*, so nothing downstream re-renders and
    // the list is not re-ordered by an opening nobody touched.
    expect(savedOpeningsSnapshot()).toBe(before);
    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a2", "a1"]);
  });

  it("does write when only the note or the orientation changed", () => {
    saveOpening(save("a1", ["e4"], "Before"));

    saveOpening(save("a1", ["e4"], "After"));
    expect(savedOpeningsSnapshot()[0].note).toBe("After");

    saveOpening(save("a1", ["e4"], "After", "black"));
    expect(savedOpeningsSnapshot()[0].orientation).toBe("black");
  });

  it("does write when only the folder changed, and stays put when it has not", () => {
    saveOpening(save("a1", ["e4"], "Same", "white", null));

    // Re-filing into a folder is a real change — the idempotency check
    // includes the folderId, so the write lands.
    saveOpening(save("a1", ["e4"], "Same", "white", "folder-1"));
    expect(savedOpeningsSnapshot()[0].folderId).toBe("folder-1");

    // The same folder again: a no-op, not a duplicate or a re-order.
    const before = savedOpeningsSnapshot();
    saveOpening(save("a1", ["e4"], "Same", "white", "folder-1"));
    expect(savedOpeningsSnapshot()).toBe(before);
  });

  it("edits a note in place, without moving the record to the top", () => {
    saveOpening(save("a1", ["e4"], "First"));
    saveOpening(save("a2", ["d4"], "Second"));
    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a2", "a1"]);

    updateSavedOpeningNote("a1", "Renamed");

    // The note changed, the order did not — editing a name is not working on the
    // opening.
    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a2", "a1"]);
    expect(findSavedOpening("a1")?.note).toBe("Renamed");
    expect(findSavedOpening("a2")?.note).toBe("Second");
  });

  it("is a no-op for a note that has not changed, and for an id that is not there", () => {
    saveOpening(save("a1", ["e4"], "Same"));
    const before = savedOpeningsSnapshot();

    expect(updateSavedOpeningNote("a1", "Same")).toBe(undefined);
    expect(updateSavedOpeningNote("nope", "x")).toBe(undefined);
    expect(savedOpeningsSnapshot()).toBe(before);
  });

  it("keeps at most MAX_SAVED_OPENINGS, dropping the oldest", () => {
    for (let index = 0; index <= MAX_SAVED_OPENINGS; index += 1) {
      saveOpening(save(`a${index}`, ["e4"]));
    }

    const ids = savedOpeningsSnapshot().map((row) => row.id);
    expect(ids).toHaveLength(MAX_SAVED_OPENINGS);
    expect(ids[0]).toBe(`a${MAX_SAVED_OPENINGS}`);
    expect(ids).not.toContain("a0");
  });

  it("forgets one opening, and all of them", () => {
    saveOpening(save("a1", ["e4"]));
    saveOpening(save("a2", ["d4"]));

    removeSavedOpening("a1");
    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a2"]);

    // An id that is not there is a no-op rather than an error.
    expect(removeSavedOpening("nope")).toBe(undefined);

    clearSavedOpenings();
    expect(savedOpeningsSnapshot()).toEqual([]);
  });

  it("returns the same array until something changes", () => {
    saveOpening(save("a1", ["e4"]));

    expect(savedOpeningsSnapshot()).toBe(savedOpeningsSnapshot());

    const before = savedOpeningsSnapshot();
    saveOpening(save("a2", ["d4"]));
    expect(savedOpeningsSnapshot()).not.toBe(before);
  });

  it("tells its subscribers when one is saved, and stops when they leave", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSavedOpenings(listener);

    saveOpening(save("a1", ["e4"]));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    saveOpening(save("a2", ["d4"]));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is a separate store from the saved analyses, sharing no key", () => {
    expect(SAVED_OPENINGS_STORAGE_KEY).not.toBe("chessapp.savedAnalyses.v1");
  });
});

describe("the saved-openings store — when storage will not co-operate", () => {
  it("reads an empty list rather than throwing on a corrupt entry", () => {
    localStorage.setItem(SAVED_OPENINGS_STORAGE_KEY, "{ not json");
    localStorage.setItem(`${SAVED_OPENINGS_STORAGE_KEY}.rev`, "1");

    expect(savedOpeningsSnapshot()).toEqual([]);
  });

  it("drops a row that is not a saved opening and keeps the rest", () => {
    localStorage.setItem(
      SAVED_OPENINGS_STORAGE_KEY,
      JSON.stringify([{ nonsense: true }, save("a1", ["e4"])]),
    );
    localStorage.setItem(`${SAVED_OPENINGS_STORAGE_KEY}.rev`, "2");

    expect(savedOpeningsSnapshot().map((row) => row.id)).toEqual(["a1"]);
  });

  it("reports a full quota instead of throwing out of the save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(saveOpening(save("a1", ["e4"]))).toBe("storage");
  });

  it("reads nothing rather than throwing when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(savedOpeningsSnapshot()).toEqual([]);
  });
});