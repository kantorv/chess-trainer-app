import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import i18n from "../../i18n";
import { analysisHandOffOf } from "../../lib/analysisHandOff";
import { mainline, treeToPgn } from "../../lib/gameTree";
import { HOVERED_MOVE_ARROW_COLOR, KNOWN_MOVE_ARROW_COLOR } from "../../lib/openings";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import { NEXT_MOVE_ARROW_COLOR } from "../tools/analysis/nextMoveArrows";

vi.mock("../../lib/engine", async () => ({
  default: (await import("../dev/devTestHarness")).FakeEngine,
}));

vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../dev/devTestHarness");
  return reactChessboardMock();
});

const { START, AFTER_E4, AFTER_D4, AFTER_E4_C5 } = vi.hoisted(() => ({
  START: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  AFTER_E4: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  AFTER_D4: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
  AFTER_E4_C5: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
}));

/*
  A book of three moves, so the tests say what the screen does with the
  book rather than what eco.json holds (~3 MB, too slow to load per test).
*/
vi.mock("../../lib/openings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/openings")>();
  const entry = (eco: string, name: string) => ({ eco, name, moves: "" });
  const BOOK: Record<string, unknown[]> = {
    [START]: [
      { san: "e4", from: "e2", to: "e4", fen: AFTER_E4, opening: entry("B00", "King's Pawn Game") },
      { san: "d4", from: "d2", to: "d4", fen: AFTER_D4, opening: entry("A40", "Queen's Pawn Game") },
    ],
    [AFTER_E4]: [
      { san: "c5", from: "c7", to: "c5", fen: AFTER_E4_C5, opening: entry("B20", "Sicilian Defense") },
    ],
  };
  return {
    ...actual,
    loadOpeningBook: () => Promise.resolve({}),
    getPositionBook: () => ({}),
    findOpening: () => undefined,
    knownMoveOpenings: (fen: string) => BOOK[fen] ?? [],
  };
});

import OpeningsBoard from "./OpeningsBoard";

/*
  The Openings explorer (CTA-78): a v2 board — its shared square and panel
  are asserted with the other v2 boards (`devBoards.test.tsx`,
  `devPanelPropagation.test.tsx`) — with the book beside it, nothing saved,
  and the whole tree handed on to the Analysis Board.
*/

/** Where the router is, and the state it carries — what a hand-off left behind. */
let lastState: unknown = null;
function Where() {
  const location = useLocation();
  useEffect(() => {
    lastState = location.state;
  }, [location.state]);
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}
const where = () => screen.getByTestId("where").textContent ?? "";

const mount = (entry = "/openings") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/openings" element={<OpeningsBoard />} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
          <Where />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const drag = (from: string, to: string) => {
  let accepted = false;
  act(() => {
    accepted = boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });
  return accepted;
};

const openTab = (id: string) => fireEvent.click(screen.getByTestId(`openings-panel-tab-${id}`));

/** The book has loaded (a promise) once its rows are on screen. */
const bookShows = (san: string) =>
  waitFor(() => expect(screen.getByTestId(`openings-book-move-${san}`)).toBeInTheDocument());

const arrowTo = (to: string) => boardOptions().arrows?.find((arrow) => arrow.endSquare === to);

beforeEach(async () => {
  localStorage.clear();
  FakeEngine.reset();
  lastState = null;
  await i18n.changeLanguage("en");
});

describe("the Openings explorer — the board", () => {
  it("opens on the standard start, facing White, with the book tab first", () => {
    mount();
    expect(boardOptions().id).toBe("openings");
    expect(boardOptions().position).toBe(START);
    expect(boardOptions().boardOrientation).toBe("white");
    expect(screen.getByTestId("openings-book")).toBeInTheDocument();
  });

  it("has the Analysis Board's tabs beside the book, and nothing that saves", () => {
    mount();
    for (const id of ["book", "moves", "map", "load", "export", "engine"]) {
      expect(screen.getByTestId(`openings-panel-tab-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("openings-play")).toBeInTheDocument();
    expect(screen.queryByTestId("openings-save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("openings-changes")).not.toBeInTheDocument();
  });

  it("opens a ?fen= position facing the side to move, and ignores one nobody can read", () => {
    const { unmount } = mount(`/openings?fen=${encodeURIComponent(AFTER_E4)}`);
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(boardOptions().boardOrientation).toBe("black");
    unmount();

    mount("/openings?fen=not-a-fen");
    expect(boardOptions().position).toBe(START);
  });

  it("writes every step back as ?at=, and replays such a link on arrival", () => {
    const { unmount } = mount();
    drag("e2", "e4");
    drag("c7", "c5");
    expect(where()).toBe("/openings?at=e4%2Cc5");
    unmount();

    mount("/openings?at=e4,c5");
    expect(boardOptions().position).toBe(AFTER_E4_C5);
  });

  it("keeps ?fen= in the link while the tree starts from that position", () => {
    mount(`/openings?fen=${encodeURIComponent(AFTER_E4)}`);
    drag("c7", "c5");
    expect(where()).toBe(`/openings?fen=${encodeURIComponent(AFTER_E4).replace(/%20/g, "+")}&at=c5`);
  });
});

describe("the Openings explorer — the book", () => {
  it("lists the book's continuations and draws an arrow for each", async () => {
    mount();
    await bookShows("e4");
    expect(screen.getByTestId("openings-book-move-d4")).toHaveTextContent("Queen's Pawn Game");
    expect(arrowTo("e4")?.color).toBe(KNOWN_MOVE_ARROW_COLOR);
    expect(arrowTo("d4")?.color).toBe(KNOWN_MOVE_ARROW_COLOR);
  });

  it("plays a book move on a click, and lists what follows it", async () => {
    mount();
    await bookShows("e4");
    fireEvent.click(screen.getByTestId("openings-book-move-e4"));
    expect(boardOptions().position).toBe(AFTER_E4);
    await bookShows("c5");
  });

  it("branches from an earlier position — a book move there is a side line", async () => {
    mount();
    await bookShows("e4");
    fireEvent.click(screen.getByTestId("openings-book-move-e4"));
    act(() => {
      screen.getByTestId("board-control-first").click();
    });
    fireEvent.click(screen.getByTestId("openings-book-move-d4"));
    expect(boardOptions().position).toBe(AFTER_D4);

    openTab("export");
    expect((screen.getByTestId("analysis-export-pgn") as HTMLTextAreaElement).value).toContain(
      "1. e4 (1. d4)",
    );
  });

  it("recolours the hovered move's arrow, and draws a move the tree has only once", async () => {
    mount();
    await bookShows("e4");
    fireEvent.click(screen.getByTestId("openings-book-move-e4"));
    act(() => {
      screen.getByTestId("board-control-first").click();
    });

    // e4 is the tree's mainline now: one arrow, the tree's.
    expect(boardOptions().arrows?.filter((arrow) => arrow.endSquare === "e4")).toEqual([
      { startSquare: "e2", endSquare: "e4", color: NEXT_MOVE_ARROW_COLOR },
    ]);

    fireEvent.mouseEnter(screen.getByTestId("openings-book-move-d4"));
    expect(arrowTo("d4")?.color).toBe(HOVERED_MOVE_ARROW_COLOR);
    fireEvent.mouseLeave(screen.getByTestId("openings-book-move-d4"));
    expect(arrowTo("d4")?.color).toBe(KNOWN_MOVE_ARROW_COLOR);
  });
});

describe("the Openings explorer — hand-offs", () => {
  it("hands the whole tree to the Analysis Board, with the position and the side", async () => {
    mount();
    drag("e2", "e4");
    drag("e7", "e5");
    act(() => {
      screen.getByTestId("board-control-previous").click();
    });
    drag("c7", "c5");
    act(() => {
      screen.getByTestId("board-control-flip").click();
    });

    fireEvent.click(screen.getByTestId("openings-open-analysis"));

    await waitFor(() => expect(where()).toBe("/tools/analysis?at=e4%2Cc5"));
    const handOff = analysisHandOffOf(lastState);
    expect(handOff?.orientation).toBe("black");
    expect(treeToPgn(handOff!.tree)).toContain("1. e4 e5 (1... c5)");
    expect(mainline(handOff!.tree).map((node) => node.san)).toEqual(["e4", "e5"]);
  });

  it("hands the position on screen to Play with Engine as ?fen=", async () => {
    mount();
    drag("e2", "e4");
    fireEvent.click(screen.getByTestId("openings-play-from-here"));
    await waitFor(() => expect(where()).toContain("/engine/play?fen="));
    expect(new URLSearchParams(where().split("?")[1]).get("fen")).toBe(AFTER_E4);
  });
});

describe("the Openings explorer — the Load tab keeps nothing", () => {
  it("merges several games onto the board and offers no split", () => {
    mount();
    openTab("load");
    fireEvent.change(screen.getByTestId("analysis-load-paste"), {
      target: { value: '[Event "A"]\n\n1. e4 e5 *\n\n[Event "B"]\n\n1. e4 c5 *' },
    });
    fireEvent.click(screen.getByTestId("analysis-load-text"));

    expect(screen.queryByTestId("analysis-choice-split")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("analysis-choice-merge"));
    openTab("export");
    expect((screen.getByTestId("analysis-export-pgn") as HTMLTextAreaElement).value).toContain(
      "1. e4 e5 (1... c5)",
    );
  });
});
