import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
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
import {
  createAnalysisFolder,
  analysisFoldersSnapshot,
} from "../../../../lib/savedAnalysisFolderStore";
import {
  addAnalyses,
  findSavedAnalysis,
  saveAnalysis,
} from "../../../../lib/savedAnalysisStore";
import { cardSizeTrack } from "../../../shared/cardSize";
import { RightPanelOutlet, RightPanelProvider } from "../../../main/rightPanel";
import SavedAnalyses, { SAVED_ANALYSES_PAGE } from "./SavedAnalyses";

/*
  The same two stand-ins the Saved games suite needs, and for the same reasons.
  `<Chessboard>` measures its own square on mount and throws where there is no
  layout engine (`.claude/rules/chessboard.md` §8), so it is stubbed and the stub
  keeps the position and the id it was handed — the preview boards pass their
  own options, and the new-analysis form's editor is the spare-piece trio with
  the provider holding them (CTA-87). The opening book is stubbed
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

/*
  The stub keeps the position and the id it was handed — the preview boards
  pass their own; the form's editor renders the spare-piece trio, its provider
  holding the options (`PlayedGames.test.tsx`'s Board editor pattern) — so a
  test drags a piece by calling the provider's `onPieceDrop`.
*/
const editorBoard = vi.hoisted(() => ({ options: null as Record<string, unknown> | null }));
vi.mock("react-chessboard", () => ({
  ChessboardProvider: ({
    options,
    children,
  }: {
    options: Record<string, unknown>;
    children?: ReactNode;
  }) => {
    editorBoard.options = options;
    return <div data-testid="chessboard-provider">{children}</div>;
  },
  Chessboard: ({
    options,
  }: {
    options?: { id?: string; position?: string; boardOrientation?: string };
  }) => (
    <div
      data-testid={`board-${options?.id ?? "editor"}`}
      data-position={options?.position ?? String(editorBoard.options?.position)}
      data-orientation={options?.boardOrientation ?? String(editorBoard.options?.boardOrientation)}
    />
  ),
  SparePiece: ({ pieceType }: { pieceType: string }) => <div data-testid={`spare-${pieceType}`} />,
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

/** Mount the screen, and wait for the store's first read — the list's first frame. */
const renderScreen = async (entry = "/tools/analysis/saved") => {
  const rendered = render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <SavedAnalyses />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );
  await screen.findByTestId("saved-analyses-screen");
  return rendered;
};

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
  it("says there is nothing yet on a browser that has analysed nothing", async () => {
    await renderScreen();

    expect(screen.getByTestId("saved-analyses-empty")).toBeInTheDocument();
    expect(screen.getByTestId("saved-analyses-count")).toHaveTextContent(
      "Analyses: 0",
    );
  });

  it("lists what has been saved, newest first", async () => {
    await saveAnalysis(save("a1", [[[], ["e4"]]]));
    await saveAnalysis(save("a2", [[[], ["d4"]]]));

    await renderScreen();

    expect(
      screen.getAllByTestId(/^saved-analyses-item-/).map((row) => row.dataset.testid),
    ).toEqual(["saved-analyses-item-a2", "saved-analyses-item-a1"]);
    expect(screen.getByTestId("saved-analyses-count")).toHaveTextContent(
      "Analyses: 2",
    );
  });

  it("says how long the mainline is, how many side lines and where the reader stopped", async () => {
    await saveAnalysis(
      save(
        "a1",
        [
          [[], ["e4", "e5", "Nf3"]],
          [["e4"], ["c5", "Nf3"]],
        ],
        ["e4", "c5"],
      ),
    );

    await renderScreen();

    const row = screen.getByTestId("saved-analyses-item-a1");
    expect(row).toHaveTextContent("2 moves");
    expect(row).toHaveTextContent("1 variation");
    expect(row).toHaveTextContent("at ply 2");
  });

  it("counts a side line once no matter how many moves it runs to", async () => {
    await saveAnalysis(
      save("a1", [
        [[], ["e4", "e5", "Nf3"]],
        [["e4"], ["c5", "Nc3", "a6", "Bc4", "e6", "Qf3"]],
      ]),
    );

    await renderScreen();

    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "1 variation",
    );
  });

  it("says nothing about variations for a board with only one line", async () => {
    await saveAnalysis(save("a1", [[[], ["e4", "e5"]]]));

    await renderScreen();

    const row = screen.getByTestId("saved-analyses-item-a1");
    expect(row).toHaveTextContent("1 move");
    expect(row).not.toHaveTextContent("variation");
    // Ply 0 is not a place the reader stopped at, it is where a board opens.
    expect(row).not.toHaveTextContent("at ply");
  });

  it("names a board that is nobody's game for what it is", async () => {
    await saveAnalysis(save("a1", [[[], ["e4"]]]));

    await renderScreen();

    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "Analysis board",
    );
  });

  it("names one begun from a real game by its players", async () => {
    const tree = grow([[[], ["e4", "e5"]]]);
    await saveAnalysis(
      savedAnalysisOf(
        "a1",
        { ...tree, headers: { White: "Carlsen", Black: "Nakamura" } },
        [],
        DEFAULT_ANALYSIS_SETTINGS,
        "white",
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    );

    await renderScreen();

    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "Carlsen – Nakamura",
    );
  });

  it("says so in Hebrew too, without a key falling through", async () => {
    await saveAnalysis(save("a1", [[[], ["e4"]]]));
    await i18n.changeLanguage("he");

    await renderScreen();

    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent(
      "לוח ניתוח",
    );
  });
});

describe("Saved analyses — where a row goes", () => {
  beforeEach(async () => {
    await saveAnalysis(save("a1", [[[], ["e4", "e5", "Nf3"]]], ["e4", "e5"]));
  });

  it("opens it on the Analysis Board, by its id — its one destination", async () => {
    await renderScreen();

    expect(screen.getByTestId("saved-analyses-open-a1")).toHaveAttribute(
      "href",
      "/tools/analysis?analysis=a1",
    );
    // No hand-off to Play with Engine, and no delete of its own.
    expect(screen.queryByTestId("saved-analyses-loadpgn-a1")).toBeNull();
    expect(screen.queryByTestId("saved-analyses-play-a1")).toBeNull();
    expect(screen.queryByTestId("saved-analyses-remove-a1")).toBeNull();
  });

  it("deletes the picks in bulk, after asking, and the list follows", async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.click(
      within(screen.getByTestId("saved-analyses-select-a1")).getByRole("checkbox"),
    );
    await user.click(screen.getByTestId("saved-analyses-delete"));
    expect(screen.getByTestId("saved-analyses-delete-title")).toHaveTextContent(
      "Delete 1 analysis?",
    );
    await user.click(screen.getByTestId("saved-analyses-delete-confirm"));

    await waitFor(() =>
      expect(screen.queryByTestId("saved-analyses-item-a1")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("saved-analyses-empty")).toBeInTheDocument();
  });

  it("offers a New button to the plain board view, with no query params", async () => {
    await renderScreen();

    // The board left the sidebar (CTA-58) — this button is how it is reached.
    expect(screen.getByTestId("saved-analyses-new")).toHaveAttribute(
      "href",
      "/tools/analysis",
    );
  });
});

describe("Saved analyses — a record that will not read", () => {
  it("still lists it — nothing to open, but it can be picked (to delete or export)", async () => {
    await saveAnalysis({ ...save("a1", [[[], ["e4"]]]), pgn: "1. Zz9" });

    await renderScreen();

    const row = screen.getByTestId("saved-analyses-item-a1");
    expect(row).toHaveTextContent("This analysis could not be read.");
    expect(screen.queryByTestId("saved-analyses-open-a1")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-analyses-select-a1")).toBeInTheDocument();
  });
});

describe("Saved analyses — the board view", () => {
  const showBoards = async (size: "compact" | "comfortable" = "compact") =>
    userEvent.click(screen.getByTestId(`saved-analyses-view-${size}`));

  it("opens on the list, and switches to boards when asked", async () => {
    await saveAnalysis(save("a1", [[[], ["e4"]]]));

    await renderScreen();
    expect(screen.getByTestId("saved-analyses-body")).toBeInTheDocument();

    await showBoards();

    expect(screen.getByTestId("saved-analyses-grid")).toHaveStyle({
      gridTemplateColumns: cardSizeTrack("compact"),
    });
    expect(screen.getByTestId("board-saved-analyses-preview-a1")).toBeInTheDocument();
  });

  it("previews the position the reader was standing on", async () => {
    await saveAnalysis(save("a1", [[[], ["e4", "e5", "Nf3"]]], ["e4"]));

    await renderScreen();
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
    await saveAnalysis(save("a1", [[[], ["e4"]]], [], "black"));

    await renderScreen();
    await showBoards();

    expect(screen.getByTestId("board-saved-analyses-preview-a1")).toHaveAttribute(
      "data-orientation",
      "black",
    );
  });

  it("names the opening the mainline reached, and only when the book knows it", async () => {
    await saveAnalysis(save("a1", [[[], ["e4", "e5"]]]));
    await saveAnalysis(save("a2", [[[], ["d4", "d5"]]]));

    await renderScreen();
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
    await saveAnalysis({ ...save("a1", [[[], ["e4"]]]), pgn: "1. Zz9" });

    await renderScreen();
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
  it("says where the analyses are kept", async () => {
    await renderScreen();

    expect(screen.getByTestId("saved-analyses-storage-note")).toHaveTextContent(
      "this browser only",
    );
  });
});

describe("Saved analyses — named, and filed in folders (CTA-73)", () => {
  it("names a row by the record's name", async () => {
    await saveAnalysis({ ...save("a1", [[[], ["e4"]]]), name: "My Scotch" });
    await renderScreen();
    expect(screen.getByTestId("saved-analyses-item-a1")).toHaveTextContent("My Scotch");
  });

  it("lists the folders first, and opens one from ?folder= with its breadcrumb", async () => {
    const folder = (await createAnalysisFolder("Openings", null))!;
    await saveAnalysis({ ...save("inside", [[[], ["e4"]]]), folderId: folder.id });
    await saveAnalysis(save("outside", [[[], ["d4"]]]));

    const { unmount } = await renderScreen();
    expect(screen.getByTestId(`saved-analyses-folder-${folder.id}`)).toHaveTextContent(
      "1 analysis",
    );
    expect(screen.getByTestId("saved-analyses-item-outside")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-analyses-item-inside")).toBeNull();
    unmount();

    await renderScreen(`/tools/analysis/saved?folder=${folder.id}`);
    expect(screen.getByTestId("saved-analyses-breadcrumb")).toHaveTextContent("Openings");
    expect(screen.getByTestId("saved-analyses-item-inside")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-analyses-item-outside")).toBeNull();
  });

  it("creates a folder where the reader stands", async () => {
    const user = userEvent.setup();
    await saveAnalysis(save("a1", [[[], ["e4"]]]));
    await renderScreen();

    await user.click(screen.getByTestId("saved-analyses-new-folder"));
    await user.type(screen.getByTestId("analysis-folder-name-input"), "Sicilian");
    await user.click(screen.getByTestId("analysis-folder-name-save"));
    await waitFor(() => expect(analysisFoldersSnapshot()).toHaveLength(1));
    const [folder] = analysisFoldersSnapshot() ?? [];
    expect(folder).toMatchObject({ name: "Sicilian", parentId: null });
    expect(screen.getByTestId(`saved-analyses-folder-${folder.id}`)).toBeInTheDocument();
  });

  it("has a checkbox on every card too, and keeps the picks across a view switch", async () => {
    const user = userEvent.setup();
    await saveAnalysis(save("a1", [[[], ["e4"]]]));
    await renderScreen();

    await user.click(
      within(screen.getByTestId("saved-analyses-select-a1")).getByRole("checkbox"),
    );
    await user.click(screen.getByTestId("saved-analyses-view-compact"));
    expect(
      within(screen.getByTestId("saved-analyses-select-a1")).getByRole("checkbox"),
    ).toBeChecked();
    expect(screen.getByTestId("saved-analyses-selected-count")).toHaveTextContent("1 selected");
  });

  it("links every analysis to its settings", async () => {
    await saveAnalysis(save("a1", [[[], ["e4"]]]));
    await renderScreen();
    expect(screen.getByTestId("saved-analyses-settings-a1")).toHaveAttribute(
      "href",
      "/tools/analysis/saved/a1/settings",
    );
  });

  it("deletes a folder keeping its analyses, after asking", async () => {
    const user = userEvent.setup();
    const folder = (await createAnalysisFolder("Old", null))!;
    await saveAnalysis({ ...save("a1", [[[], ["e4"]]]), folderId: folder.id });
    await renderScreen();

    await user.click(screen.getByTestId(`saved-analyses-folder-delete-${folder.id}`));
    expect(screen.getByTestId("analysis-folder-delete-counts")).toHaveTextContent(
      "1 analyses",
    );
    await user.click(screen.getByTestId("analysis-folder-delete-confirm"));
    await waitFor(() => expect(findSavedAnalysis("a1")?.folderId).toBeNull());
    expect(analysisFoldersSnapshot()).toEqual([]);
    expect(findSavedAnalysis("a1")?.folderId).toBeNull();
    expect(screen.getByTestId("saved-analyses-item-a1")).toBeInTheDocument();
  });

  it("keeps picks across folders, select-all adding the rows on screen", async () => {
    const user = userEvent.setup();
    const folder = (await createAnalysisFolder("F", null))!;
    await saveAnalysis({ ...save("in", [[[], ["e4"]]]), folderId: folder.id });
    await saveAnalysis(save("out", [[[], ["d4"]]]));
    await renderScreen();

    const box = (testId: string) => within(screen.getByTestId(testId)).getByRole("checkbox");
    await user.click(box("saved-analyses-select-out"));
    await user.click(screen.getByTestId(`saved-analyses-folder-open-${folder.id}`));
    await user.click(box("saved-analyses-select-all"));
    expect(screen.getByTestId("saved-analyses-selected-count")).toHaveTextContent("2 selected");
  });
});

describe("Saved analyses — a folder of thousands (CTA-77)", () => {
  it("shows a page at a time, and keeps counting and picking the whole folder", async () => {
    const user = userEvent.setup();
    const record = save("x", [[[], ["e4"]]]);
    const total = SAVED_ANALYSES_PAGE + 12;
    await addAnalyses(
      Array.from({ length: total }, (_, index) => ({ ...record, id: `r${index}`, name: `R${index}` })),
    );
    await renderScreen();

    expect(screen.getByTestId("saved-analyses-count")).toHaveTextContent(`Analyses: ${total}`);
    expect(screen.getAllByTestId(/^saved-analyses-item-/)).toHaveLength(SAVED_ANALYSES_PAGE);
    expect(screen.getByTestId("saved-analyses-item-r0")).toBeInTheDocument();

    await user.click(within(screen.getByTestId("saved-analyses-pagination")).getByText("2"));
    expect(screen.getAllByTestId(/^saved-analyses-item-/)).toHaveLength(12);
    expect(screen.getByTestId(`saved-analyses-item-r${total - 1}`)).toBeInTheDocument();

    // Select-all takes the whole folder, not the page.
    await user.click(within(screen.getByTestId("saved-analyses-select-all")).getByRole("checkbox"));
    expect(screen.getByTestId("saved-analyses-selected-count")).toHaveTextContent(`${total} selected`);
  });

  it("has no pager for a folder that fits one page", async () => {
    await saveAnalysis(save("a1", [[[], ["e4"]]]));
    await renderScreen();
    expect(screen.queryByTestId("saved-analyses-pagination")).toBeNull();
  });
});

describe("the new-analysis form (CTA-87)", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  // The editor's e2→e4 places a piece, it does not make a move: White still to move.
  const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";

  /** Drag a piece in the form's editor, the way the provider reports it. */
  const editorDrag = (pieceType: string, from: string, to: string | null) =>
    act(() => {
      (editorBoard.options!.onPieceDrop as (args: unknown) => boolean)({
        piece: { pieceType, isSparePiece: false, position: from },
        sourceSquare: from,
        targetSquare: to,
      });
    });

  const startHref = () => screen.getByTestId("new-analysis-start").getAttribute("href") ?? "";

  it("hosts the shared editor, and Start opens the plain board for the standard start", async () => {
    await renderScreen();
    expect(screen.getByTestId("new-analysis-editor")).toBeInTheDocument();
    expect(screen.getByTestId("board-editor")).toHaveAttribute("data-position", START);
    const start = screen.getByTestId("new-analysis-start");
    expect(start).toBeEnabled();
    expect(startHref()).toBe("/tools/analysis");
    // What the panel said before the form came is kept, under Start.
    expect(screen.getByTestId("saved-analyses-storage-note")).toBeInTheDocument();
  });

  it("sends an edited position along as ?fen=", async () => {
    await renderScreen();
    editorDrag("wP", "e2", "e4");
    expect(startHref()).toBe(`/tools/analysis?fen=${encodeURIComponent(AFTER_E4)}`);
  });

  it("switches Start off, and says why, while the position cannot be analyzed", async () => {
    await renderScreen();
    editorDrag("wK", "e1", null); // dragged off the board: the king is gone

    const start = screen.getByTestId("new-analysis-start");
    expect(start).toBeDisabled();
    expect(start).not.toHaveAttribute("href");
    expect(screen.getByTestId("new-analysis-illegal")).toHaveTextContent("White has no king.");

    // Back to the standard start, and Start is back.
    fireEvent.click(screen.getByTestId("new-analysis-editor-reset-start"));
    expect(screen.queryByTestId("new-analysis-illegal")).toBeNull();
    expect(screen.getByTestId("new-analysis-start")).toBeEnabled();
    expect(startHref()).toBe("/tools/analysis");
  });
});
