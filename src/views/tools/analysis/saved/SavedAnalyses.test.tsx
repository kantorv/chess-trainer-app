import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { useEffect, type ReactNode } from "react";
import { Chess } from "chess.js";

import i18n from "../../../../i18n";
import AppThemeWithLang from "../../../../theme/AppThemeWithLang";
import { analysisHandOffOf } from "../../../../lib/analysisHandOff";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../../../lib/analysisSettings";
import {
  addMove,
  emptyTree,
  fenAtNode,
  nodeAtSanPath,
  treeToPgn,
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
  savedAnalysesSnapshot,
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

/*
  Where navigation has taken the screen — the form's Load hands a whole game
  to the Analysis Board as location state (CTA-96), which the probe records,
  as `OpeningsBoard.test.tsx`'s does. The screen is mounted without routes, so
  a navigation changes the recorded location and leaves the screen mounted.
*/
const where = vi.hoisted(() => ({
  current: null as { pathname: string; search: string; state: unknown } | null,
}));
const Where = () => {
  const location = useLocation();
  useEffect(() => {
    where.current = {
      pathname: location.pathname,
      search: location.search,
      state: location.state,
    };
  }, [location]);
  return null;
};

/** Mount the screen, and wait for the store's first read — the list's first frame. */
const renderScreen = async (entry = "/tools/analysis/saved") => {
  const rendered = render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <SavedAnalyses />
          <RightPanelOutlet />
          <Where />
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

  /*
    Load a game (CTA-96): the Load tab's route hosted in the form, its FEN
    form beside its PGN one — the form's one load place, the editor offering
    no tabs of its own. A whole game (several merged or split exactly as on
    the board's own Load tab) is handed to the Analysis Board as location
    state; a PGN that is really a position — a single move, or none — and a
    pasted FEN set the editor up, which Start then carries.
  */
  describe("loads a PGN as a whole game (CTA-96)", () => {
    const ONE_GAME = '[Event "Solo"]\n\n1. e4 e5 (1... c5 {sicilian}) 2. Nf3 *\n';
    const TWO_GAMES = '[Event "One"]\n\n1. e4 e5 *\n\n[Event "Two"]\n\n1. d4 d5 *\n';
    // The position after a real 1. e4 — Black to answer it, so a load of it
    // turns the editor's board.
    const AFTER_MOVE_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const KINGS = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";

    const pasteAndLoad = async (text: string) => {
      fireEvent.change(screen.getByTestId("analysis-load-paste"), {
        target: { value: text },
      });
      fireEvent.click(screen.getByTestId("analysis-load-text"));
      await act(async () => {
        await Promise.resolve();
      });
    };

    const loadFen = async (fen: string) => {
      fireEvent.change(screen.getByTestId("analysis-load-fen-input"), {
        target: { value: fen },
      });
      fireEvent.click(screen.getByTestId("analysis-load-fen"));
      await act(async () => {
        await Promise.resolve();
      });
    };

    const editorPosition = () =>
      screen.getByTestId("board-editor").getAttribute("data-position");

    it("offers one load place — the PGN and the FEN of the Load route, no editor tabs", async () => {
      await renderScreen();
      expect(screen.getByTestId("analysis-load-paste")).toBeInTheDocument();
      expect(screen.getByTestId("analysis-load-pick")).toBeInTheDocument();
      // The FEN input lives here now: the Load section is the form's one load
      // place, and the editor — its fields always shown — offers no tabs at all.
      expect(screen.getByTestId("analysis-load-fen-input")).toBeInTheDocument();
      expect(screen.queryByTestId("new-analysis-editor-tab-position")).toBeNull();
      expect(screen.queryByTestId("new-analysis-editor-tab-fen")).toBeNull();
      expect(screen.queryByTestId("new-analysis-editor-tab-pgn")).toBeNull();
      expect(screen.getByTestId("new-analysis-editor-position-fields")).toBeInTheDocument();
    });

    it.each([{ how: "paste" as const }, { how: "file" as const }])(
      "opens one game on the Analysis Board as a new unsaved analysis, facing White ($how)",
      async ({ how }) => {
        await renderScreen();
        if (how === "paste") {
          await pasteAndLoad(ONE_GAME);
        } else {
          fireEvent.change(screen.getByTestId("analysis-load-input"), {
            target: {
              files: [new File([ONE_GAME], "game.pgn", { type: "application/x-chess-pgn" })],
            },
          });
          await act(async () => {
            await Promise.resolve();
          });
        }

        expect(where.current?.pathname).toBe("/tools/analysis");
        // The whole game handed over as location state: a game does not turn the board.
        const handOff = analysisHandOffOf(where.current?.state);
        expect(handOff?.orientation).toBe("white");
        // The side line and its comment ride along — not just the final position.
        expect(nodeAtSanPath(handOff!.tree, ["e4", "c5"])).not.toBeNull();
        expect(treeToPgn(handOff!.tree)).toContain("sicilian");
      },
    );

    it("a PGN of a single move sets the editor up from the position after it", async () => {
      await renderScreen();
      await pasteAndLoad("1. e4 *");

      // Not a game: the editor takes the position after the move — turned to
      // the side that has to answer it — and Start carries it. Nothing
      // navigated, and there is no "loaded" line to say.
      expect(editorPosition()).toBe(AFTER_MOVE_E4);
      expect(screen.getByTestId("board-editor")).toHaveAttribute(
        "data-orientation",
        "black",
      );
      expect(startHref()).toBe(`/tools/analysis?fen=${encodeURIComponent(AFTER_MOVE_E4)}`);
      expect(where.current?.pathname).toBe("/tools/analysis/saved");
      expect(screen.queryByTestId("analysis-load-done")).toBeNull();
    });

    it("a PGN of a position and no moves sets the editor up from it", async () => {
      await renderScreen();
      await pasteAndLoad(`[SetUp "1"]\n[FEN "${KINGS}"]\n*`);

      expect(editorPosition()).toBe(KINGS);
      expect(startHref()).toBe(`/tools/analysis?fen=${encodeURIComponent(KINGS)}`);
      expect(where.current?.pathname).toBe("/tools/analysis/saved");
    });

    it("the FEN field sets the editor up too, and a bad one says so and goes nowhere", async () => {
      await renderScreen();
      await loadFen("not a fen");

      expect(screen.getByTestId("analysis-load-fen-problem")).toBeInTheDocument();
      expect(editorPosition()).toBe(START);
      expect(where.current?.pathname).toBe("/tools/analysis/saved");

      await loadFen(AFTER_MOVE_E4);

      expect(editorPosition()).toBe(AFTER_MOVE_E4);
      expect(screen.queryByTestId("analysis-load-fen-problem")).toBeNull();
      expect(startHref()).toBe(`/tools/analysis?fen=${encodeURIComponent(AFTER_MOVE_E4)}`);
    });

    it("asks merge or split for several games, and a merge hands one tree to the board", async () => {
      await renderScreen();
      await pasteAndLoad(TWO_GAMES);

      expect(screen.getByTestId("analysis-choice")).toBeInTheDocument();
      expect(where.current?.pathname).toBe("/tools/analysis/saved"); // nothing navigated yet

      fireEvent.click(screen.getByTestId("analysis-choice-merge"));
      await act(async () => {
        await Promise.resolve();
      });

      expect(where.current?.pathname).toBe("/tools/analysis");
      const handOff = analysisHandOffOf(where.current?.state);
      // One merged tree: the first game's line is the mainline, the second a side line.
      expect(nodeAtSanPath(handOff!.tree, ["e4", "e5"])).not.toBeNull();
      expect(nodeAtSanPath(handOff!.tree, ["d4", "d5"])).not.toBeNull();
    });

    it("a split saves one analysis per game into a new folder and lands in it", async () => {
      await renderScreen();
      await pasteAndLoad(TWO_GAMES);
      fireEvent.click(screen.getByTestId("analysis-choice-split"));

      await waitFor(() => expect(where.current?.search).toMatch(/^\?folder=/));
      const folderId = new URLSearchParams(where.current!.search).get("folder")!;
      const folder = (analysisFoldersSnapshot() ?? []).find((f) => f.id === folderId);
      // Named after the text, as the Load tab's split names it.
      expect(folder?.name).toBe("One");
      expect(
        (savedAnalysesSnapshot() ?? []).filter((a) => a.folderId === folderId),
      ).toHaveLength(2);
    });

    it("says so, and goes nowhere, for a PGN that will not read", async () => {
      await renderScreen();
      await pasteAndLoad("this is not a pgn");

      expect(screen.getByTestId("analysis-load-problem")).toHaveTextContent(
        "could not be read as PGN",
      );
      expect(where.current?.pathname).toBe("/tools/analysis/saved");
      expect(savedAnalysesSnapshot() ?? []).toEqual([]);
    });
  });
});
