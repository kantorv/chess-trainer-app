import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { type Score } from "../../lib/engineAnalysis";
import { parsePgnGames } from "../../lib/pgn";
import { initialFenOf, type Game } from "../../lib/gameModel";
import type { VariationNode } from "../../lib/gameTree";
import MoveList from "./MoveList";

/*
  The move list is a panel, not a board — nothing here mounts `<Chessboard>`,
  which is the point of taking the game as a prop.
*/

const game: Game = parsePgnGames(
  [`[White "Alice"]`, `[Black "Bob"]`, "", "1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0"].join(
    "\n",
  ),
)[0];

const renderList = (currentPly: number, onSelectPly = vi.fn()) => {
  render(
    <AppThemeWithLang>
      <MoveList game={game} currentPly={currentPly} onSelectPly={onSelectPly} />
    </AppThemeWithLang>,
  );
  return onSelectPly;
};

const cell = (ply: number) => screen.getByTestId(`move-ply-${ply}`);

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the move list", () => {
  it("renders the moves as numbered pairs, not one row per ply", () => {
    renderList(0);

    // Three numbered rows for five half-moves.
    expect(screen.getByTestId("move-number-1")).toHaveTextContent("1.");
    expect(screen.getByTestId("move-number-3")).toHaveTextContent("3.");
    expect(screen.queryByTestId("move-number-4")).not.toBeInTheDocument();

    expect(cell(1)).toHaveTextContent("e4");
    expect(cell(2)).toHaveTextContent("e5");
    expect(cell(5)).toHaveTextContent("Bb5");
  });

  it("makes the starting position a selectable entry of its own", async () => {
    const onSelectPly = renderList(3);
    expect(cell(0)).toHaveTextContent(i18n.t("moveList.startPosition"));

    await userEvent.click(cell(0));
    expect(onSelectPly).toHaveBeenCalledWith(0);
  });

  it("highlights the current ply, and only that one", () => {
    renderList(3);

    expect(cell(3)).toHaveAttribute("aria-current", "true");
    expect(cell(0)).not.toHaveAttribute("aria-current");
    expect(cell(2)).not.toHaveAttribute("aria-current");
    expect(
      within(screen.getByTestId("move-list")).getAllByRole("button", {
        current: true,
      }),
    ).toHaveLength(1);
  });

  it("highlights ply 0 when the starting position is selected", () => {
    renderList(0);
    expect(cell(0)).toHaveAttribute("aria-current", "true");
    expect(cell(1)).not.toHaveAttribute("aria-current");
  });

  it("reports the clicked move's ply", async () => {
    const onSelectPly = renderList(0);

    await userEvent.click(cell(4));
    expect(onSelectPly).toHaveBeenCalledWith(4);

    await userEvent.click(cell(1));
    expect(onSelectPly).toHaveBeenLastCalledWith(1);
  });

  it("says so for a game with no moves", () => {
    render(
      <AppThemeWithLang>
        <MoveList
          game={{ headers: {}, moves: [] }}
          currentPly={0}
          onSelectPly={vi.fn()}
        />
      </AppThemeWithLang>,
    );

    expect(screen.getByTestId("move-list")).toHaveTextContent(
      i18n.t("moveList.noMoves"),
    );
    // Ply 0 stays reachable even with nothing to step through.
    expect(cell(0)).toHaveAttribute("aria-current", "true");
  });

  it("flags a move with a comment marker only when its ply is in annotatedPlies", () => {
    render(
      <AppThemeWithLang>
        <MoveList
          game={game}
          currentPly={0}
          onSelectPly={vi.fn()}
          annotatedPlies={new Set([2])}
        />
      </AppThemeWithLang>,
    );

    expect(screen.getByTestId("move-comment-icon-2")).toBeInTheDocument();
    expect(screen.queryByTestId("move-comment-icon-1")).toBeNull();
    expect(cell(2)).toHaveAttribute("data-has-comment", "true");
    expect(cell(1)).not.toHaveAttribute("data-has-comment");
  });

  it("renders no comment markers when annotatedPlies is omitted", () => {
    renderList(0);
    expect(screen.queryByTestId(/^move-comment-icon-/)).toBeNull();
  });

  it("keeps SAN tokens left-to-right under Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderList(0);

    // The direction is an attribute, not CSS: the RTL emotion cache flips a
    // `direction: ltr` declaration, and would turn this into the bug it guards.
    expect(cell(1)).toHaveAttribute("dir", "ltr");
    expect(screen.getByTestId("move-number-1")).toHaveAttribute("dir", "ltr");
    // The panel's own chrome is translated — it is not pinned to English.
    expect(cell(0)).toHaveTextContent(i18n.t("moveList.startPosition"));
  });

  it("indents with a logical property, so it follows the direction", () => {
    renderList(0);

    /*
      jsdom resolves no logical properties through `getComputedStyle`, so read
      what emotion actually inserted instead. `padding-left` would sit on the
      wrong side of the mirrored panel; `padding-inline-start` follows it.
    */
    const inserted = Array.from(document.querySelectorAll("style"))
      .map((tag) => tag.textContent ?? "")
      .join("");

    expect(inserted).toContain("padding-inline-start");
  });
});

describe("the move list — evals beside the moves (CTA-50)", () => {
  it("shows an eval beside a move whose position the engine has scored", () => {
    render(
      <AppThemeWithLang>
        <MoveList
          game={game}
          currentPly={0}
          onSelectPly={vi.fn()}
          evalsByFen={new Map<string, Score>([
            [game.moves[0].fen, { kind: "cp", value: 30 }],
          ])}
        />
      </AppThemeWithLang>,
    );

    expect(screen.getByTestId("move-eval-1")).toHaveTextContent("+0.30");
    // An unscored position prints nothing, not the no-data dash.
    expect(screen.queryByTestId("move-eval-2")).toBeNull();
    expect(cell(2)).not.toHaveTextContent("—");

    /*
      The score sits at the row's far edge via a *logical* auto margin. jsdom
      resolves no logical properties through `getComputedStyle`, so read what
      emotion actually inserted instead — the same read the indentation test
      makes. A physical `margin-left` would be flipped by the RTL cache, and
      inside this LTR-pinned row would push the score to the wrong edge.
    */
    const inserted = Array.from(document.querySelectorAll("style"))
      .map((tag) => tag.textContent ?? "")
      .join("");

    expect(inserted).toContain("margin-inline-start");
  });

  it("shows the start-position eval at ply 0 when the game's start is scored", () => {
    render(
      <AppThemeWithLang>
        <MoveList
          game={game}
          currentPly={0}
          onSelectPly={vi.fn()}
          evalsByFen={new Map<string, Score>([
            [initialFenOf(game), { kind: "mate", value: 3 }],
          ])}
        />
      </AppThemeWithLang>,
    );

    expect(screen.getByTestId("move-eval-0")).toHaveTextContent("M3");
    expect(screen.queryByTestId("move-eval-1")).toBeNull();
    // The starting-position row is chrome, not SAN — it is not dir-pinned, so
    // the token carries the attribute itself: a signed score in an RTL flow
    // has its sign migrate across the number.
    expect(screen.getByTestId("move-eval-0")).toHaveAttribute("dir", "ltr");
  });

  it("renders no eval tokens when the prop is omitted", () => {
    renderList(0);
    expect(screen.queryByTestId(/^move-eval-/)).toBeNull();
  });
});

describe("the move list — side lines under the moves they branch from (CTA-53)", () => {
  /*
    Hand-built plain data, not a parsed tree: the list renders a side line from
    its `san`, `ply` and `fen` alone — the numbering is read off the *game's*
    start position (`plyLabel`), and the FEN is only the eval map's key — so
    the fens here need to be unique, not real.

    `v1` answers 1. e4 with 1… c5 and goes on 2. Nc3, so it branches from the
    mainline's ply 1 — the key the maps below hand the list.
  */
  const sicilian: VariationNode = {
    id: "v1",
    san: "c5",
    from: "c7",
    to: "c5",
    fen: "after-1...c5",
    ply: 2,
    children: [
      {
        id: "v2",
        san: "Nc3",
        from: "b1",
        to: "c3",
        fen: "after-2.Nc3",
        ply: 3,
        children: [],
      },
    ],
  };

  const renderWithBranches = (
    branches: ReadonlyMap<number, readonly VariationNode[]>,
    {
      currentPly = 0,
      currentNodeId = null,
      onSelectNode,
      evalsByFen,
    }: {
      currentPly?: number;
      currentNodeId?: string | null;
      onSelectNode?: (id: string) => void;
      evalsByFen?: ReadonlyMap<string, Score>;
    } = {},
  ) =>
    render(
      <AppThemeWithLang>
        <MoveList
          game={game}
          currentPly={currentPly}
          onSelectPly={vi.fn()}
          branches={branches}
          currentNodeId={currentNodeId}
          onSelectNode={onSelectNode}
          evalsByFen={evalsByFen}
        />
      </AppThemeWithLang>,
    );

  it("hangs a side line directly under the pair holding the move it answers", () => {
    renderWithBranches(new Map([[1, [sicilian]]]));

    const block = screen.getByTestId("tree-variation-v1");
    expect(block).toHaveAttribute("role", "group");
    expect(block).toHaveAttribute("aria-label", i18n.t("moveList.variation"));

    // The run restates the number it starts on, and goes on from there.
    expect(
      within(block)
        .getAllByTestId(/^tree-move-/)
        .map((token) => token.textContent),
    ).toEqual(["1… c5", "2. Nc3"]);

    /*
      DOM order is the layout here: the run sits between the row holding the
      move it answers (1. e4 e5) and the row after it (2. Nf3).
    */
    const layout = screen
      .getAllByTestId(/^move-ply-\d|^tree-variation-/)
      .map((element) => element.getAttribute("data-testid"));
    expect(layout).toEqual([
      "move-ply-0",
      "move-ply-1",
      "move-ply-2",
      "tree-variation-v1",
      "move-ply-3",
      "move-ply-4",
      "move-ply-5",
    ]);
  });

  it("reports a side-line click as the node it names, not a ply", async () => {
    const onSelectNode = vi.fn();
    renderWithBranches(new Map([[1, [sicilian]]]), { onSelectNode });

    await userEvent.click(screen.getByTestId("tree-move-v2"));
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith("v2");
  });

  it("highlights the side-line token the selection is on, and no numbered row", () => {
    renderWithBranches(new Map([[1, [sicilian]]]), {
      currentPly: -1,
      currentNodeId: "v2",
    });

    expect(screen.getByTestId("tree-move-v2")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("tree-move-v1")).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen
        .queryAllByTestId(/^move-ply-/)
        .filter((element) => element.getAttribute("aria-current") === "true"),
    ).toHaveLength(0);
  });

  it("prints a side-line move's eval when its position is scored, nothing otherwise", () => {
    renderWithBranches(new Map([[1, [sicilian]]]), {
      evalsByFen: new Map<string, Score>([
        ["after-1...c5", { kind: "cp", value: 42 }],
      ]),
    });

    expect(screen.getByTestId("tree-eval-v1")).toHaveTextContent("+0.42");
    expect(screen.queryByTestId("tree-eval-v2")).toBeNull();
  });

  it("renders a side line off a side line, nested inside its run", () => {
    // After 1… c5 2. Nc3 the run goes on 2… e6, and 2… d5 is an alternative to
    // it — a side line off the side line.
    const deeper: VariationNode = {
      ...sicilian,
      children: [
        {
          ...sicilian.children[0],
          children: [
            {
              id: "v4",
              san: "e6",
              from: "e7",
              to: "e6",
              fen: "after-2...e6",
              ply: 4,
              children: [],
            },
            {
              id: "v3",
              san: "d5",
              from: "d7",
              to: "d5",
              fen: "after-2...d5",
              ply: 4,
              children: [],
            },
          ],
        },
      ],
    };
    renderWithBranches(new Map([[1, [deeper]]]));

    const outer = screen.getByTestId("tree-variation-v1");
    // A block inside the block: the second side line hangs in the first run.
    expect(within(outer).getByTestId("tree-variation-v3")).toBeInTheDocument();
    // …its first move restates the number it starts on…
    expect(within(outer).getByTestId("tree-move-v3")).toHaveTextContent(
      "2… d5",
    );
    // …while the move the run goes on with carries no number — the reader's
    // place inside it is not broken.
    expect(within(outer).getByTestId("tree-move-v4")).toHaveTextContent("e6");
  });

  it("hangs a side line that branches before any mainline move under the start row", () => {
    const d4: VariationNode = {
      id: "v5",
      san: "d4",
      from: "d2",
      to: "d4",
      fen: "after-1.d4",
      ply: 1,
      children: [],
    };
    renderWithBranches(new Map([[0, [d4]]]));

    const layout = screen
      .getAllByTestId(/^move-ply-\d|^tree-variation-/)
      .map((element) => element.getAttribute("data-testid"));
    expect(layout).toEqual([
      "move-ply-0",
      "tree-variation-v5",
      "move-ply-1",
      "move-ply-2",
      "move-ply-3",
      "move-ply-4",
      "move-ply-5",
    ]);
    expect(screen.getByTestId("tree-move-v5")).toHaveTextContent("1. d4");
  });
});
