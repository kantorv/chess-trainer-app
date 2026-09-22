import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import i18n from "../../../i18n";
import { analysisHandOffState } from "../../../lib/analysisHandOff";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../../lib/analysisSettings";
import { parsePgnTree } from "../../../lib/pgn";
import { savedAnalysisOf, type SavedAnalysis } from "../../../lib/savedAnalyses";
import { analysisFoldersSnapshot, createAnalysisFolder } from "../../../lib/savedAnalysisFolderStore";
import {
  findSavedAnalysis,
  resetSavedAnalysisStore,
  SAVED_ANALYSES_STORAGE_KEY,
  saveAnalysis,
  savedAnalysesSnapshot,
} from "../../../lib/savedAnalysisStore";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { boardOptions, FakeEngine } from "../../dev/devTestHarness";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";

vi.mock("../../../lib/engine", async () => ({
  default: (await import("../../dev/devTestHarness")).FakeEngine,
}));

vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../../dev/devTestHarness");
  return reactChessboardMock();
});

vi.mock("../../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../../dev/devTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../../lib/openings")>,
  );
});

import AnalysisBoard from "./AnalysisBoard";

/*
  The Analysis Board, v2 (CTA-73): the arrivals, the explicit save (a new
  board's dialog, and Update / Save as copy / Discard over a record), the Load
  tab's one game, merge and split, the Export tab's options and the `?at=`
  link. The shared panel and square are asserted with the dev boards'
  (`devBoards.test.tsx`, `devPanelPropagation.test.tsx`), which include this
  screen.
*/

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

/** Where the router is — what a hand-off or a written link left behind. */
function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

const mount = (
  entry: string | { pathname: string; search?: string; state?: unknown } = "/tools/analysis",
) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/tools/analysis" element={<AnalysisBoard />} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
          <Where />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const where = () => screen.getByTestId("where").textContent ?? "";

/** Drag a piece, the way the board would report it. */
const drag = (from: string, to: string) => {
  let accepted = false;
  act(() => {
    accepted = boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });
  return accepted;
};

/** End the search for the position on screen with a line and a bestmove, as the wrapper would. */
const engineSearches = (pv: string) => {
  const engine = FakeEngine.latest();
  const fen = engine.lastSearch;
  act(() => {
    engine.say({ fen, uciMessage: "info", depth: 12, multipv: 1, positionEvaluation: "20", pv });
  });
  act(() => {
    engine.say({ fen, uciMessage: "bestmove", bestMove: pv.split(" ")[0] });
  });
};

const openTab = (id: string) => fireEvent.click(screen.getByTestId(`analysis-panel-tab-${id}`));

/** A saved analysis of `pgn`, standing at `path`, written to the store. */
const stored = async (
  id: string,
  pgn: string,
  path: string[] = [],
  extra: Partial<SavedAnalysis> = {},
): Promise<SavedAnalysis> => {
  const record = {
    ...savedAnalysisOf(id, parsePgnTree(pgn), path, DEFAULT_ANALYSIS_SETTINGS, "white"),
    ...extra,
  };
  await saveAnalysis(record);
  return record;
};

/** The saved analyses as read — `[]` before the first read. */
const listed = () => savedAnalysesSnapshot() ?? [];

beforeEach(async () => {
  localStorage.clear();
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

describe("the Analysis Board's arrivals", () => {
  it("opens a ?fen= position facing the side to move", () => {
    mount(`/tools/analysis?fen=${encodeURIComponent(AFTER_E4)}`);
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(boardOptions().boardOrientation).toBe("black");
  });

  it("opens a ?game= at its ?move=, facing White, and writes ?at= in the move's place", async () => {
    await stored("g1", "1. e4 e5 2. Nf3 *");
    mount("/tools/analysis?game=analysis/saved/g1&move=2");
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    expect(boardOptions().boardOrientation).toBe("white");
    expect(where()).toContain("at=e4%2Ce5");
    expect(where()).not.toContain("move=");
  });

  it("opens a Library game (?game=library/…) once its collection's games are read, at ?at=", async () => {
    mount("/tools/analysis?game=library/morphy/1&at=e4");
    // The shipped PGN chunk is fetched first; the board waits rather than open blank.
    expect(screen.getByTestId("analysis-loading")).toBeInTheDocument();
    await waitFor(() => expect(boardOptions().position).toBe(AFTER_E4));
    expect(boardOptions().boardOrientation).toBe("white");
    expect(screen.getByTestId("analysis-save")).not.toBeDisabled();
  });

  it("reopens a saved analysis where it was left, facing the way it faced", async () => {
    await stored("a1", "1. e4 e5 *", ["e4"], { orientation: "black", name: "Mine" });
    mount("/tools/analysis?analysis=a1");
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(boardOptions().boardOrientation).toBe("black");
    expect(screen.getByTestId("analysis-name")).toHaveTextContent("Mine");
    // Nothing changed yet: there is nothing to save.
    expect(screen.getByTestId("analysis-save")).toBeDisabled();
  });

  it("waits for the store's read before reopening, rather than calling the record missing", async () => {
    await stored("a1", "1. e4 e5 *", ["e4"], { name: "Mine" });
    resetSavedAnalysisStore(); // a reload: the record is in IndexedDB, nothing read yet
    mount("/tools/analysis?analysis=a1");
    expect(screen.getByTestId("analysis-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("analysis-name")).toHaveTextContent("Mine");
    expect(boardOptions().position).toBe(AFTER_E4);
  });

  it("reopens an analysis still in localStorage from before CTA-77, moving it over", async () => {
    const old = savedAnalysisOf("old", parsePgnTree("1. e4 e5 *"), ["e4", "e5"], DEFAULT_ANALYSIS_SETTINGS, "white");
    localStorage.setItem(SAVED_ANALYSES_STORAGE_KEY, JSON.stringify([{ ...old, name: "From before" }]));
    mount("/tools/analysis?analysis=old");
    expect(await screen.findByTestId("analysis-name")).toHaveTextContent("From before");
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    expect(localStorage.getItem(SAVED_ANALYSES_STORAGE_KEY)).toBeNull();
  });

  it("lets ?at= beat the record's own place — a permanent link", async () => {
    await stored("a1", "1. e4 e5 *", ["e4"]);
    mount("/tools/analysis?analysis=a1&at=e4,e5");
    expect(boardOptions().position).toBe(AFTER_E4_E5);
  });

  it("writes every step back as ?at=", () => {
    mount();
    drag("e2", "e4");
    expect(where()).toBe("/tools/analysis?at=e4");
    act(() => {
      screen.getByTestId("board-control-first").click();
    });
    expect(where()).toBe("/tools/analysis");
  });
});

describe("a whole tree handed over by the Openings explorer (CTA-78)", () => {
  const AFTER_E4_C5 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
  const handedOver = () =>
    mount({
      pathname: "/tools/analysis",
      search: "?at=e4,c5",
      state: analysisHandOffState(
        parsePgnTree("1. e4 e5 {The main line} (1... c5 2. Nf3) 2. Nf3 *"),
        "black",
      ),
    });

  it("opens the tree, side lines and comments, at ?at=, facing the way it was handed over", () => {
    handedOver();
    expect(boardOptions().position).toBe(AFTER_E4_C5);
    expect(boardOptions().boardOrientation).toBe("black");
    openTab("export");
    const pgn = (screen.getByTestId("analysis-export-pgn") as HTMLTextAreaElement).value;
    expect(pgn).toContain("{ The main line }");
    expect(pgn).toContain("(1... c5 2. Nf3)");
  });

  it("is a new board, not saved: Save names it, and a reload asks first", () => {
    handedOver();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByTestId("analysis-save"));
    expect(screen.getByTestId("analysis-save-name")).toBeInTheDocument();
    expect(listed()).toEqual([]);
  });

  it("ignores a location state that is not a hand-off", () => {
    mount({ pathname: "/tools/analysis", state: { analysisHandOff: { pgn: 3 } } });
    expect(boardOptions().position).toBe(START);
    expect(screen.getByTestId("analysis-save")).toBeDisabled();
  });
});

describe("saving a board that is not a record yet", () => {
  it("has nothing to save on a blank board", () => {
    mount();
    expect(screen.getByTestId("analysis-save")).toBeDisabled();
  });

  it("names it and files it through the dialog, and becomes that record", async () => {
    const folder = (await createAnalysisFolder("Openings", null))!;
    mount();
    drag("e2", "e4");
    fireEvent.click(screen.getByTestId("analysis-save"));

    fireEvent.change(screen.getByTestId("analysis-save-name"), {
      target: { value: "King's pawn" },
    });
    fireEvent.click(screen.getByTestId(`analysis-folder-picker-${folder.id}`));
    fireEvent.click(screen.getByTestId("analysis-save-confirm"));

    await waitFor(() => expect(listed()).toHaveLength(1));
    const [saved] = listed();
    expect(saved).toMatchObject({ name: "King's pawn", folderId: folder.id, path: ["e4"] });
    await waitFor(() => expect(where()).toBe(`/tools/analysis?analysis=${saved.id}&at=e4`));
    expect(screen.getByTestId("analysis-name")).toHaveTextContent("King's pawn");
    // Saved: nothing is left to save until the next change.
    expect(screen.getByTestId("analysis-save")).toBeDisabled();
  });

  it("asks before a reload loses a board with changes", () => {
    mount();
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);

    drag("e2", "e4");
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
  });
});

describe("the changes over a saved analysis", () => {
  const openStrip = () => {
    fireEvent.click(screen.getByTestId("analysis-save"));
    return screen.getByTestId("analysis-changes");
  };

  it("updates the record in place with the session's tree and place", async () => {
    await stored("a1", "1. e4 *", ["e4"], { name: "Mine" });
    mount("/tools/analysis?analysis=a1");
    drag("e7", "e5");

    const strip = openStrip();
    expect(within(strip).getByTestId("analysis-changes-summary")).toHaveTextContent(
      "1 move added",
    );
    // An analysis has no protection: Update is always there.
    expect(within(strip).queryByTestId("analysis-changes-settings")).toBeNull();
    fireEvent.click(within(strip).getByTestId("analysis-changes-update"));

    await waitFor(() => expect(screen.getByTestId("analysis-save")).toBeDisabled());
    expect(listed()).toHaveLength(1);
    expect(findSavedAnalysis("a1")).toMatchObject({ name: "Mine", path: ["e4", "e5"] });
    expect(findSavedAnalysis("a1")?.pgn).toContain("1. e4 e5");
    expect(screen.queryByTestId("analysis-changes")).toBeNull();
    expect(screen.getByTestId("analysis-save")).toBeDisabled();
  });

  it("saves a copy in the same folder and goes on in it, the original untouched", async () => {
    const folder = (await createAnalysisFolder("Mine", null))!;
    await stored("a1", "1. e4 *", ["e4"], { name: "Plan", folderId: folder.id });
    mount("/tools/analysis?analysis=a1");
    drag("e7", "e5");
    fireEvent.click(within(openStrip()).getByTestId("analysis-changes-copy"));

    await waitFor(() => expect(listed()).toHaveLength(2));
    const copy = listed().find((row) => row.id !== "a1")!;
    expect(copy).toMatchObject({ name: "Plan (copy)", folderId: folder.id });
    expect(copy.pgn).toContain("e5");
    expect(findSavedAnalysis("a1")?.pgn).not.toContain("e5");
    await waitFor(() => expect(where()).toContain(`analysis=${copy.id}`));
  });

  it("discards back to the record, on the last of its positions", async () => {
    await stored("a1", "1. e4 *", ["e4"]);
    mount("/tools/analysis?analysis=a1");
    drag("e7", "e5");
    drag("g1", "f3");
    fireEvent.click(within(openStrip()).getByTestId("analysis-changes-discard"));

    expect(boardOptions().position).toBe(AFTER_E4);
    expect(screen.getByTestId("analysis-save")).toBeDisabled();
    expect(findSavedAnalysis("a1")?.pgn).not.toContain("e5");
  });
});

describe("the Load tab", () => {
  const paste = (text: string) => {
    openTab("load");
    fireEvent.change(screen.getByTestId("analysis-load-paste"), { target: { value: text } });
    fireEvent.click(screen.getByTestId("analysis-load-text"));
  };

  it("puts one game on the board as a new, unsaved analysis", async () => {
    await stored("a1", "1. d4 *", ["d4"], { name: "Old" });
    mount("/tools/analysis?analysis=a1");
    paste('[White "Tal"]\n[Black "Koblents"]\n\n1. e4 e5 *');

    // A game does not turn the board, and opens at its start.
    expect(boardOptions().position).toBe(START);
    expect(screen.getByTestId("analysis-name")).toHaveTextContent("Tal – Koblents");
    expect(where()).not.toContain("analysis=");
    // Not the old record's: Save asks for a name.
    fireEvent.click(screen.getByTestId("analysis-save"));
    expect(screen.getByTestId("analysis-save-name")).toHaveValue("Tal – Koblents");
    expect(findSavedAnalysis("a1")?.pgn).not.toContain("e4");
  });

  it("merges several games into one tree on the board", () => {
    mount();
    paste('[Event "A"]\n\n1. e4 e5 *\n\n[Event "B"]\n\n1. e4 c5 *');
    expect(screen.getByTestId("analysis-choice")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("analysis-choice-merge"));

    openTab("export");
    expect((screen.getByTestId("analysis-export-pgn") as HTMLTextAreaElement).value).toContain(
      "1. e4 e5 (1... c5)",
    );
    expect(listed()).toEqual([]);
  });

  it("splits several games into a new folder of saved analyses, and goes there", async () => {
    mount();
    paste('[Event "Two lines"]\n\n1. e4 e5 *\n\n[Event "Two lines"]\n\n1. d4 d5 *');
    fireEvent.click(screen.getByTestId("analysis-choice-split"));

    await waitFor(() => expect(where()).toContain("/tools/analysis/saved?folder="));
    const [folder] = analysisFoldersSnapshot() ?? [];
    expect(folder.name).toBe("Two lines");
    expect(listed().map((row) => row.folderId)).toEqual([folder.id, folder.id]);
    expect(where()).toBe(`/tools/analysis/saved?folder=${folder.id}`);
  });

  it("sets a FEN up, facing the side to move", () => {
    mount();
    openTab("load");
    fireEvent.change(screen.getByTestId("analysis-load-fen-input"), {
      target: { value: AFTER_E4 },
    });
    fireEvent.click(screen.getByTestId("analysis-load-fen"));
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(boardOptions().boardOrientation).toBe("black");
  });

  it("says what is wrong with a text it cannot read", () => {
    mount();
    paste("this is not chess");
    expect(screen.getByTestId("analysis-load-problem")).toBeInTheDocument();
  });
});

describe("the Export tab", () => {
  it("copies the FEN, and the PGN with or without comments, NAGs and side lines", async () => {
    await stored("a1", "1. e4 $1 {Best by test.} e5 (1... c5) *", ["e4"]);
    mount("/tools/analysis?analysis=a1");
    openTab("export");

    expect(screen.getByTestId("analysis-export-fen")).toHaveValue(AFTER_E4);
    const pgn = () => (screen.getByTestId("analysis-export-pgn") as HTMLTextAreaElement).value;
    expect(pgn()).toContain("{ Best by test. }");
    expect(pgn()).toContain("$1");
    expect(pgn()).toContain("(1... c5)");

    fireEvent.click(screen.getByTestId("analysis-export-comments"));
    expect(pgn()).not.toContain("Best by test");
    fireEvent.click(screen.getByTestId("analysis-export-nags"));
    expect(pgn()).not.toContain("$1");
    fireEvent.click(screen.getByTestId("analysis-export-variations"));
    expect(pgn()).not.toContain("c5");
  });
});

describe("the variations explorer on the Analysis Board", () => {
  it("edits the tree from the move menu, which offers no play chances", async () => {
    await stored("a1", "1. e4 e5 (1... c5) *", ["e4"]);
    mount("/tools/analysis?analysis=a1");
    fireEvent.contextMenu(screen.getByTestId("move-ply-2"), { clientX: 40, clientY: 60 });
    expect(screen.getByTestId("move-menu")).toBeInTheDocument();
    expect(screen.queryByTestId("move-menu-chances")).toBeNull();

    fireEvent.click(screen.getByTestId("move-menu-comment"));
    fireEvent.change(screen.getByTestId("comment-dialog-text"), {
      target: { value: "Symmetry." },
    });
    fireEvent.click(screen.getByTestId("comment-dialog-save"));
    // An edit is a session change like a move added.
    expect(screen.getByTestId("analysis-save")).toBeEnabled();
  });
});

describe("a saved analysis' settings on the board", () => {
  it("opens facing its side, with its description, and its arrows as set", async () => {
    await stored("a1", "1. e4 e5 (1... c5) *", ["e4"], {
      orientation: "black",
      description: "Two replies.",
      showArrows: false,
    });
    mount("/tools/analysis?analysis=a1");
    expect(boardOptions().boardOrientation).toBe("black");
    expect(screen.getByTestId("analysis-description")).toHaveTextContent("Two replies.");
    // At a branch, with the arrows off: none drawn.
    expect(boardOptions().arrows).toEqual([]);
  });

  it("links to its settings, but not while there are unsaved changes", async () => {
    await stored("a1", "1. e4 *", ["e4"]);
    mount("/tools/analysis?analysis=a1");
    expect(screen.getByTestId("analysis-settings")).toHaveAttribute(
      "href",
      "/tools/analysis/saved/a1/settings",
    );
    drag("e7", "e5");
    expect(screen.getByTestId("analysis-settings")).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps the record's side and description when the session is updated", async () => {
    await stored("a1", "1. e4 *", ["e4"], { orientation: "black", description: "Mine." });
    mount("/tools/analysis?analysis=a1");
    act(() => {
      screen.getByTestId("board-control-flip").click();
    });
    drag("e7", "e5");
    fireEvent.click(screen.getByTestId("analysis-save"));
    fireEvent.click(screen.getByTestId("analysis-changes-update"));
    expect(findSavedAnalysis("a1")).toMatchObject({
      orientation: "black",
      description: "Mine.",
    });
  });

  it("has no settings link on a board that is not saved yet", () => {
    mount();
    expect(screen.queryByTestId("analysis-settings")).toBeNull();
  });
});

const AFTER_E4_E5_NF3 =
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

describe("Play — the engine plays the opponent's best move until paused", () => {
  const play = () => fireEvent.click(screen.getByTestId("analysis-play"));
  const pressed = () => screen.getByTestId("analysis-play").getAttribute("aria-pressed");

  it("never moves a piece while Play is off", () => {
    mount();
    engineSearches("e2e4 e7e5");
    expect(boardOptions().position).toBe(START);
    expect(pressed()).toBe("false");
  });

  it("is disabled while the engine is off", () => {
    mount();
    fireEvent.click(screen.getByTestId("analysis-setting-engine"));
    expect(screen.getByTestId("analysis-play")).toBeDisabled();
  });

  it("plays only the side not at the bottom of the board, turn after turn", () => {
    mount();
    play();
    expect(pressed()).toBe("true");

    // White is the reader's: the engine's best move for White is not played.
    engineSearches("e2e4 e7e5");
    expect(boardOptions().position).toBe(START);

    drag("e2", "e4");
    engineSearches("e7e5 g1f3");
    expect(boardOptions().position).toBe(AFTER_E4_E5);

    // The reader's turn again: nothing moves until the reader does.
    engineSearches("g1f3 b8c6");
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    drag("g1", "f3");
    expect(boardOptions().position).toBe(AFTER_E4_E5_NF3);
    expect(pressed()).toBe("true");
  });

  it("plays White when the board faces Black", () => {
    mount();
    act(() => {
      screen.getByTestId("board-control-flip").click();
    });
    play();
    engineSearches("e2e4 e7e5");
    expect(boardOptions().position).toBe(AFTER_E4);
  });

  it("pauses when the board is flipped — the engine's side changed under it (CTA-74)", () => {
    mount();
    play();
    act(() => {
      screen.getByTestId("board-control-flip").click();
    });
    expect(pressed()).toBe("false");
    expect(boardOptions().position).toBe(START);
  });

  it("pauses when the reader steps back, and they go on by hand until Play again", () => {
    mount();
    play();
    drag("e2", "e4");
    engineSearches("e7e5 g1f3");
    expect(boardOptions().position).toBe(AFTER_E4_E5);

    act(() => {
      screen.getByTestId("board-control-previous").click();
    });
    expect(pressed()).toBe("false");
    // A different reply by hand; the engine does not answer it.
    drag("c7", "c5");
    engineSearches("g1f3 b8c6");
    expect(boardOptions().position).toBe(
      "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    );

    // Play again: the reader's turn (White), so it waits for their move.
    play();
    drag("g1", "f3");
    engineSearches("b8c6 f1b5");
    expect(boardOptions().position).toBe(
      "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    );
  });

  it("plays at once at the engine's turn from a search already finished", () => {
    mount();
    drag("e2", "e4");
    engineSearches("e7e5 g1f3");
    expect(boardOptions().position).toBe(AFTER_E4);
    play();
    expect(boardOptions().position).toBe(AFTER_E4_E5);
  });

  it("stops when the engine is switched off", () => {
    mount();
    play();
    fireEvent.click(screen.getByTestId("analysis-setting-engine"));
    fireEvent.click(screen.getByTestId("analysis-setting-engine"));
    expect(pressed()).toBe("false");
  });
});

describe("Play — the engine's thinking, shown", () => {
  it("says the engine is thinking, with the depth, until its move lands; then it is the reader's", () => {
    mount();
    expect(screen.queryByTestId("analysis-play-status")).toBeNull();
    act(() => {
      screen.getByTestId("board-control-flip").click();
    });
    fireEvent.click(screen.getByTestId("analysis-play"));

    // White to move and the engine is White: it is thinking.
    expect(screen.getByTestId("analysis-play-status")).toHaveAttribute("data-status", "thinking");
    expect(screen.getByTestId("analysis-play-status")).toHaveTextContent("Engine is thinking");
    expect(screen.getByTestId("analysis-play-spinner")).toBeInTheDocument();

    // A streamed line: the depth reached shows as it climbs.
    const engine = FakeEngine.latest();
    act(() => {
      engine.say({
        fen: engine.lastSearch,
        uciMessage: "info",
        depth: 14,
        multipv: 1,
        positionEvaluation: "20",
        pv: "e2e4 e7e5",
      });
    });
    expect(screen.getByTestId("analysis-play-depth")).toHaveTextContent("depth 14");

    act(() => {
      engine.say({ fen: engine.lastSearch, uciMessage: "bestmove", bestMove: "e2e4" });
    });
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(screen.getByTestId("analysis-play-status")).toHaveAttribute("data-status", "your-move");
    expect(screen.queryByTestId("analysis-play-spinner")).toBeNull();
  });

  it("shows nothing once paused", () => {
    mount();
    fireEvent.click(screen.getByTestId("analysis-play"));
    expect(screen.getByTestId("analysis-play-status")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("analysis-play"));
    expect(screen.queryByTestId("analysis-play-status")).toBeNull();
  });
});
