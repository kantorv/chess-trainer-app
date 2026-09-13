import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Chess } from "chess.js";

import i18n from "../../../../i18n";
import AppThemeWithLang from "../../../../theme/AppThemeWithLang";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../../../lib/analysisSettings";
import {
  addMove,
  emptyTree,
  fenAtNode,
  nodeAtSanPath,
  type GameTree,
} from "../../../../lib/gameTree";
import { savedAnalysisOf, type SavedAnalysis } from "../../../../lib/savedAnalyses";
import { saveAnalysis } from "../../../../lib/savedAnalysisStore";
import { cardSizeTrack } from "../../../library/cardSize";
import { RightPanelOutlet, RightPanelProvider } from "../../../main/rightPanel";
import SavedAnalyses from "./SavedAnalyses";

/*
  The same two stand-ins the Saved games suite needs, and for the same reasons.
  `<Chessboard>` measures its own square on mount and throws where there is no
  layout engine (`.claude/rules/chessboard.md` §8), so it is stubbed and the stub
  keeps the position and the id it was handed. The opening book is stubbed
  because the real one is ~3MB of JSON and what is under test is that the card
  prints what the book says, not the book.

  The store is *not* stubbed: it writes to the `localStorage` jsdom provides and
  `src/test/setup.ts` clears between tests, which is the behaviour under test.
*/
const OPENING = { eco: "C20", name: "King's Pawn Game", moves: "1. e4" };

vi.mock("../../../../lib/openings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/openings")>();
  return {
    ...actual,
    // Keyed on the position after 1. e4 — so an analysis that played it is named
    // and one that opened 1. d4 is not.
    loadOpeningBook: () =>
      Promise.resolve({
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1": OPENING,
      }),
  };
});

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { id?: string; position?: string; boardOrientation?: string };
  }) => (
    <div
      data-testid={`board-${options.id}`}
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

/**
 * A tree grown by playing SAN: each entry is `[parent path, moves]`, so a second
 * entry branching off an earlier point is how a side line is made.
 */
const grow = (
  lines: readonly (readonly [readonly string[], readonly string[]])[],
): GameTree => {
  let tree = emptyTree();

  for (const [from, moves] of lines) {
    let nodeId = nodeAtSanPath(tree, from);
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
  }

  return tree;
};

const save = (
  id: string,
  lines: readonly (readonly [readonly string[], readonly string[]])[],
  path: readonly string[] = [],
  orientation: "white" | "black" = "white",
  now = new Date("2026-09-07T10:00:00.000Z"),
): SavedAnalysis =>
  savedAnalysisOf(
    id,
    grow(lines),
    path,
    DEFAULT_ANALYSIS_SETTINGS,
    orientation,
    now,
  );

const renderScreen = () =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={["/tools/analysis/saved"]}>
        <RightPanelProvider>
          <SavedAnalyses />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** Let the opening book's promise settle, as it does a tick after mount. */
const settleBook = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Saved analyses — the list", () => {
  it("says there is nothing yet on a browser that has analysed nothing", () => {
    renderScreen();

    expect(screen.getByTestId("saved-analyses-empty")).toBeInTheDocument();
    expect(screen.getByTestId("saved-analyses-count")).toHaveTextContent(
      "Analyses: 0",
    );
  });

  it("lists what has been saved, newest first", () => {
    saveAnalysis(save("a1", [[[], ["e4"]]]));
    saveAnalysis(save("a2", [[[], ["d4"]]]));

    renderScreen();

    expect(
      screen.getAllByTestId(/^saved-analyses-item-/).map((row) => row.dataset.testid),
    ).toEqual(["saved-analyses-item-a2", "saved-analyses-item-a1"]);
    expect(screen.getByTestId("saved-analyses-count")).toHaveTextContent(
      "Analyses: 2",
    );
  });

  it("says how long the mainline is, how many side lines and where the reader stopped", () => {
    saveAnalysis(
      save(
        "a1",
        [
          [[], ["e4", "e5", "Nf3"]],
          [["e4"], ["c5", "Nf3"]],
        ],
        ["e4", "c5"],
      ),
    );

    renderScreen();

    const row = screen.getByTestId("saved-analyses-item-a1");
    expect(row).toHaveTextContent("2 moves");
    expect(row).toHaveTextContent("2 variations");
    expect(row).toHaveTextContent("at ply 2");
  });

  it("says nothing about variations for a board with only one line", () => {
    saveAnalysis(save("a1", [[[], ["e4", "e5"]]]));

    renderScreen();

    const row = screen.getByTestId("saved-analyses-item-a1");
    expect(row).toHaveTextContent("1 move");
    expect(row).not.toHaveTextContent("variation");
    // Ply 0 is not a place the reader stopped at, it is where a board opens.
    expect(row).not.toHaveTextContent("at ply");
  });

  it("names a board that is nobody's game for what it is", () => {
    saveAnalysis(save("a1", [[[], ["e4"]]]));

    renderScreen();

    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "Analysis board",
    );
  });

  it("names one begun from a real game by its players", () => {
    const tree = grow([[[], ["e4", "e5"]]]);
    saveAnalysis(
      savedAnalysisOf(
        "a1",
        { ...tree, headers: { White: "Carlsen", Black: "Nakamura" } },
        [],
        DEFAULT_ANALYSIS_SETTINGS,
        "white",
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    );

    renderScreen();

    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "Carlsen – Nakamura",
    );
  });

  it("says so in Hebrew too, without a key falling through", async () => {
    saveAnalysis(save("a1", [[[], ["e4"]]]));
    await i18n.changeLanguage("he");

    renderScreen();

    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "לוח ניתוח",
    );
  });
});

describe("Saved analyses — where a row goes", () => {
  beforeEach(() => {
    saveAnalysis(save("a1", [[[], ["e4", "e5", "Nf3"]]], ["e4", "e5"]));
  });

  it("offers to go on working on it, by its id", () => {
    renderScreen();

    expect(screen.getByTestId("saved-analyses-continue-a1")).toHaveAttribute(
      "href",
      "/tools/analysis?analysis=a1",
    );
  });

  it("hands the whole game to Load PGN as the reference it already takes", () => {
    renderScreen();

    expect(screen.getByTestId("saved-analyses-loadpgn-a1")).toHaveAttribute(
      "href",
      `/games/load-pgn?game=${encodeURIComponent("analysis/saved/a1")}`,
    );
  });

  it("hands Play with Engine the position it was left on, not the last move", () => {
    renderScreen();

    const tree = grow([[[], ["e4", "e5", "Nf3"]]]);
    const left = fenAtNode(tree, nodeAtSanPath(tree, ["e4", "e5"]));

    expect(screen.getByTestId("saved-analyses-play-a1")).toHaveAttribute(
      "href",
      `/engine/play?fen=${encodeURIComponent(left)}`,
    );
  });

  it("deletes one, and the list follows without a reload", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("saved-analyses-remove-a1"));

    expect(screen.queryByTestId("saved-analyses-item-a1")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-analyses-empty")).toBeInTheDocument();
  });
});

describe("Saved analyses — a record that will not read", () => {
  it("still lists it, and offers the one action that means anything", () => {
    saveAnalysis({ ...save("a1", [[[], ["e4"]]]), pgn: "1. Zz9" });

    renderScreen();

    const row = screen.getByTestId("saved-analyses-item-a1");
    expect(row).toHaveTextContent("This analysis could not be read.");
    expect(
      screen.queryByTestId("saved-analyses-continue-a1"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-analyses-remove-a1")).toBeInTheDocument();
  });
});

describe("Saved analyses — the board view", () => {
  const showBoards = async (size: "compact" | "comfortable" = "compact") =>
    userEvent.click(screen.getByTestId(`saved-analyses-view-${size}`));

  it("opens on the list, and switches to boards when asked", async () => {
    saveAnalysis(save("a1", [[[], ["e4"]]]));

    renderScreen();
    expect(screen.getByTestId("saved-analyses-body")).toBeInTheDocument();

    await showBoards();

    expect(screen.getByTestId("saved-analyses-grid")).toHaveStyle({
      gridTemplateColumns: cardSizeTrack("compact"),
    });
    expect(screen.getByTestId("board-saved-analyses-preview-a1")).toBeInTheDocument();
  });

  it("previews the position the reader was standing on", async () => {
    saveAnalysis(save("a1", [[[], ["e4", "e5", "Nf3"]]], ["e4"]));

    renderScreen();
    await showBoards();

    const tree = grow([[[], ["e4", "e5", "Nf3"]]]);
    expect(
      screen.getByTestId("board-saved-analyses-preview-a1"),
    ).toHaveAttribute(
      "data-position",
      fenAtNode(tree, nodeAtSanPath(tree, ["e4"])),
    );
  });

  it("faces the way the board was left", async () => {
    saveAnalysis(save("a1", [[[], ["e4"]]], [], "black"));

    renderScreen();
    await showBoards();

    expect(screen.getByTestId("board-saved-analyses-preview-a1")).toHaveAttribute(
      "data-orientation",
      "black",
    );
  });

  it("names the opening the mainline reached, and only when the book knows it", async () => {
    saveAnalysis(save("a1", [[[], ["e4", "e5"]]]));
    saveAnalysis(save("a2", [[[], ["d4", "d5"]]]));

    renderScreen();
    await showBoards();
    await settleBook();

    expect(screen.getByTestId("saved-analyses-opening-a1")).toHaveTextContent(
      "King's Pawn Game · C20",
    );
    expect(
      screen.queryByTestId("saved-analyses-opening-a2"),
    ).not.toBeInTheDocument();
  });

  it("shows the message in the square for a record with no position to draw", async () => {
    saveAnalysis({ ...save("a1", [[[], ["e4"]]]), pgn: "1. Zz9" });

    renderScreen();
    await showBoards();

    expect(
      screen.queryByTestId("board-saved-analyses-preview-a1"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "This analysis could not be read.",
    );
  });
});

describe("Saved analyses — the panel", () => {
  it("says where the analyses are kept", () => {
    renderScreen();

    expect(screen.getByTestId("saved-analyses-storage-note")).toHaveTextContent(
      "this browser only",
    );
  });
});
