import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import PlayWithEngine from "./PlayWithEngine";

/*
  Two things have to be stood in for to test this screen under jsdom.

  `<Chessboard>` measures its own square on mount and throws "Square width not
  found" where there is no layout engine (`.claude/rules/chessboard.md` §8), so
  it is stubbed — and the stub keeps hold of the options it was handed, which is
  how a test drags a piece.

  `Engine` builds a real `Worker`, which jsdom has none of, and would then be an
  async search to wait on. The fake below records what was searched and lets a
  test push UCI results back, so the screen's engine behaviour is driven exactly
  and synchronously.
*/

const harness = vi.hoisted(() => {
  type Listener = (message: Record<string, unknown>) => void;

  class FakeEngine {
    static instances: FakeEngine[] = [];

    readonly searches: string[] = [];
    readonly setOptions: [string, string | number][] = [];
    /** What the worker in `public/stockfish/` really answers `uci` with. */
    readonly options = new Map<string, { name: string; type: string; min?: number; max?: number }>([
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

    stop() {}

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


/* The opening book stays stubbed — the panel's new opening line must not pull
   the real ~3MB eco.json into a screen test. */
vi.mock("../../../lib/openings", () => ({
  loadOpeningBook: () => Promise.resolve({}),
  getPositionBook: () => ({}),
  findOpening: () => undefined,
}));

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: Record<string, never> }) => {
    harness.board.options = options;
    return (
      <div
        data-testid="board"
        data-position={(options as { position?: string }).position}
        data-orientation={(options as { boardOrientation?: string }).boardOrientation}
        data-dragging={String((options as { allowDragging?: boolean }).allowDragging)}
      />
    );
  },
  // Only what `PromotionPicker` reaches for.
  chessColumnToColumnIndex: (column: string, _columns: number, orientation: string) =>
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

/** Let the engine answer the search it is currently running with this move. */
const engineReplies = (uci: string) => {
  const fen = engine().lastSearch;
  act(() => {
    engine().say({ fen, bestMove: uci, uciMessage: `bestmove ${uci}` });
  });
};

/** Push one `info` line for the position currently being searched. */
const engineReports = (
  info: { depth: number; multipv?: number; cp?: number; mate?: number; pv: string },
) => {
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
  A router, because the screen reads its starting position off the URL — that is
  how the Board Editor hands one over. `entry` is what a test arrives at.
*/
const renderScreen = (entry = "/engine/play") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <PlayWithEngine />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const position = () => screen.getByTestId("board").getAttribute("data-position");

beforeEach(async () => {
  harness.FakeEngine.instances = [];
  harness.board.options = null;
  await i18n.changeLanguage("en");
});

describe("Play with Engine — the game against the engine", () => {
  it("opens on the starting position and asks the engine about it", () => {
    renderScreen();

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
    expect(engine().lastSearch).toBe(position());
  });

  it("plays a full exchange: the human drags, the engine replies", () => {
    renderScreen();

    expect(drag("e2", "e4")).toBe(true);
    expect(position()).toContain("4P3");
    // The move went in, so the engine is now asked about the new position.
    expect(engine().lastSearch).toBe(position());

    engineReplies("e7e5");

    expect(position()).toContain("4p3");
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");
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

  it("will not let the human move on the engine's turn", () => {
    renderScreen();
    drag("e2", "e4");

    // Black is the engine's, and it has not answered yet.
    expect(boardOptions().allowDragging).toBe(false);
    expect(drag("e7", "e5")).toBe(false);
  });

  it("ignores a bestmove for a position the game is no longer at", () => {
    renderScreen();
    drag("e2", "e4");

    // A result stamped with a position that is not the live one — the wrapper's
    // FEN stamp is what makes this detectable at all.
    act(() => {
      engine().say({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        bestMove: "e7e5",
        uciMessage: "bestmove e7e5",
      });
    });

    expect(screen.queryByTestId("move-ply-2")).not.toBeInTheDocument();
  });
});

describe("Play with Engine — stepping back through the game", () => {
  const playOpening = () => {
    renderScreen();
    drag("e2", "e4");
    engineReplies("e7e5");
    drag("g1", "f3");
    engineReplies("b8c6");
  };

  it("shows the ply that was clicked, and locks the board there", async () => {
    playOpening();
    const live = position();

    await userEvent.click(screen.getByTestId("move-ply-1"));

    expect(position()).not.toBe(live);
    expect(position()).toContain("4P3");
    // Off the live position a drag would apply to a position nobody is looking
    // at, so the board is a review and nothing else.
    expect(boardOptions().allowDragging).toBe(false);
    expect(drag("b1", "c3")).toBe(false);
  });

  it("does not let the engine move for a position the player has left", async () => {
    playOpening();
    await userEvent.click(screen.getByTestId("move-ply-1"));

    const plies = screen.getAllByTestId(/^move-ply-[1-9]/).length;

    /*
      The engine is now searching the *displayed* ply, where it is Black to move
      — exactly the shape that would make a naive handler play a move behind the
      player's back. The result is analysis, and only analysis.
    */
    engineReplies("d7d5");

    expect(screen.getAllByTestId(/^move-ply-[1-9]/)).toHaveLength(plies);
    expect(position()).toContain("4P3");
  });

  it("searches the ply on screen, not the live position", async () => {
    playOpening();
    const live = engine().lastSearch;

    await userEvent.click(screen.getByTestId("move-ply-2"));

    expect(engine().lastSearch).not.toBe(live);
    expect(engine().lastSearch).toBe(position());
  });

  it("returns to the live position through the board controls, and plays on", async () => {
    playOpening();
    await userEvent.click(screen.getByTestId("move-ply-1"));

    await userEvent.click(screen.getByTestId("board-control-last"));

    expect(boardOptions().allowDragging).toBe(true);
    expect(drag("f1", "c4")).toBe(true);
  });
});

describe("Play with Engine — promotion", () => {
  /*
    A real picker rather than a hardcoded queen is an acceptance criterion, so
    this plays an actual promotion line: White's h-pawn takes its way to the
    eighth rank while the engine answers for Black.
  */
  const playToPromotion = () => {
    renderScreen();
    drag("h2", "h4");
    engineReplies("g7g5");
    drag("h4", "g5");
    engineReplies("g8f6");
    drag("g5", "f6");
    engineReplies("h8g8");
    drag("f6", "e7");
    engineReplies("g8g6");
  };

  it("asks which piece instead of assuming a queen", () => {
    playToPromotion();
    const before = position();

    // The drop is accepted so the pawn is not snapped back and then jumped
    // forward again when the choice lands.
    expect(drag("e7", "d8")).toBe(true);

    expect(screen.getByTestId("promotion-picker")).toBeInTheDocument();
    // Nothing has been played yet — the choice decides the move.
    expect(position()).toBe(before);
    for (const piece of ["q", "r", "n", "b"]) {
      expect(screen.getByTestId(`promotion-choice-${piece}`)).toBeInTheDocument();
    }
  });

  it("underpromotes when that is what was chosen", async () => {
    playToPromotion();
    drag("e7", "d8");

    await userEvent.click(screen.getByTestId("promotion-choice-n"));

    expect(screen.queryByTestId("promotion-picker")).not.toBeInTheDocument();
    // A knight on d8, not a queen — the whole point of asking.
    expect(position()).toMatch(/^rnbN/);
  });

  it("cancels without moving when the scrim is clicked", async () => {
    playToPromotion();
    const before = position();
    drag("e7", "d8");

    await userEvent.click(screen.getByTestId("promotion-scrim"));

    expect(screen.queryByTestId("promotion-picker")).not.toBeInTheDocument();
    expect(position()).toBe(before);
  });

  it("locks the board while the picker is open", () => {
    playToPromotion();
    drag("e7", "d8");

    expect(boardOptions().allowDragging).toBe(false);
  });
});

describe("Play with Engine — the panel", () => {
  it("shows the evaluation bar, normalised so up is always White", () => {
    renderScreen();
    // White to move, +120 for the side to move: White is ahead.
    engineReports({ depth: 18, multipv: 1, cp: 120, pv: "e2e4 e7e5" });

    const bar = screen.getByTestId("eval-bar");
    expect(bar).toHaveAttribute("data-score", "+1.20");
    expect(Number(bar.getAttribute("data-white-share"))).toBeGreaterThan(0.5);
  });

  it("flips the same raw score when it is Black to move", () => {
    renderScreen();
    drag("e2", "e4");
    // Black to move now; +120 for the side to move means Black is ahead.
    engineReports({ depth: 18, multipv: 1, cp: 120, pv: "e7e5 g1f3" });

    const bar = screen.getByTestId("eval-bar");
    expect(bar).toHaveAttribute("data-score", "−1.20");
    expect(Number(bar.getAttribute("data-white-share"))).toBeLessThan(0.5);
  });

  it("shows a mate as mate-in-N on the bar", () => {
    renderScreen();
    engineReports({ depth: 12, multipv: 1, mate: 4, pv: "e2e4" });

    expect(screen.getByTestId("eval-bar")).toHaveAttribute("data-score", "M4");
  });

  it("turns the evaluation bar off and on again", async () => {
    renderScreen();
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("engine-panel-tab-engine"));
    await userEvent.click(
      screen.getByTestId("engine-setting-evalbar").querySelector("input")!,
    );

    expect(screen.queryByTestId("eval-bar")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByTestId("engine-setting-evalbar").querySelector("input")!,
    );
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();
  });

  it("lists the engine's variations with their depth", async () => {
    renderScreen();
    engineReports({ depth: 20, multipv: 1, cp: 35, pv: "e2e4 e7e5" });
    engineReports({ depth: 20, multipv: 2, cp: 20, pv: "d2d4 d7d5" });

    await userEvent.click(screen.getByTestId("engine-panel-tab-lines"));

    expect(screen.getByTestId("variation-1-line")).toHaveTextContent("1. e4 e5");
    expect(screen.getByTestId("variation-2-line")).toHaveTextContent("1. d4 d5");
    expect(screen.getByTestId("analysis-depth")).toHaveTextContent("Depth 20");
  });

  it("drops the previous position's lines rather than showing them under a new board", async () => {
    renderScreen();
    engineReports({ depth: 20, multipv: 1, cp: 35, pv: "e2e4 e7e5" });
    await userEvent.click(screen.getByTestId("engine-panel-tab-lines"));
    expect(screen.getByTestId("variation-1")).toBeInTheDocument();

    drag("e2", "e4");

    // A new position with no result yet: waiting, not the old line.
    expect(screen.queryByTestId("variation-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("best-variations")).toHaveTextContent(
      "Waiting for the engine…",
    );
  });

  it("pushes a changed setting to the engine and re-searches", async () => {
    renderScreen();
    const searchesBefore = engine().searches.length;

    await userEvent.click(screen.getByTestId("engine-panel-tab-engine"));
    await userEvent.click(screen.getByTestId("engine-setting-playas-black"));

    // Changing a setting takes effect on the next search, with no reload.
    expect(engine().searches.length).toBeGreaterThan(searchesBefore);
  });

  it("only sends the engine options this build actually declares", () => {
    renderScreen();

    const sent = engine().setOptions.map(([name]) => name);
    expect(sent).toContain("Skill Level");
    expect(sent).toContain("MultiPV");
    // A name this build has no option for never reaches the wire.
    expect(engine().setOption("UCI_Elo", 1800)).toBe(false);
  });

  it("shows a pinned option as fixed rather than as a slider that does nothing", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("engine-panel-tab-engine"));

    // This build pins both: Threads to 1, Hash to 16.
    expect(screen.getByTestId("engine-setting-threads-fixed")).toHaveTextContent(
      "This engine build fixes Threads at 1.",
    );
    expect(
      screen.getByTestId("engine-setting-hash").querySelector("input"),
    ).toBeDisabled();
    // MultiPV has a real range, so it stays live.
    expect(
      screen.getByTestId("engine-setting-multipv").querySelector("input"),
    ).toBeEnabled();
  });

  it("lets the engine take White when the human switches colours", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("engine-panel-tab-engine"));
    await userEvent.click(screen.getByTestId("engine-setting-playas-black"));

    engineReplies("d2d4");

    // Back to the Game tab — the move list is only rendered while it is open.
    await userEvent.click(screen.getByTestId("engine-panel-tab-game"));
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("d4");
  });

  it("starts a new game from the settings tab", async () => {
    renderScreen();
    drag("e2", "e4");
    engineReplies("e7e5");
    expect(screen.getByTestId("move-ply-2")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("engine-panel-tab-engine"));
    await userEvent.click(screen.getByTestId("engine-new-game"));

    expect(screen.queryByTestId("move-ply-1")).not.toBeInTheDocument();
    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
  });

  it("flips the board without touching the game", async () => {
    renderScreen();
    drag("e2", "e4");
    const before = position();

    await userEvent.click(screen.getByTestId("board-control-flip"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    expect(position()).toBe(before);
  });

  it("tears the worker down on unmount", () => {
    const { unmount } = renderScreen();
    const instance = engine();

    unmount();

    expect(instance.terminated).toBe(true);
  });
});

describe("Play with Engine — arriving from the Board Editor", () => {
  // Black to move, and a mate in one for whoever plays it.
  const handedOver = "6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1";

  it("starts the game from the position handed over in the URL", () => {
    renderScreen(`/engine/play?fen=${encodeURIComponent(handedOver)}`);

    expect(position()).toBe(handedOver);
    // It is a game, not a diagram: the engine is asked about that position, and
    // a move played from it is the first of the list.
    expect(engine().lastSearch).toBe(handedOver);
    expect(drag("g8", "h8")).toBe(true);
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("Kh8");
  });

  it("gives the reader the side to move, and turns the board to face it", () => {
    renderScreen(`/engine/play?fen=${encodeURIComponent(handedOver)}`);

    /*
      A position set up with Black to move is one the reader means to play as
      Black — otherwise the engine would move the moment the screen opened, from
      a position they had just finished arranging.
    */
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    engineReplies("a1a8");
    expect(screen.queryByTestId("move-ply-1")).not.toBeInTheDocument();
  });

  it("goes back to that position on a new game, not to the standard start", async () => {
    renderScreen(`/engine/play?fen=${encodeURIComponent(handedOver)}`);
    drag("g8", "h8");

    await userEvent.click(screen.getByTestId("engine-panel-tab-engine"));
    await userEvent.click(screen.getByTestId("engine-new-game"));

    expect(screen.queryByTestId("move-ply-1")).not.toBeInTheDocument();
    expect(position()).toBe(handedOver);
  });

  it("ignores a position it cannot read, rather than throwing on the link", () => {
    renderScreen("/engine/play?fen=not-a-position");

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
  });
});
