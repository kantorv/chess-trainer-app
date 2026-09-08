import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";

import { DEFAULT_ANALYSIS_SETTINGS } from "./analysisSettings";
import {
  addMove,
  emptyTree,
  fenAtNode,
  mainline,
  nodeAtSanPath,
  type GameTree,
} from "./gameTree";
import {
  isSavedAnalysis,
  SAVED_ANALYSES_PATH,
  SAVED_ANALYSIS_PLAYER,
  savedAnalysisCatalogOf,
  savedAnalysisFen,
  savedAnalysisFrom,
  savedAnalysisNode,
  savedAnalysisOf,
  savedAnalysisSummary,
  savedAnalysisToTree,
  type SavedAnalysis,
} from "./savedAnalyses";

/**
 * A tree grown by playing SAN, the way the Analysis Board grows one: each entry
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
  path: readonly string[] = [],
  overrides: Partial<SavedAnalysis> = {},
): SavedAnalysis => ({
  ...savedAnalysisOf(
    "a1",
    tree,
    path,
    DEFAULT_ANALYSIS_SETTINGS,
    "white",
    AT,
  ),
  ...overrides,
});

describe("savedAnalysisOf — writing a board down", () => {
  it("keeps the side lines, which a linear game's writer would drop", () => {
    const tree = grow([
      [[], ["e4", "e5", "Nf3"]],
      [["e4"], ["c5"]],
    ]);

    const back = savedAnalysisToTree(save(tree))!;
    expect(mainline(back).map((node) => node.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(back.moves[0].children.map((node) => node.san)).toEqual(["e5", "c5"]);
  });

  it("states a non-standard start position, so it reloads as itself", () => {
    const fen = "8/8/8/4k3/8/8/4K3/7R w - - 0 1";
    const saved = save(grow([[[], ["Rh5+"]]], fen));

    expect(saved.pgn).toContain(`[FEN "${fen}"]`);
    expect(savedAnalysisToTree(saved)!.startFen).toBe(fen);
  });

  it("names the players 'Analysis' for a board that is nobody's game", () => {
    expect(save(grow([[[], ["e4"]]])).pgn).toContain(
      `[White "${SAVED_ANALYSIS_PLAYER}"]`,
    );
  });

  it("lets the tree's own tags win, so a library game keeps its players", () => {
    const tree = grow([[[], ["e4"]]]);
    const named: GameTree = {
      ...tree,
      headers: { White: "Carlsen", Black: "Nakamura", Event: "Titled Tuesday" },
    };

    const pgn = save(named).pgn;
    expect(pgn).toContain('[White "Carlsen"]');
    expect(pgn).toContain('[Event "Titled Tuesday"]');
  });

  it("records where the reader was, and reads the position back off it", () => {
    const tree = grow([
      [[], ["e4", "e5"]],
      [["e4"], ["c5"]],
    ]);
    const path = ["e4", "c5"];
    const saved = save(tree, path);
    const back = savedAnalysisToTree(saved)!;

    expect(savedAnalysisNode(saved, back)).not.toBeNull();
    expect(savedAnalysisFen(saved, back)).toBe(
      fenAtNode(tree, nodeAtSanPath(tree, path)),
    );
  });

  it("previews the start position for an analysis left at ply 0", () => {
    const tree = grow([[[], ["e4", "e5"]]]);
    const saved = save(tree, []);
    expect(savedAnalysisFen(saved, savedAnalysisToTree(saved)!)).toBe(
      DEFAULT_POSITION,
    );
  });

  it("carries the date it was begun, not the date of this write", () => {
    const saved = savedAnalysisOf(
      "a1",
      grow([[[], ["e4"]]]),
      [],
      DEFAULT_ANALYSIS_SETTINGS,
      "white",
      new Date("2026-09-08T09:00:00.000Z"),
      "2026-09-01T09:00:00.000Z",
    );

    expect(saved.savedAt).toBe("2026-09-01T09:00:00.000Z");
    expect(saved.updatedAt).toBe("2026-09-08T09:00:00.000Z");
  });
});

describe("savedAnalysisToTree — reading one back", () => {
  it("returns undefined for a record that will not parse, rather than throwing", () => {
    expect(savedAnalysisToTree(save(grow([]), [], { pgn: "1. Qz9 ??" }))).toBeUndefined();
  });
});

describe("savedAnalysisFrom — a row out of storage", () => {
  it("fills in the settings, the path and the orientation a record lacks", () => {
    const row = savedAnalysisFrom({
      id: "a1",
      pgn: "1. e4 *",
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    })!;

    expect(row.settings).toEqual(DEFAULT_ANALYSIS_SETTINGS);
    expect(row.path).toEqual([]);
    expect(row.orientation).toBe("white");
  });

  it("keeps what a record does have", () => {
    const row = savedAnalysisFrom({
      ...save(grow([[[], ["e4"]]]), ["e4"]),
      orientation: "black",
      settings: { depth: 22, multiPv: 5, moveTimeMs: 0 },
    })!;

    expect(row.path).toEqual(["e4"]);
    expect(row.orientation).toBe("black");
    expect(row.settings).toEqual({ depth: 22, multiPv: 5, moveTimeMs: 0 });
  });

  it("drops a path that is not a list of strings", () => {
    const row = savedAnalysisFrom({
      ...save(grow([[[], ["e4"]]])),
      path: "e4",
    })!;
    expect(row.path).toEqual([]);
  });

  it("rejects a value that is not a record at all", () => {
    expect(savedAnalysisFrom(null)).toBeUndefined();
    expect(savedAnalysisFrom({ id: "a1" })).toBeUndefined();
    expect(isSavedAnalysis({ id: "", pgn: "x", savedAt: "", updatedAt: "" })).toBe(
      false,
    );
  });
});

describe("savedAnalysisSummary — what a row says without opening it", () => {
  it("counts the mainline, every node, and how far in the reader was", () => {
    const tree = grow([
      [[], ["e4", "e5", "Nf3"]],
      [["e4"], ["c5", "Nf3"]],
    ]);
    const saved = save(tree, ["e4", "c5"]);

    expect(savedAnalysisSummary(saved, tree)).toEqual({
      moves: 3,
      nodes: 5,
      ply: 2,
    });
  });

  it("reads as empty for a record that will not parse", () => {
    expect(savedAnalysisSummary(save(grow([])), undefined)).toEqual({
      moves: 0,
      nodes: 0,
      ply: 0,
    });
  });
});

describe("savedAnalysisCatalogOf — so ?game= already worked", () => {
  it("presents each readable record as a game under one category", () => {
    const catalog = savedAnalysisCatalogOf([
      save(grow([[[], ["e4", "e5"]]]), [], { id: "a1" }),
      save(grow([[[], ["d4"]]]), [], { id: "a2" }),
    ]);

    expect(catalog.categories.map((category) => category.path)).toEqual([
      SAVED_ANALYSES_PATH,
    ]);
    expect(catalog.items.map((item) => item.id)).toEqual(["a1", "a2"]);
    expect(catalog.items.every((item) => item.kind === "game")).toBe(true);
  });

  it("leaves a record that will not parse out, rather than failing the lot", () => {
    const catalog = savedAnalysisCatalogOf([
      save(grow([[[], ["e4"]]]), [], { id: "a1", pgn: "not a game at all ((" }),
      save(grow([[[], ["d4"]]]), [], { id: "a2" }),
    ]);

    expect(catalog.items.map((item) => item.id)).toEqual(["a2"]);
  });
});
