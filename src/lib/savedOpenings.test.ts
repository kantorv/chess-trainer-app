import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";

import {
  addMove,
  emptyTree,
  fenAtNode,
  mainline,
  nodeAtSanPath,
  type GameTree,
} from "./gameTree";
import {
  isSavedOpening,
  SAVED_OPENING_PLAYER,
  savedOpeningFen,
  savedOpeningFrom,
  savedOpeningOf,
  savedOpeningSummary,
  savedOpeningToTree,
  type SavedOpening,
} from "./savedOpenings";

/**
 * A tree grown by playing SAN, the way the Openings screen grows one: each entry
 * is `[parent path, moves]`, so a second entry branching off an earlier point is
 * how a side line is made.
 */
const grow = (
  lines: readonly (readonly [readonly string[], readonly string[]])[],
  startFen?: string,
): GameTree => {
  let tree = emptyTree(startFen);

  for (const [from, moves] of lines) {
    let nodeId = nodeAtSanPath(tree, from);
    for (const san of moves) {
      const chess = new Chess(fenAtNode(tree, nodeId));
      const move = chess.move(san);
      const added = addMove(tree, nodeId, {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: move.after,
      });
      tree = added.tree;
      nodeId = added.nodeId;
    }
  }

  return tree;
};

const AT = new Date("2026-09-07T10:00:00.000Z");

const save = (
  tree: GameTree,
  overrides: Partial<SavedOpening> = {},
): SavedOpening => ({
  ...savedOpeningOf("a1", tree, "white", "My Italian", null, AT),
  ...overrides,
});

describe("savedOpeningOf — writing an opening down", () => {
  it("keeps the side lines, which a linear game's writer would drop", () => {
    const tree = grow([
      [[], ["e4", "e5", "Nf3"]],
      [["e4"], ["c5"]],
    ]);

    const back = savedOpeningToTree(save(tree))!;
    expect(mainline(back).map((node) => node.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(back.moves[0].children.map((node) => node.san)).toEqual(["e5", "c5"]);
  });

  it("states a non-standard start position, so it reloads as itself", () => {
    const fen = "8/8/8/4k3/8/8/4K3/7R w - - 0 1";
    const saved = save(grow([[[], ["Rh5+"]]], fen));

    expect(saved.pgn).toContain(`[FEN "${fen}"]`);
    expect(savedOpeningToTree(saved)!.startFen).toBe(fen);
  });

  it("names the players 'Opening' for a board that is nobody's game", () => {
    expect(save(grow([[[], ["e4"]]])).pgn).toContain(
      `[White "${SAVED_OPENING_PLAYER}"]`,
    );
    expect(save(grow([[[], ["e4"]]])).pgn).toContain(
      `[Black "${SAVED_OPENING_PLAYER}"]`,
    );
  });

  it("lets the tree's own tags win, so an opening begun from a game keeps its players", () => {
    const tree = grow([[[], ["e4"]]]);
    const named: GameTree = {
      ...tree,
      headers: { White: "Carlsen", Black: "Nakamura", Event: "Titled Tuesday" },
    };

    const pgn = save(named).pgn;
    expect(pgn).toContain('[White "Carlsen"]');
    expect(pgn).toContain('[Event "Titled Tuesday"]');
  });

  it("carries the note and the orientation the board was saved from", () => {
    const saved = savedOpeningOf(
      "a1",
      grow([[[], ["e4"]]]),
      "black",
      "My line",
      null,
      AT,
    );

    expect(saved.note).toBe("My line");
    expect(saved.orientation).toBe("black");
  });

  it("carries the date it was begun, not the date of this write", () => {
    const saved = savedOpeningOf(
      "a1",
      grow([[[], ["e4"]]]),
      "white",
      "",
      null,
      new Date("2026-09-08T09:00:00.000Z"),
      "2026-09-01T09:00:00.000Z",
    );

    expect(saved.savedAt).toBe("2026-09-01T09:00:00.000Z");
    expect(saved.updatedAt).toBe("2026-09-08T09:00:00.000Z");
  });
});

describe("savedOpeningToTree — reading one back", () => {
  it("returns undefined for a record that will not parse, rather than throwing", () => {
    expect(savedOpeningToTree(save(grow([]), { pgn: "1. Qz9 ??" }))).toBeUndefined();
  });
});

describe("savedOpeningFen — the position a card previews", () => {
  it("reads the end of the mainline off the tree", () => {
    const tree = grow([[[], ["e4", "e5"]]]);
    const saved = save(tree);

    expect(savedOpeningFen(saved, tree)).toBe(
      fenAtNode(tree, nodeAtSanPath(tree, ["e4", "e5"])),
    );
  });

  it("is the starting position for an opening with no moves yet", () => {
    const tree = grow([]);
    expect(savedOpeningFen(save(tree), tree)).toBe(DEFAULT_POSITION);
  });
});

describe("savedOpeningFrom — a row out of storage", () => {
  it("fills in the note and the orientation a record lacks", () => {
    const row = savedOpeningFrom({
      id: "a1",
      pgn: "1. e4 *",
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    })!;

    expect(row.note).toBe("");
    expect(row.orientation).toBe("white");
  });

  it("keeps what a record does have", () => {
    const row = savedOpeningFrom({
      ...save(grow([[[], ["e4"]]])),
      orientation: "black",
      note: "Sicilian side line",
    })!;

    expect(row.orientation).toBe("black");
    expect(row.note).toBe("Sicilian side line");
  });

  it("normalises the folder a record lacks to Unfiled, without a version bump", () => {
    // A record written before CTA-40 has no folderId at all: it reads as
    // Unfiled rather than forcing every stored record to be re-written.
    const row = savedOpeningFrom({
      id: "a1",
      pgn: "1. e4 *",
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    })!;

    expect(row.folderId).toBeNull();
  });

  it("normalises a broken folderId to Unfiled, and keeps a real one", () => {
    const kept = savedOpeningFrom({
      ...save(grow([[[], ["e4"]]]), { folderId: "folder-1" }),
    })!;
    expect(kept.folderId).toBe("folder-1");

    const broken = savedOpeningFrom({
      ...save(grow([[[], ["e4"]]])),
      folderId: 7 as unknown as string,
    })!;
    expect(broken.folderId).toBeNull();

    const empty = savedOpeningFrom({
      ...save(grow([[[], ["e4"]]])),
      folderId: "",
    })!;
    expect(empty.folderId).toBeNull();
  });

  it("rejects a value that is not a record at all", () => {
    expect(savedOpeningFrom(null)).toBeUndefined();
    expect(savedOpeningFrom({ id: "a1" })).toBeUndefined();
    expect(isSavedOpening({ id: "", pgn: "x", savedAt: "", updatedAt: "" })).toBe(
      false,
    );
  });
});

describe("savedOpeningSummary — what a row says without opening it", () => {
  it("counts the mainline and every node", () => {
    const tree = grow([
      [[], ["e4", "e5", "Nf3"]],
      [["e4"], ["c5", "Nf3"]],
    ]);
    const saved = save(tree);

    expect(savedOpeningSummary(saved, tree)).toEqual({
      moves: 3,
      nodes: 5,
    });
  });

  it("reads as empty for a record that will not parse", () => {
    expect(savedOpeningSummary(save(grow([])), undefined)).toEqual({
      moves: 0,
      nodes: 0,
    });
  });
});