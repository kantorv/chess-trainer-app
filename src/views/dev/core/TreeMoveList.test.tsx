import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { parsePgnTree } from "../../../lib/pgn";
import { mainline, nodeAtSanPath, type GameTree } from "../../../lib/gameTree";
import VariationTree from "../../tools/analysis/VariationTree";
import TreeMoveList from "./TreeMoveList";

/*
  The variations explorer's comment marker (CTA-69): a move whose PGN carries a
  comment — after it, or opening its variation — shows the comment icon, on the
  mainline's numbered cells and on the side lines' tokens alike.
*/

const tree = parsePgnTree(
  "1. e4 {King's pawn.} e5 2. Nf3 (2. f4 exf4 {Accepted.}) ({Quietly:} 2. Nc3) 2... Nc6 $1 *",
);

const idOf = (t: GameTree, ...sans: string[]) => nodeAtSanPath(t, sans)!;

const renderExplorer = () =>
  render(
    <AppThemeWithLang>
      <TreeMoveList
        tree={tree}
        mainlineNodes={mainline(tree)}
        nodeId={null}
        onSelectNode={vi.fn()}
      />
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the variations explorer marks commented moves", () => {
  it("on the mainline, by ply", () => {
    renderExplorer();
    expect(screen.getByTestId("move-comment-icon-1")).toBeInTheDocument();
    expect(screen.getByTestId("move-ply-1")).toHaveAttribute("data-has-comment", "true");
    // A NAG alone is not a comment.
    for (const ply of [2, 3, 4]) {
      expect(screen.queryByTestId(`move-comment-icon-${ply}`)).toBeNull();
    }
  });

  it("in a side line, after the move or opening the line", () => {
    renderExplorer();
    const exf4 = idOf(tree, "e4", "e5", "f4", "exf4");
    const nc3 = idOf(tree, "e4", "e5", "Nc3");
    const f4 = idOf(tree, "e4", "e5", "f4");
    expect(screen.getByTestId(`tree-comment-icon-${exf4}`)).toBeInTheDocument();
    expect(screen.getByTestId(`tree-comment-icon-${nc3}`)).toBeInTheDocument();
    expect(screen.getByTestId(`tree-move-${nc3}`)).toHaveAttribute("data-has-comment", "true");
    expect(screen.queryByTestId(`tree-comment-icon-${f4}`)).toBeNull();
  });

  it("is opt-in: the flowing tree's screens mark nothing", () => {
    render(
      <AppThemeWithLang>
        <VariationTree tree={tree} currentId={null} onSelectNode={vi.fn()} />
      </AppThemeWithLang>,
    );
    expect(screen.queryAllByTestId(/comment-icon/)).toHaveLength(0);
  });
});
