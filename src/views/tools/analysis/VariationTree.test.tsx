import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chess } from "chess.js";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import {
  addMove,
  emptyTree,
  fenAtNode,
  mainline,
  type GameTree,
} from "../../../lib/gameTree";
import VariationTree from "./VariationTree";

/** Play a line onto a tree from a node, and hand back where it ended. */
const play = (
  tree: GameTree,
  parentId: string | null,
  ...sans: string[]
): { tree: GameTree; nodeId: string | null } => {
  let current = tree;
  let at = parentId;

  for (const san of sans) {
    const move = new Chess(fenAtNode(current, at)).move(san);
    const added = addMove(current, at, {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: move.after,
    });
    current = added.tree;
    at = added.nodeId;
  }

  return { tree: current, nodeId: at };
};

/** `1. e4 e5 2. Nf3 Nc6`, with `1... c5 2. Nf3` branching off after 1. e4. */
const branched = () => {
  const { tree: line } = play(emptyTree(), null, "e4", "e5", "Nf3", "Nc6");
  const afterE4 = mainline(line)[0];
  return play(line, afterE4.id, "c5", "Nf3").tree;
};

const renderTree = (tree: GameTree, currentId: string | null = null) => {
  const onSelectNode = vi.fn();
  render(
    <AppThemeWithLang>
      <VariationTree
        tree={tree}
        currentId={currentId}
        onSelectNode={onSelectNode}
      />
    </AppThemeWithLang>,
  );
  return { onSelectNode };
};

/** Every move token in the list, in the order it is rendered. */
const tokens = () =>
  screen
    .getAllByTestId(/^tree-move-n/)
    .map((element) => element.textContent?.trim());

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the variation tree", () => {
  it("says so when there is nothing to show", () => {
    renderTree(emptyTree());

    expect(screen.getByTestId("variation-tree")).toHaveTextContent(
      i18n.t("analysis.tree.empty"),
    );
    // The start position is still a selectable entry of its own.
    expect(screen.getByTestId("tree-move-start")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("numbers a plain line the way a book prints it", () => {
    const { tree } = play(emptyTree(), null, "e4", "e5", "Nf3", "Nc6");
    renderTree(tree);

    expect(tokens()).toEqual(["1. e4", "e5", "2. Nf3", "Nc6"]);
  });

  it("renders a side line as its own group, under the move it answers", () => {
    const tree = branched();
    renderTree(tree);

    const alternative = mainline(tree)[0].children[1];
    const variation = screen.getByTestId(`tree-variation-${alternative.id}`);

    // The side line restates its number, because it is a line of its own.
    expect(
      within(variation)
        .getAllByTestId(/^tree-move-n/)
        .map((element) => element.textContent?.trim()),
    ).toEqual(["1… c5", "2. Nf3"]);

    // And both lines are in the list at once — that is the whole point.
    expect(tokens()).toContain("e5");
    expect(tokens()).toContain("1… c5");
  });

  it("restates the number on the mainline move after a side line", () => {
    renderTree(branched());

    // 1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 — the mainline's second White move
    // carries its number anyway, and Nc6 follows it normally.
    expect(tokens()).toEqual([
      "1. e4",
      "e5",
      "1… c5",
      "2. Nf3",
      "2. Nf3",
      "Nc6",
    ]);
  });

  it("marks the selected move, and only it", () => {
    const tree = branched();
    const selected = mainline(tree)[1];
    renderTree(tree, selected.id);

    expect(screen.getByTestId(`tree-move-${selected.id}`)).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getAllByTestId(/^tree-move-/).filter(
        (element) => element.getAttribute("aria-current") === "true",
      ),
    ).toHaveLength(1);
  });

  it("reports a click on a move, including one inside a side line", async () => {
    const tree = branched();
    const { onSelectNode } = renderTree(tree);
    const sicilian = mainline(tree)[0].children[1];

    await userEvent.click(screen.getByTestId(`tree-move-${sicilian.id}`));
    expect(onSelectNode).toHaveBeenCalledWith(sicilian.id);

    await userEvent.click(screen.getByTestId("tree-move-start"));
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });

  it("numbers from a set-up position rather than from move 1", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12";
    const { tree } = play(emptyTree(fen), null, "Nf6", "Nf3");
    renderTree(tree);

    expect(tokens()).toEqual(["12… Nf6", "13. Nf3"]);
  });
});
