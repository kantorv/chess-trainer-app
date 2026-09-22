import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { mainline, nodeAtSanPath, type GameTree } from "../../lib/gameTree";
import { parsePgnTree } from "../../lib/pgn";
import { MASK_PRESETS } from "../../lib/pieceMask";
import {
  NEXT_MOVE_ARROW_COLOR,
  REQUIRED_MOVE_ARROW_COLOR,
  SIDELINE_NEXT_MOVE_ARROW_COLOR,
} from "../tools/analysis/nextMoveArrows";
import type { TreeViewParts } from "./treeView";
import { useVariationsExplorer, type VariationsExplorerOptions } from "./useVariationsExplorer";

/*
  The explorer mode's contract (CTA-72, `.claude/rules/tree-views.md` §2):
  every opt-in part is absent until asked for, editing is off without
  `onEditTree`, and the arrows follow the options. The full behaviour is the
  repertoire player's, asserted by its own suites through the screen.
*/

const tree = parsePgnTree(
  "1. e4 {King's pawn.} e5 2. Nf3 (2. f4 {prc:75} exf4) (2. Nc3 {prc:25}) 2... Nc6 *",
);
const at = (t: GameTree, ...sans: string[]) => nodeAtSanPath(t, sans)!;

let parts: TreeViewParts;
const report = (next: TreeViewParts) => {
  parts = next;
};

function Harness(options: Omit<VariationsExplorerOptions, "testId" | "source"> & { nodeId?: string | null }) {
  const { nodeId = null, ...rest } = options;
  const view = useVariationsExplorer({
    testId: "x",
    source: {
      tree,
      mainlineNodes: mainline(tree),
      nodeId,
      goToNode: vi.fn(),
      orientation: "white",
    },
    ...rest,
  });
  report(view);
  return (
    <>
      <div data-testid="moves">{view.moves}</div>
      <div data-testid="map">{view.map}</div>
      <div data-testid="annotations">{view.annotations}</div>
      <div data-testid="next">{view.nextMoves}</div>
      <div data-testid="overlay">{view.overlay}</div>
    </>
  );
}

const mount = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <AppThemeWithLang>
      <Harness {...props} />
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("useVariationsExplorer — the opt-in parts", () => {
  it("gives a move list and the next-moves bar, and nothing it was not asked for", () => {
    // At a branch: the bar lists continuations only where there is a choice.
    mount({ nodeId: at(tree, "e4", "e5") });
    expect(screen.getByTestId("move-ply-1")).toBeInTheDocument();
    expect(screen.getByTestId("next")).not.toBeEmptyDOMElement();
    expect(parts.map).toBeUndefined();
    expect(parts.annotations).toBeUndefined();
    expect(parts.overlay).toBeNull();
    expect(parts.arrows).toEqual([]);
  });

  it("is read-only without onEditTree: a right-click opens no menu", () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId("move-ply-1"));
    expect(screen.queryByTestId("move-menu")).toBeNull();
  });

  it("opens the move menu when given onEditTree", () => {
    const onEditTree = vi.fn();
    mount({ onEditTree });
    fireEvent.contextMenu(screen.getByTestId("move-ply-1"));
    expect(screen.getByTestId("move-menu")).toBeInTheDocument();
  });

  it("offers Play chances at a branch unless told not to (CTA-73)", () => {
    // 2. Nf3 has two alternatives, so its menu offers the branch's chances…
    const { unmount } = mount({ onEditTree: vi.fn() });
    fireEvent.contextMenu(screen.getByTestId("move-ply-3"));
    expect(screen.getByTestId("move-menu-chances")).toBeInTheDocument();
    unmount();

    // …and a board with nothing to play by them (the Analysis Board) turns it off.
    mount({ onEditTree: vi.fn(), playChances: false });
    fireEvent.contextMenu(screen.getByTestId("move-ply-3"));
    expect(screen.getByTestId("move-menu")).toBeInTheDocument();
    expect(screen.getByTestId("move-menu-delete")).toBeInTheDocument();
    expect(screen.queryByTestId("move-menu-chances")).toBeNull();
  });

  it("renders the map and the comment block when asked for", () => {
    mount({ map: {}, annotations: true, nodeId: at(tree, "e4") });
    expect(screen.getByTestId("x-map")).toBeInTheDocument();
    expect(screen.getByTestId("x-annotations")).toHaveTextContent("King's pawn.");
    // Read-only: no add button without onEditTree.
    expect(screen.queryByTestId("x-annotations-add")).toBeNull();
  });
});

describe("useVariationsExplorer — the arrows", () => {
  it("draws every continuation, the mainline's in its own colour, when shown", () => {
    mount({ arrows: { show: true }, nodeId: at(tree, "e4", "e5") });
    expect(parts.arrows.map((arrow) => [arrow.endSquare, arrow.color])).toEqual([
      ["f3", NEXT_MOVE_ARROW_COLOR],
      ["f4", SIDELINE_NEXT_MOVE_ARROW_COLOR],
      ["c3", SIDELINE_NEXT_MOVE_ARROW_COLOR],
    ]);
  });

  it("draws the required moves alone, whatever the switch says", () => {
    const required = [at(tree, "e4", "e5", "f4")].map((id) =>
      mainline(tree)[1].children.find((node) => node.id === id)!,
    );
    mount({ arrows: { show: true, required }, nodeId: at(tree, "e4", "e5") });
    expect(parts.arrows).toEqual([
      { startSquare: "f2", endSquare: "f4", color: REQUIRED_MOVE_ARROW_COLOR },
    ]);
  });

  it("hands the board to the play-chance overlay where the branch is marked", () => {
    mount({ arrows: { show: true, chances: true }, nodeId: at(tree, "e4", "e5") });
    expect(parts.arrows).toEqual([]);
    expect(screen.getByTestId("x-chance-arrows-overlay")).toBeInTheDocument();
  });
});

describe("useVariationsExplorer — a masked board's notation (CTA-79)", () => {
  it("writes a hidden piece's move as coordinates in every part that prints one", () => {
    mount({
      nodeId: at(tree, "e4", "e5"),
      mask: MASK_PRESETS.nonPawns,
      annotations: true,
      map: {},
    });
    // The side lines under the list's rows.
    const moves = screen.getByTestId("moves");
    expect(moves).toHaveTextContent("b1c3");
    expect(moves).not.toHaveTextContent(/Nf3|Nc3/);
    // The next-moves bar at the branch — a pawn move is hidden too, being
    // what the others are drawn as.
    const next = screen.getByTestId("next");
    expect(next).toHaveTextContent("g1f3");
    expect(next).toHaveTextContent("f2f4");
    // The map's labels.
    const labels = screen.getByTestId("x-map-labels");
    expect(labels).toHaveTextContent("g1f3");
    expect(labels).not.toHaveTextContent("Nf3");
  });

  it("prints SAN with no mask", () => {
    mount({ nodeId: at(tree, "e4", "e5"), map: {} });
    expect(screen.getByTestId("next")).toHaveTextContent("Nf3");
    expect(screen.getByTestId("x-map-labels")).toHaveTextContent("Nf3");
  });
});
