import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { MAX_VARIATIONS_OFFERED } from "../../../lib/engineAnalysis";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import AnalysisBoard from "./AnalysisBoard";

/*
  The same two stand-ins the Play with Engine suite needs, and for the same
  reasons.

  `<Chessboard>` measures its own square on mount and throws "Square width not
  found" where there is no layout engine (`.claude/rules/chessboard.md` §8), so
  it is stubbed — and the stub keeps hold of the options it was handed, which is
  how a test drags a piece.

  `Engine` builds a real `Worker`, which jsdom has none of. The fake below
  records what was searched and lets a test push UCI results back, so the
  screen's engine behaviour is driven exactly and synchronously — including the
  case this screen exists to get right: that with the engine off, nothing is
  searched at all.
*/

const harness = vi.hoisted(() => {
  type Listener = (message: Record<string, unknown>) => void;

  class FakeEngine {
    static instances: FakeEngine[] = [];

    readonly searches: string[] = [];
    readonly setOptions: [string, string | number][] = [];
    stops = 0;
    /** What the worker in `public/stockfish/` really answers `uci` with. */
    readonly options = new Map<
      string,
      { name: string; type: string; min?: number; max?: number }
    >([
      ["Threads", { name: "Threads", type: "spin", min: 1, max: 1 }],
      ["Hash", { name: "Hash", type: "spin", min: 16, max: 16 }],
      ["MultiPV", { name: "MultiPV", type: "spin", min: 1, max: 500 }],
      ["Skill Level", { name: "Skill Level", type: "spin", min: 0, max: 20 }],
    ]);
    terminated = false;
    private listeners = new Set<Listener>();

    constructor() {
      FakeEngine.instances.push(this);
    }

    onMessage(listener: Listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    whenOptionsReady(callback: () => void) {
      callback();
      return () => {};
    }

    supportsOption(name: string) {
      return this.options.has(name);
    }

    setOption(name: string, value: string | number) {
      this.setOptions.push([name, value]);
      return this.options.has(name);
    }

    search(fen: string) {
      this.searches.push(fen);
    }

    evaluatePosition(fen: string) {
      this.search(fen);
    }

    stop() {
      this.stops += 1;
    }

    terminate() {
      this.terminated = true;
      this.listeners.clear();
    }

    /** Push one parsed message back, as the real wrapper would. */
    say(message: Record<string, unknown>) {
      [...this.listeners].forEach((listener) => listener(message));
    }

    get lastSearch() {
      return this.searches.at(-1);
    }
  }

  const board: { options: Record<string, never> | null } = { options: null };

  return { FakeEngine, board };
});

vi.mock("../../../lib/engine", () => ({ default: harness.FakeEngine }));

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: Record<string, never> }) => {
    harness.board.options = options;
    return (
      <div
        data-testid="board"
        data-position={(options as { position?: string }).position}
        data-orientation={
          (options as { boardOrientation?: string }).boardOrientation
        }
        data-dragging={String((options as { allowDragging?: boolean }).allowDragging)}
      />
    );
  },
  // Only what `PromotionPicker` reaches for.
  chessColumnToColumnIndex: (
    column: string,
    _columns: number,
    orientation: string,
  ) =>
    orientation === "white"
      ? column.charCodeAt(0) - "a".charCodeAt(0)
      : 7 - (column.charCodeAt(0) - "a".charCodeAt(0)),
  defaultPieces: Object.fromEntries(
    ["wQ", "wR", "wN", "wB", "bQ", "bR", "bN", "bB"].map((key) => [
      key,
      () => <svg data-testid={`piece-${key}`} />,
    ]),
  ),
}));

/** The engine instance the mounted screen is talking to. */
const engine = () => {
  const instance = harness.FakeEngine.instances.at(-1);
  if (!instance) throw new Error("no engine was constructed");
  return instance;
};

const boardOptions = () => {
  const options = harness.board.options as {
    position?: string;
    allowDragging?: boolean;
    onPieceDrop?: (args: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => boolean;
  } | null;
  if (!options) throw new Error("the board has not rendered");
  return options;
};

/** Drag a piece, the way the board would report it. */
const drag = (from: string, to: string) => {
  let accepted = false;
  act(() => {
    accepted = boardOptions().onPieceDrop!({
      sourceSquare: from,
      targetSquare: to,
    });
  });
  return accepted;
};

/** Push one `info` line for the position currently being searched. */
const engineReports = (info: {
  depth: number;
  multipv?: number;
  cp?: number;
  mate?: number;
  pv: string;
}) => {
  const fen = engine().lastSearch;
  act(() => {
    engine().say({
      fen,
      uciMessage: "info",
      depth: info.depth,
      multipv: info.multipv,
      positionEvaluation: info.cp === undefined ? undefined : String(info.cp),
      possibleMate: info.mate === undefined ? undefined : String(info.mate),
      pv: info.pv,
    });
  });
};

/*
  A router, because the screen reads its initial position off the URL — that is
  how the Board Editor hands one over. `entry` is what a test arrives at.
*/
const renderScreen = (entry = "/tools/analysis") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <AnalysisBoard />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const position = () => screen.getByTestId("board").getAttribute("data-position");

/** The SAN of every move in the tree view, in render order. */
const moveTokens = () =>
  screen.getAllByTestId(/^tree-move-n/).map((element) => element.dataset.san);

const openTab = (tab: "moves" | "engine" | "lines" | "position") =>
  userEvent.click(screen.getByTestId(`analysis-panel-tab-${tab}`));

/*
  Pasted rather than typed. `userEvent.type` reads `{` and `[` as key
  descriptors and a PGN is full of both — and pasting is what a reader does with
  a game anyway.
*/
const pasteInto = async (testId: string, text: string) => {
  await userEvent.click(screen.getByTestId(testId));
  await userEvent.paste(text);
};

beforeEach(async () => {
  harness.FakeEngine.instances = [];
  harness.board.options = null;
  await i18n.changeLanguage("en");
});

describe("Analysis Board — moving pieces", () => {
  it("opens on the starting position and asks the engine about it", () => {
    renderScreen();

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
    expect(engine().lastSearch).toBe(position());
  });

  it("accepts moves for both colours — the engine never plays one", () => {
    renderScreen();

    expect(drag("e2", "e4")).toBe(true);
    expect(position()).toContain("4P3");

    // Black's reply is the human's to make too. Nothing arrives on its own:
    // even a bestmove for this very position must not move a piece.
    act(() => {
      engine().say({
        fen: engine().lastSearch,
        bestMove: "e7e5",
        uciMessage: "bestmove e7e5",
      });
    });
    expect(moveTokens()).toEqual(["e4"]);

    expect(drag("e7", "e5")).toBe(true);
    expect(moveTokens()).toEqual(["e4", "e5"]);
  });

  it("rejects an illegal drag and leaves the position alone", () => {
    renderScreen();
    const before = position();

    expect(drag("e2", "e5")).toBe(false);
    expect(position()).toBe(before);
  });

  it("refuses a drag off the board", () => {
    renderScreen();

    act(() => {
      expect(
        boardOptions().onPieceDrop!({ sourceSquare: "e2", targetSquare: null }),
      ).toBe(false);
    });
  });
});

describe("Analysis Board — variations", () => {
  it("keeps both lines when a different move is played from an earlier ply", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    drag("g1", "f3");

    // Step back to the position after 1. e4 and answer it differently.
    await userEvent.click(screen.getByTestId("board-control-first"));
    await userEvent.click(screen.getByTestId("board-control-next"));
    expect(position()).toContain("4P3");

    drag("c7", "c5");

    // Both replies are in the list, and the mainline is untouched.
    expect(moveTokens()).toEqual(["e4", "e5", "c5", "Nf3"]);
    expect(position()).toContain("2p5");
  });

  it("makes both lines navigable from the move list", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");

    const sicilian = position();
    const [, mainReply, variation] = screen.getAllByTestId(/^tree-move-n/);

    await userEvent.click(mainReply);
    expect(position()).toContain("4p3");

    await userEvent.click(variation);
    expect(position()).toBe(sicilian);
  });

  it("follows the line that exists rather than making a duplicate", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));

    // Replaying the move that is already there is not a new variation.
    drag("e7", "e5");
    expect(moveTokens()).toEqual(["e4", "e5"]);
  });

  it("steps along the variation it is standing in, not the mainline", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    drag("g1", "f3");
    await userEvent.click(screen.getByTestId("board-control-first"));
    await userEvent.click(screen.getByTestId("board-control-next"));
    drag("c7", "c5");
    drag("b1", "c3");

    // Standing at the end of the Sicilian line, "back" walks that line.
    await userEvent.click(screen.getByTestId("board-control-previous"));
    expect(position()).toContain("2p5");
    // …and "end" returns to the end of it rather than to the mainline's.
    await userEvent.click(screen.getByTestId("board-control-last"));
    expect(moveTokens()).toEqual(["e4", "e5", "c5", "Nc3", "Nf3"]);
  });
});

describe("Analysis Board — the Position tab", () => {
  it("sets a position up from a pasted FEN, numbering from that FEN", async () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12";
    renderScreen();
    await openTab("position");

    await pasteInto("analysis-fen-input", fen);
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));

    expect(position()).toBe(fen);

    // The move numbering follows the FEN rather than restarting at move 1.
    drag("g8", "f6");
    await openTab("moves");
    expect(screen.getByTestId("variation-tree")).toHaveTextContent("12… Nf6");
  });

  it("turns the board to the side to move in a pasted FEN", async () => {
    renderScreen();
    await openTab("position");

    await pasteInto(
      "analysis-fen-input",
      "2b2rk1/3n1ppp/3Rp3/6B1/1q2N3/1P4Q1/r1P2PPP/2KR4 b - - 0 1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
  });

  it("leaves the viewpoint alone when a game is loaded instead", async () => {
    renderScreen();
    await userEvent.click(screen.getByTestId("board-control-flip"));
    await openTab("position");

    await pasteInto("analysis-pgn-input", "1. e4 e5");
    await userEvent.click(screen.getByRole("button", { name: "Load PGN" }));

    /*
      A PGN opens at ply 0, where the side to move says nothing about which side
      the reader is studying — so the flip they asked for stands.
    */
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
  });

  it("reports a FEN it cannot read, and leaves the board alone", async () => {
    renderScreen();
    const before = position();
    await openTab("position");

    await pasteInto("analysis-fen-input", "not a fen");
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));

    expect(screen.getByTestId("analysis-position-error")).toBeInTheDocument();
    expect(position()).toBe(before);
  });

  it("loads a PGN, side lines included", async () => {
    renderScreen();
    await openTab("position");

    await pasteInto("analysis-pgn-input", "1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6");
    await userEvent.click(screen.getByRole("button", { name: "Load PGN" }));

    await openTab("moves");
    // The side line survived the load — `parsePgnGames` would have dropped it.
    expect(moveTokens()).toEqual(["e4", "e5", "c5", "Nf3", "Nf3", "Nc6"]);
    // A load opens on the start position.
    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
  });

  it("offers a picker for a multi-game file", async () => {
    renderScreen();
    await openTab("position");

    await pasteInto(
      "analysis-pgn-input",
      [
        '[Event "One"]',
        '[White "Alice"]',
        '[Black "Bob"]',
        "",
        "1. e4 e5 1-0",
        "",
        '[Event "Two"]',
        '[White "Carol"]',
        '[Black "Dan"]',
        "",
        "1. d4 d5 0-1",
      ].join("\n"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Load PGN" }));

    const picker = screen.getByTestId("analysis-game-picker");
    expect(within(picker).getAllByRole("button")).toHaveLength(2);

    await userEvent.click(within(picker).getByText("Carol vs Dan"));
    await openTab("moves");
    expect(moveTokens()).toEqual(["d4", "d5"]);
  });

  it("reports which game in a file failed", async () => {
    renderScreen();
    await openTab("position");

    await pasteInto(
      "analysis-pgn-input",
      [
        '[Event "One"]',
        "",
        "1. e4 e5",
        "",
        '[Event "Two"]',
        "",
        "1. d4 Ke7",
      ].join("\n"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Load PGN" }));

    expect(screen.getByTestId("analysis-position-error")).toHaveTextContent(
      /game 2/i,
    );
  });

  it("shows the current FEN and PGN read-only, and copies them", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderScreen();
    drag("e2", "e4");
    await openTab("position");

    const fenField = screen.getByTestId("analysis-current-fen");
    expect(fenField).toHaveValue(position());
    expect(fenField).toHaveAttribute("readonly");

    const pgnField = screen.getByTestId("analysis-current-pgn");
    expect(pgnField).toHaveValue("1. e4 *");
    expect(pgnField).toHaveAttribute("readonly");

    await userEvent.click(screen.getByTestId("analysis-current-fen-copy"));
    expect(writeText).toHaveBeenCalledWith(position());

    await userEvent.click(screen.getByTestId("analysis-current-pgn-copy"));
    expect(writeText).toHaveBeenLastCalledWith("1. e4 *");

    vi.unstubAllGlobals();
  });

  it("writes the side lines into the exported PGN", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");

    await openTab("position");
    expect(screen.getByTestId("analysis-current-pgn")).toHaveValue(
      "1. e4 e5 (1... c5) *",
    );
  });
});

describe("Analysis Board — the two switches", () => {
  it("stops searching when the engine is switched off, and says so", async () => {
    renderScreen();
    engineReports({ depth: 14, multipv: 1, cp: 40, pv: "e2e4 e7e5" });

    await openTab("lines");
    expect(screen.getByTestId("best-variations")).toHaveTextContent("+0.40");

    await openTab("engine");
    await userEvent.click(screen.getByTestId("analysis-setting-engine"));

    // The running search is stopped rather than left to finish in the tab.
    expect(engine().stops).toBeGreaterThan(0);

    const searchesWhenOff = engine().searches.length;
    drag("e2", "e4");
    expect(engine().searches).toHaveLength(searchesWhenOff);

    // And the tab says the engine is off rather than showing the stale line.
    await openTab("lines");
    expect(screen.getByTestId("analysis-engine-off")).toBeInTheDocument();
    expect(screen.queryByTestId("best-variations")).not.toBeInTheDocument();
  });

  it("searches the position on screen again when it is switched back on", async () => {
    renderScreen();
    await openTab("engine");

    await userEvent.click(screen.getByTestId("analysis-setting-engine"));
    drag("e2", "e4");
    await userEvent.click(screen.getByTestId("analysis-setting-engine"));

    expect(engine().lastSearch).toBe(position());
  });

  it("offers up to ten variations, not the 500 this build would accept", async () => {
    renderScreen();
    await openTab("engine");

    const slider = screen
      .getByTestId("engine-setting-multipv")
      .querySelector("input")!;

    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", String(MAX_VARIATIONS_OFFERED));
    expect(MAX_VARIATIONS_OFFERED).toBe(10);
  });

  it("shows and hides the evaluation bar, independently of the engine", async () => {
    renderScreen();
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();

    await openTab("engine");
    await userEvent.click(screen.getByTestId("analysis-setting-evalbar"));
    expect(screen.queryByTestId("eval-bar")).not.toBeInTheDocument();

    // The engine is still on with the bar hidden…
    expect(engine().searches.length).toBeGreaterThan(0);

    // …and the bar comes back with the engine off.
    await userEvent.click(screen.getByTestId("analysis-setting-engine"));
    await userEvent.click(screen.getByTestId("analysis-setting-evalbar"));
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();
  });

  it("keeps the board square whichever way the bar is switched", async () => {
    renderScreen();

    // Bar + gap come out of the board's side, exactly.
    expect(screen.getByTestId("analysis-board-square")).toHaveStyle({
      width: "calc(100% - 26px)",
      height: "calc(100% - 26px)",
      flexShrink: "0",
    });

    await openTab("engine");
    await userEvent.click(screen.getByTestId("analysis-setting-evalbar"));

    expect(screen.getByTestId("analysis-board-square")).toHaveStyle({
      width: "100%",
      height: "100%",
    });
  });

  it("normalises the score to White whichever side is to move", async () => {
    renderScreen();

    // Black to move, and the engine says the side to move is a pawn up.
    drag("e2", "e4");
    engineReports({ depth: 14, multipv: 1, cp: 100, pv: "e7e5" });

    // In White's perspective that is Black a pawn up.
    expect(screen.getByTestId("eval-bar")).toHaveAttribute(
      "data-score",
      "−1.00",
    );
  });
});

describe("Analysis Board — promotion", () => {
  /*
    The screen must offer a real picker rather than the demos' hardcoded queen,
    so this plays a promotion out: from a FEN one push away from the last rank.
  */
  const promotionFen = "7k/4P3/8/8/8/8/8/K7 w - - 0 1";

  const setUpPromotion = async () => {
    renderScreen();
    await openTab("position");
    await pasteInto("analysis-fen-input", promotionFen);
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
  };

  it("asks which piece, and underpromotes when told to", async () => {
    await setUpPromotion();

    expect(drag("e7", "e8")).toBe(true);
    expect(screen.getByTestId("promotion-picker")).toBeInTheDocument();
    // Dragging is off while the picker is open — that move is not decided yet.
    expect(screen.getByTestId("board")).toHaveAttribute("data-dragging", "false");

    await userEvent.click(screen.getByTestId("promotion-choice-n"));

    expect(screen.queryByTestId("promotion-picker")).not.toBeInTheDocument();
    // A knight on e8 — not the queen a hardcoded `promotion: "q"` would give.
    expect(position()).toContain("4N2k");
  });

  it("leaves the pawn where it was when the picker is dismissed", async () => {
    await setUpPromotion();
    const before = position();

    drag("e7", "e8");
    await userEvent.click(screen.getByTestId("promotion-scrim"));

    expect(screen.queryByTestId("promotion-picker")).not.toBeInTheDocument();
    expect(position()).toBe(before);
  });
});

describe("Analysis Board — arriving from the Board Editor", () => {
  const edited = "4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1";

  it("opens on the position handed over in the URL", () => {
    renderScreen(`/tools/analysis?fen=${encodeURIComponent(edited)}`);

    expect(position()).toBe(edited);
    // White to move in that one, so the board faces White.
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "white",
    );
    // And it is a game from that position, not a diagram: the engine is asked
    // about it, and a move played from it is the first of the line.
    expect(engine().lastSearch).toBe(edited);
    drag("e2", "e7");
    expect(moveTokens()).toEqual(["Qe7+"]);
  });

  it("faces the side to move in the position it was handed", () => {
    const blackToMove = "2b2rk1/3n1ppp/3Rp3/6B1/1q2N3/1P4Q1/r1P2PPP/2KR4 b - - 0 1";
    renderScreen(`/tools/analysis?fen=${encodeURIComponent(blackToMove)}`);

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
  });

  it("ignores a position it cannot read, rather than throwing on the link", () => {
    renderScreen("/tools/analysis?fen=not-a-position");

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
  });
});

describe("Analysis Board — the shell around it", () => {
  it("clears back to an empty board", async () => {
    renderScreen();
    drag("e2", "e4");

    await openTab("engine");
    await userEvent.click(screen.getByTestId("analysis-clear"));

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
    await openTab("moves");
    expect(screen.queryAllByTestId(/^tree-move-n/)).toHaveLength(0);
  });

  it("flips the board without touching the game", async () => {
    renderScreen();
    drag("e2", "e4");

    await userEvent.click(screen.getByTestId("board-control-flip"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    expect(moveTokens()).toEqual(["e4"]);
  });

  it("terminates the worker when the screen goes away", () => {
    const { unmount } = renderScreen();
    const instance = engine();

    unmount();
    expect(instance.terminated).toBe(true);
  });
});
