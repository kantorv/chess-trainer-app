import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { Chess, DEFAULT_POSITION as START_FEN } from "chess.js";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../../lib/analysisSettings";
import { initialFenOf } from "../../../lib/gameModel";
import {
  addMove,
  emptyTree,
  fenAtNode,
  nodeAtSanPath,
} from "../../../lib/gameTree";
import { pgnCatalog } from "../../../lib/pgnCatalog";
import { parsePgnGames } from "../../../lib/pgn";
import { fenAtPly } from "../../../lib/gameNavigation";
import { addUpload, clearUploads } from "../../../lib/pgnUploadStore";
import { MAX_VARIATIONS_OFFERED } from "../../../lib/engineAnalysis";
import { savedAnalysisOf, type SavedAnalysis } from "../../../lib/savedAnalyses";
import {
  saveAnalysis,
  savedAnalysesSnapshot,
} from "../../../lib/savedAnalysisStore";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import AnalysisBoard from "./AnalysisBoard";
import {
  HOVERED_NEXT_MOVE_ARROW_COLOR,
  NEXT_MOVE_ARROW_COLOR,
} from "./nextMoveArrows";

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


/* The opening book stays stubbed — the panel's new opening line must not pull
   the real ~3MB eco.json into a screen test. */
vi.mock("../../../lib/openings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/openings")>();
  return {
    ...actual,
    loadOpeningBook: () => Promise.resolve({}),
    getPositionBook: () => ({}),
    findOpening: () => undefined,
  };
});

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
    ["w", "b"].flatMap((color) =>
      ["K", "Q", "R", "B", "N", "P"].map((letter) => {
        const key = `${color}${letter}`;
        return [key, () => <svg data-testid={`piece-${key}`} />];
      }),
    ),
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
    arrows?: { startSquare: string; endSquare: string; color: string }[];
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
/*
  Where a hand-off lands. The screen navigates to `/engine/play?fen=…` and the
  whole of that interface is the FEN in the URL — this records it without
  mounting the engine board.
*/
const LocationProbe = () => {
  const location = useLocation();
  return (
    <div
      data-testid="location"
      data-pathname={location.pathname}
      data-search={location.search}
    />
  );
};

const renderScreen = (entry = "/tools/analysis") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <AnalysisBoard />
          <RightPanelOutlet />
          <LocationProbe />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** The FEN a hand-off carried in its `?fen=` query parameter. */
const handOffFen = () =>
  new URLSearchParams(
    screen.getByTestId("location").getAttribute("data-search") ?? "",
  ).get("fen");

const position = () => screen.getByTestId("board").getAttribute("data-position");

/** The SAN of every side-line move of the merged list, in render order. */
const moveTokens = () =>
  screen.getAllByTestId(/^tree-move-n/).map((element) => element.dataset.san);

/** The SAN of every next-moves bar token, in render order. */
const barTokens = () =>
  screen.getAllByTestId(/^next-move-n/).map((element) => element.dataset.san);

const openTab = (tab: "moves" | "engine" | "position") =>
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
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.queryByTestId("move-ply-2")).toBeNull();

    expect(drag("e7", "e5")).toBe(true);
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
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");
    expect(screen.getByTestId("move-ply-3")).toHaveTextContent("Nf3");
    expect(moveTokens()).toEqual(["c5"]);
    expect(position()).toContain("2p5");
  });

  it("makes both lines navigable from the move list", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");

    const sicilian = position();
    const [variation] = screen.getAllByTestId(/^tree-move-n/);
    expect(variation).toHaveAttribute("data-san", "c5");

    // The numbered rows click out as mainline plies…
    await userEvent.click(screen.getByTestId("move-ply-2"));
    expect(position()).toContain("4p3");

    // …and the side-line run as the node it names.
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
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");
    expect(screen.queryAllByTestId(/^tree-move-n/)).toHaveLength(0);
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
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");
    expect(screen.getByTestId("move-ply-3")).toHaveTextContent("Nf3");
    expect(moveTokens()).toEqual(["c5", "Nc3"]);
  });
});

describe("Analysis Board — the pinned next-moves bar", () => {
  it("pins the continuations of the position on screen above the controls, mainline first", async () => {
    renderScreen();

    // A fork after 1. e4: e5 the mainline reply, c5 the variation.
    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");
    // Playing the variation navigated to it; step back to the fork it hangs off.
    await userEvent.click(screen.getByTestId("board-control-previous"));

    const bar = screen.getByTestId("analysis-next-moves");
    expect(barTokens()).toEqual(["e5", "c5"]);
    /*
      Pinned, not scrolled: a sibling of the tab's scrolling region (a child of
      it would scroll with the list), sitting above the step controls.
    */
    expect(
      bar.closest('[data-testid="analysis-panel-content-moves"]'),
    ).toBeNull();
    expect(
      bar.compareDocumentPosition(screen.getByTestId("board-controls")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("is nothing at all with one continuation, and at the end of a line", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    drag("g1", "f3");

    // The start position (one first move)…
    await userEvent.click(screen.getByTestId("board-control-first"));
    expect(screen.queryByTestId("analysis-next-moves")).not.toBeInTheDocument();
    expect(boardOptions().arrows).toEqual([]);
    // …a mid-line position with exactly one continuation…
    await userEvent.click(screen.getByTestId("board-control-next"));
    expect(screen.queryByTestId("analysis-next-moves")).not.toBeInTheDocument();
    expect(boardOptions().arrows).toEqual([]);
    // …and the end of the line. One continuation or none is not a fork — and
    // the board's half of the feature vanishes with the bar's, never one
    // without the other.
    await userEvent.click(screen.getByTestId("board-control-last"));
    expect(screen.queryByTestId("analysis-next-moves")).not.toBeInTheDocument();
    expect(boardOptions().arrows).toEqual([]);
  });

  it("counts the start position as its own fork when the tree has two first moves", async () => {
    renderScreen();

    drag("e2", "e4");
    await userEvent.click(screen.getByTestId("board-control-first"));
    drag("d2", "d4");
    await userEvent.click(screen.getByTestId("board-control-first"));

    expect(barTokens()).toEqual(["e4", "d4"]);
    // The fork the bar counts at the start is the one the board draws arrows
    // for: one per first move, each a move on offer.
    expect(boardOptions().arrows).toEqual([
      { startSquare: "e2", endSquare: "e4", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "d2", endSquare: "d4", color: NEXT_MOVE_ARROW_COLOR },
    ]);
  });

  it("reads a fork inside a side line, that line's own continuation first", async () => {
    renderScreen();

    // The side line's own second move is a fork: 2. Nc3 the continuation the
    // reader stands on (`children[0]` there), 2. Nf3 the alternative off it.
    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");
    drag("b1", "c3");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("g1", "f3");
    await userEvent.click(screen.getByTestId("board-control-previous"));

    expect(barTokens()).toEqual(["Nc3", "Nf3"]);
  });

  it("advances on a click, and re-reads the continuations of where it lands", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");
    await userEvent.click(screen.getByTestId("board-control-previous"));

    const [toSicilian] = screen
      .getAllByTestId(/^next-move-n/)
      .filter((element) => element.dataset.san === "c5");
    await userEvent.click(toSicilian);

    /*
      The same selection a side-line token in the list makes: the board shows
      the position after the move, the list highlights it there, and the bar —
      at the end of that line, with nothing to follow — is gone.
    */
    expect(position()).toContain("2p5");
    const standing = screen
      .getAllByTestId(/^tree-move-n/)
      .find((element) => element.getAttribute("aria-current") === "true");
    expect(standing).toHaveAttribute("data-san", "c5");
    expect(screen.queryByTestId("analysis-next-moves")).not.toBeInTheDocument();

    // Back at the fork, the choices are on offer again.
    await userEvent.click(screen.getByTestId("board-control-previous"));
    expect(barTokens()).toEqual(["e5", "c5"]);
  });

  it("puts an arrow on the board for every continuation, recoloured by hover", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");
    await userEvent.click(screen.getByTestId("board-control-previous"));

    /*
      The bar's board-side half: one arrow per continuation of the fork — e5
      the mainline, c5 the variation — in the green of a move on offer, the
      same language the Openings screen's explorer arrows speak.
    */
    expect(boardOptions().arrows).toEqual([
      { startSquare: "e7", endSquare: "e5", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "c7", endSquare: "c5", color: NEXT_MOVE_ARROW_COLOR },
    ]);

    // The token the pointer is over is the move a click will play: its arrow
    // alone turns red, and no other…
    const [toSicilian] = screen
      .getAllByTestId(/^next-move-n/)
      .filter((element) => element.dataset.san === "c5");
    await userEvent.hover(toSicilian);
    expect(boardOptions().arrows).toEqual([
      { startSquare: "e7", endSquare: "e5", color: NEXT_MOVE_ARROW_COLOR },
      {
        startSquare: "c7",
        endSquare: "c5",
        color: HOVERED_NEXT_MOVE_ARROW_COLOR,
      },
    ]);

    // …and the offer is back to green once the pointer leaves.
    await userEvent.unhover(toSicilian);
    expect(boardOptions().arrows).toEqual([
      { startSquare: "e7", endSquare: "e5", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "c7", endSquare: "c5", color: NEXT_MOVE_ARROW_COLOR },
    ]);
  });

  it("belongs to the Moves tab alone", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    expect(screen.getByTestId("analysis-next-moves")).toBeInTheDocument();
    expect(boardOptions().arrows).toHaveLength(2);

    // The bar is part of the moves UI: the other tabs carry neither half of
    // it — the strip, or the arrows on the board.
    await openTab("engine");
    expect(screen.queryByTestId("analysis-next-moves")).not.toBeInTheDocument();
    expect(boardOptions().arrows).toEqual([]);
    await openTab("position");
    expect(screen.queryByTestId("analysis-next-moves")).not.toBeInTheDocument();
    expect(boardOptions().arrows).toEqual([]);

    // …and both halves are back with the moves when the tab returns.
    await openTab("moves");
    expect(barTokens()).toEqual(["e5", "c5"]);
    expect(boardOptions().arrows).toHaveLength(2);
  });
});

describe("Analysis Board — the move list", () => {
  it("shows the mainline as the shared numbered-pairs list, and no second print of it", () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");

    // The same list the linear screens use: numbered pairs over the mainline,
    // each move a jump target.
    expect(screen.getByTestId("move-list")).toBeInTheDocument();
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");
    /*
      …and nothing else (CTA-53): the flowing tree that reprinted the mainline
      below the list is gone from the tab, so with no side lines there is no
      variation section at all.
    */
    expect(screen.queryByTestId("variation-tree")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^tree-move-n/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^tree-variation-/)).toHaveLength(0);
  });

  it("prints an eval beside each scored move, and nothing beside the rest", () => {
    renderScreen();

    // The start position is searched on arrival; a finished search records its
    // score against the FEN it describes.
    engineReports({ depth: 14, multipv: 1, cp: 40, pv: "e2e4 e7e5" });
    act(() => {
      engine().say({
        fen: engine().lastSearch,
        bestMove: "e2e4",
        uciMessage: "bestmove e2e4",
      });
    });
    expect(screen.getByTestId("move-eval-0")).toHaveTextContent("+0.40");

    // Black to move after 1. e4: the engine's number is from Black's side, so
    // −0.30 is White +0.30.
    drag("e2", "e4");
    engineReports({ depth: 12, multipv: 1, cp: -30, pv: "e7e5" });
    act(() => {
      engine().say({
        fen: engine().lastSearch,
        bestMove: "e7e5",
        uciMessage: "bestmove e7e5",
      });
    });
    expect(screen.getByTestId("move-eval-1")).toHaveTextContent("+0.30");

    // 1… e5 has not been searched — it prints nothing, not the no-data dash.
    expect(screen.queryByTestId("move-eval-2")).not.toBeInTheDocument();
  });

  it("reads the eval back by FEN, so returning to a position finds it again", async () => {
    renderScreen();

    engineReports({ depth: 14, multipv: 1, cp: 40, pv: "e2e4 e7e5" });
    act(() => {
      engine().say({
        fen: engine().lastSearch,
        bestMove: "e2e4",
        uciMessage: "bestmove e2e4",
      });
    });

    drag("e2", "e4");
    // Back to the start through the list itself.
    await userEvent.click(screen.getByTestId("move-ply-0"));

    // The map is keyed by FEN and not cleared by navigating, so the start
    // position reads the same score twice.
    expect(screen.getByTestId("move-eval-0")).toHaveTextContent("+0.40");
    expect(screen.getByTestId("move-ply-0")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("highlights the mainline move the selection names, and nothing while inside a side line", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    drag("g1", "f3");

    // Step back to after 1. e4 and answer it differently, then walk deeper
    // into the Sicilian: the selection is no ply of the mainline there.
    await userEvent.click(screen.getByTestId("board-control-first"));
    await userEvent.click(screen.getByTestId("board-control-next"));
    drag("c7", "c5");
    drag("b1", "c3");

    const highlighted = screen
      .queryAllByTestId(/^move-ply-/)
      .filter((element) => element.getAttribute("aria-current") === "true");
    expect(highlighted).toHaveLength(0);
    // …but the run the reader is standing in knows where they are: its token
    // is the highlighted one, inside the same list.
    const currentInSideLine = screen
      .getAllByTestId(/^tree-move-n/)
      .find((element) => element.getAttribute("aria-current") === "true");
    expect(currentInSideLine).toHaveAttribute("data-san", "Nc3");

    // A click on mainline move 2 walks out of the side line to that node.
    await userEvent.click(screen.getByTestId("move-ply-2"));
    expect(position()).toContain("4p3");
    expect(screen.getByTestId("move-ply-2")).toHaveAttribute(
      "aria-current",
      "true",
    );
    const currentInVariation = screen
      .queryAllByTestId(/^tree-move-n/)
      .find((element) => element.getAttribute("aria-current") === "true");
    expect(currentInVariation).toBeUndefined();
  });

  it("hangs a side line directly under the pair it answers, inside the list", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    drag("g1", "f3");
    await userEvent.click(screen.getByTestId("board-control-first"));
    await userEvent.click(screen.getByTestId("board-control-next"));
    drag("c7", "c5");

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
      expect.stringMatching(/^tree-variation-/),
      "move-ply-3",
    ]);
  });

  it("prints an eval beside a side-line move whose position the engine has scored", async () => {
    renderScreen();

    drag("e2", "e4");
    drag("e7", "e5");
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");

    // Standing in the side line, the engine searches the Sicilian position.
    const sicilian = position();
    expect(engine().lastSearch).toBe(sicilian);
    // Nothing is printed before a finished search records the score.
    expect(screen.queryAllByTestId(/^tree-eval-/)).toHaveLength(0);

    engineReports({ depth: 12, multipv: 1, cp: 20, pv: "b1c3" });
    act(() => {
      engine().say({
        fen: engine().lastSearch,
        bestMove: "b1c3",
        uciMessage: "bestmove b1c3",
      });
    });

    const [c5] = screen.getAllByTestId(/^tree-move-n/);
    const id = c5.getAttribute("data-testid")!.slice("tree-move-".length);
    expect(screen.getByTestId(`tree-eval-${id}`)).toHaveTextContent("+0.20");
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
    expect(screen.getByTestId("move-number-12")).toHaveTextContent("12.");
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("Nf6");
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
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");
    expect(screen.getByTestId("move-ply-3")).toHaveTextContent("Nf3");
    expect(screen.getByTestId("move-ply-4")).toHaveTextContent("Nc6");
    // The side line survived the load — `parsePgnGames` would have dropped it.
    expect(moveTokens()).toEqual(["c5", "Nf3"]);
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
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("d4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("d5");
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

describe("Analysis Board — Play from here", () => {
  it("hands the position on screen to Play with Engine as ?fen= from any tab", async () => {
    renderScreen();
    drag("e2", "e4");
    const fen = position();

    // The control sits above the tab strip — no tab has been opened here, the
    // Moves tab is simply the default.
    await userEvent.click(screen.getByTestId("analysis-play-from-here"));

    expect(screen.getByTestId("location")).toHaveAttribute(
      "data-pathname",
      "/engine/play",
    );
    // The FEN crosses in the URL, spaces and slashes intact.
    expect(handOffFen()).toBe(fen);
  });

  it("carries the FEN of the ply on screen, not the latest move", async () => {
    renderScreen();
    drag("e2", "e4");
    drag("e7", "e5");
    // Step back to the start — the position on screen is now an earlier ply.
    await userEvent.click(screen.getByTestId("board-control-first"));
    const backFen = position();

    await userEvent.click(screen.getByTestId("analysis-play-from-here"));

    expect(handOffFen()).toBe(backFen);
  });
});

describe("Analysis Board — the two switches", () => {
  it("stops searching when the engine is switched off, and says so", async () => {
    renderScreen();
    engineReports({ depth: 14, multipv: 1, cp: 40, pv: "e2e4 e7e5" });

    // The lines sit above the tab strip (CTA-55), so the engine's number is
    // on screen without opening any tab — the Moves tab is simply the default.
    expect(screen.getByTestId("analysis-variations")).toHaveTextContent(
      "+0.40",
    );

    // The switch sits beside them — it is clicked from wherever the reader is.
    await userEvent.click(screen.getByTestId("analysis-setting-engine"));

    // The running search is stopped rather than left to finish on its own.
    expect(engine().stops).toBeGreaterThan(0);

    const searchesWhenOff = engine().searches.length;
    drag("e2", "e4");
    expect(engine().searches).toHaveLength(searchesWhenOff);

    // The pinned block is gone rather than showing the stale line, and the
    // status row says the engine is off — honestly, not "waiting".
    expect(screen.queryByTestId("analysis-variations")).not.toBeInTheDocument();
    expect(screen.getByTestId("analysis-status")).toHaveTextContent(
      "The engine is off",
    );
  });

  it("searches the position on screen again when it is switched back on", async () => {
    renderScreen();

    // The switch is above the tab strip — the Moves tab is simply showing.
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

    // The engine switch is no longer in this tab — it lives above the strip.
    expect(
      screen
        .getByTestId("analysis-setting-engine")
        .closest('[data-testid="analysis-settings"]'),
    ).toBeNull();

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

describe("Analysis Board — the pinned lines", () => {
  /*
    CTA-55: lichess analysis behaviour. The engine's best lines sit above the
    tab strip on every tab, and each of their moves is a click that plays the
    line's prefix up to it — landing the reader on the move the click named.
  */

  it("has no Lines tab — the lines are the block above the strip", () => {
    renderScreen();

    expect(
      screen.queryByTestId("analysis-panel-tab-lines"),
    ).not.toBeInTheDocument();
    // The strip that is left.
    for (const id of ["moves", "engine", "position"] as const) {
      expect(
        screen.getByTestId(`analysis-panel-tab-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("pins the lines above the tab strip, whichever tab is open", async () => {
    renderScreen();
    engineReports({ depth: 14, multipv: 1, cp: 40, pv: "e2e4 e7e5" });

    const block = screen.getByTestId("analysis-variations");
    expect(block).toHaveTextContent("1. e4 e5");

    // Above every tab is a DOM fact, not only a layout one: the strip follows
    // the block in document order.
    const strip = screen.getByTestId("analysis-panel-tab-moves");
    expect(
      block.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // …and the block stays on screen through the other tabs and back.
    await openTab("engine");
    expect(screen.getByTestId("analysis-variations")).toBeInTheDocument();
    await openTab("position");
    expect(screen.getByTestId("analysis-variations")).toBeInTheDocument();
    await openTab("moves");
    expect(screen.getByTestId("analysis-variations")).toBeInTheDocument();
  });

  it("plays a line's prefix up to the move clicked", async () => {
    renderScreen();
    engineReports({ depth: 14, multipv: 1, cp: 20, pv: "e2e4 e7e5 g1f3" });

    // Clicking the third move plays all three, and the board ends on the move
    // the click named — no second or third click needed.
    await userEvent.click(screen.getByTestId("variation-1-move-3"));

    const played = new Chess();
    played.move("e4");
    played.move("e5");
    played.move("Nf3");
    expect(position()).toBe(played.fen());
    expect(screen.getByTestId("move-ply-3")).toHaveTextContent("Nf3");
  });

  it("follows a line the tree already holds when the same prefix is clicked again", async () => {
    renderScreen();
    engineReports({ depth: 14, multipv: 1, cp: 30, pv: "e2e4 e7e5" });

    await userEvent.click(screen.getByTestId("variation-1-move-2"));
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");

    // Back at the start, the engine offers the same line again. Clicking it
    // must walk the moves that already exist…
    await userEvent.click(screen.getByTestId("board-control-first"));
    engineReports({ depth: 14, multipv: 1, cp: 30, pv: "e2e4 e7e5" });
    await userEvent.click(screen.getByTestId("variation-1-move-2"));

    // …rather than forking the mainline into a duplicate of itself: no side
    // line hangs under the list, and the game is still two moves long.
    expect(screen.queryAllByTestId(/^tree-move-n/)).toHaveLength(0);
    expect(screen.queryByTestId("move-ply-3")).toBeNull();
  });

  it("plays a line as a side line when the reader is standing on an earlier node", async () => {
    renderScreen();
    engineReports({ depth: 14, multipv: 1, cp: 30, pv: "e2e4 e7e5" });
    await userEvent.click(screen.getByTestId("variation-1-move-2"));

    // Back at the start, the engine offers a different line…
    await userEvent.click(screen.getByTestId("board-control-first"));
    engineReports({ depth: 14, multipv: 1, cp: 20, pv: "d2d4 d7d5" });

    // …and playing it forks the game rather than rewriting the mainline: the
    // new run hangs under the first move as a side line, and the board ends on
    // the move the click named.
    await userEvent.click(screen.getByTestId("variation-1-move-2"));
    expect(moveTokens()).toEqual(["d4", "d5"]);
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");

    const forked = new Chess();
    forked.move("d4");
    forked.move("d5");
    expect(position()).toBe(forked.fen());
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
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("Qe7+");
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

describe("Analysis Board — arriving with a whole game", () => {
  /*
    The `?game=` hand-off from a User PGNs detail page. What crosses is a
    reference into the catalog rather than the PGN itself — a game does not fit
    in a URL — and this screen is the one destination that re-reads the text with
    the *variation-aware* parser, because side lines are what an analysis board
    is for.
  */
  const withVariations = pgnCatalog.items.find(
    (item) => item.kind === "game" && item.pgn.includes("("),
  )!;

  const referenceTo = (item: typeof withVariations) =>
    `pgn/${item.category}/${item.id}`;

  it("opens on the game the reference names, at its starting position", async () => {
    if (withVariations.kind !== "game") throw new Error("expected a game");
    const entry = `/tools/analysis?game=${encodeURIComponent(referenceTo(withVariations))}`;
    renderScreen(entry);

    expect(position()).toBe(initialFenOf(withVariations.game));

    await openTab("moves");
    // A game does not turn the board (see the root CLAUDE.md), so it opens on
    // White whatever the position's side to move is.
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "white",
    );
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent(
      withVariations.game.moves[0].san,
    );
  });

  it("keeps the game's side lines, which the catalog's mainline does not have", async () => {
    if (withVariations.kind !== "game") throw new Error("expected a game");
    renderScreen(
      `/tools/analysis?game=${encodeURIComponent(referenceTo(withVariations))}`,
    );

    await openTab("moves");
    /*
      `chess.js` `loadPgn` discards `( … )`, so the `Game` the catalog holds is
      the mainline alone. This screen parses the PGN text again with
      `parsePgnTree`, so the list it shows is strictly larger: the same numbered
      rows, plus the side lines hanging under them.
    */
    expect(
      screen.getByTestId(`move-ply-${withVariations.game.moves.length}`),
    ).toBeInTheDocument();
    expect(moveTokens().length).toBeGreaterThan(0);
  });

  it("ignores a reference that names nothing, rather than throwing on the link", () => {
    renderScreen("/tools/analysis?game=pgn/no-such-folder/no-such-game");

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
  });

  it("opens stepped to the mainline ply a ?move= names", () => {
    if (withVariations.kind !== "game") throw new Error("expected a game");
    renderScreen(
      `/tools/analysis?game=${encodeURIComponent(referenceTo(withVariations))}&move=3`,
    );

    expect(position()).toBe(withVariations.game.moves[2].fen);
  });

  it.each(["abc", "-3"])(
    "ignores a ?move= that is not a ply (%s), as if it were not there",
    (move) => {
      if (withVariations.kind !== "game") throw new Error("expected a game");
      renderScreen(
        `/tools/analysis?game=${encodeURIComponent(referenceTo(withVariations))}&move=${move}`,
      );

      expect(position()).toBe(initialFenOf(withVariations.game));
    },
  );

  it("clamps a ?move= past the end of the mainline to its last move", () => {
    if (withVariations.kind !== "game") throw new Error("expected a game");
    renderScreen(
      `/tools/analysis?game=${encodeURIComponent(referenceTo(withVariations))}&move=99999`,
    );

    expect(position()).toBe(withVariations.game.moves.at(-1)!.fen);
  });

  describe("with a StartPly tag", () => {
    /*
      Seeded through an upload: the tag lives in the PGN text itself, so an
      uploaded file declares it exactly as a shipped one would. The ply is a
      *mainline* walk, the same unit a `?move=` speaks.
    */
    const START_PLY_PGN = `[Event "Uploaded: Chapter 1"]
[Result "*"]
[StudyName "Uploaded Study"]
[ChapterName "Chapter 1"]
[StartPly "3"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *

`;

    const tagged = parsePgnGames(START_PLY_PGN)[0];
    const taggedReference = "pgn/uploads/my-study/chapter-1";

    beforeEach(() => {
      clearUploads();
      addUpload("my_study.pgn", START_PLY_PGN);
    });

    it("opens on the mainline ply the game's StartPly tag declares", () => {
      renderScreen(`/tools/analysis?game=${encodeURIComponent(taggedReference)}`);

      expect(position()).toBe(fenAtPly(tagged, 3));
    });

    it("lets an explicit ?move= win over the tag", () => {
      renderScreen(
        `/tools/analysis?game=${encodeURIComponent(taggedReference)}&move=1`,
      );

      expect(position()).toBe(fenAtPly(tagged, 1));
    });
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
    expect(screen.queryByTestId("move-ply-1")).toBeNull();
  });

  it("flips the board without touching the game", async () => {
    renderScreen();
    drag("e2", "e4");

    await userEvent.click(screen.getByTestId("board-control-flip"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
  });

  it("terminates the worker when the screen goes away", () => {
    const { unmount } = renderScreen();
    const instance = engine();

    unmount();
    expect(instance.terminated).toBe(true);
  });
});

describe("Analysis Board — writing the board down", () => {
  /*
    The screen saves as the reader works (`lib/savedAnalyses.ts`), so these read
    the real store — jsdom's `localStorage`, cleared between tests by
    `src/test/setup.ts`, which is the behaviour under test rather than something
    to mock away.
  */
  const stored = () => savedAnalysesSnapshot();

  it("writes nothing for a board nobody has touched", () => {
    renderScreen();

    expect(stored()).toEqual([]);
  });

  it("writes the board once a move is played, and goes on writing to that row", () => {
    renderScreen();

    drag("e2", "e4");
    expect(stored()).toHaveLength(1);
    expect(stored()[0].pgn).toContain("1. e4");

    drag("e7", "e5");
    expect(stored()).toHaveLength(1);
    expect(stored()[0].pgn).toContain("e5");
  });

  it("keeps the side lines, which is the whole reason the record is a tree", async () => {
    renderScreen();
    drag("e2", "e4");
    drag("e7", "e5");

    // Back to after 1. e4 and play a different reply: a variation, not a
    // replacement.
    await userEvent.click(screen.getByTestId("board-control-previous"));
    drag("c7", "c5");

    expect(stored()[0].pgn).toContain("(");
    expect(stored()[0].pgn).toContain("c5");
  });

  it("records where the reader is standing, so the row reopens there", async () => {
    renderScreen();
    drag("e2", "e4");
    drag("e7", "e5");

    await userEvent.click(screen.getByTestId("board-control-previous"));

    expect(stored()[0].path).toEqual(["e4"]);
  });

  it("records which way the board is facing", async () => {
    renderScreen();
    drag("e2", "e4");

    await userEvent.click(screen.getByTestId("board-control-flip"));

    expect(stored()[0].orientation).toBe("black");
  });

  it("starts a new row when the board is cleared, keeping the one left behind", async () => {
    renderScreen();
    drag("e2", "e4");
    const first = stored()[0].id;

    await openTab("engine");
    await userEvent.click(screen.getByTestId("analysis-clear"));
    // An empty board is not an analysis yet — nothing is written until a move.
    expect(stored().map((row) => row.id)).toEqual([first]);

    drag("d2", "d4");
    const ids = stored().map((row) => row.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(first);
  });

  /* A shipped game that begins at the standard start, so a test can play a
     move of its own into it from the position the screen opens on. */
  const shippedGame = pgnCatalog.items.find(
    (item) =>
      item.kind === "game" &&
      item.game.moves.length > 2 &&
      initialFenOf(item.game) === START_FEN,
  )!;
  const arriveAtShippedGame = () =>
    renderScreen(
      `/tools/analysis?game=${encodeURIComponent(
        `pgn/${shippedGame.category}/${shippedGame.id}`,
      )}`,
    );

  it("does not write a game merely opened here and stepped through", async () => {
    arriveAtShippedGame();

    await userEvent.click(screen.getByTestId("board-control-next"));
    await userEvent.click(screen.getByTestId("board-control-next"));

    // Replaying the line that arrived is not analysing it, and a list filled
    // with every library game anyone opened here would be useless.
    expect(stored()).toEqual([]);
  });

  it("does write once the reader plays a move of their own into it", () => {
    if (shippedGame.kind !== "game") throw new Error("expected a game");
    arriveAtShippedGame();

    // A first move the game itself did not play — so the tree really grows.
    const first = shippedGame.game.moves[0].san;
    const [from, to] = first === "e4" ? ["d2", "d4"] : ["e2", "e4"];
    drag(from, to);

    expect(stored()).toHaveLength(1);
  });
});

describe("Analysis Board — reopening a saved analysis", () => {
  /** Put one in the store and arrive at its `?analysis=` link. */
  const reopen = (saved: SavedAnalysis) => {
    saveAnalysis(saved);
    return renderScreen(`/tools/analysis?analysis=${saved.id}`);
  };

  /** A tree grown by playing SAN, branching from an earlier point on request. */
  const grow = (
    lines: readonly (readonly [readonly string[], readonly string[]])[],
  ) => {
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

  const savedAt = new Date("2026-09-07T10:00:00.000Z");

  it("comes back with its side lines, standing where it was left", async () => {
    const tree = grow([
      [[], ["e4", "e5", "Nf3"]],
      [["e4"], ["c5"]],
    ]);
    reopen(
      savedAnalysisOf(
        "a1",
        tree,
        ["e4", "c5"],
        DEFAULT_ANALYSIS_SETTINGS,
        "white",
        savedAt,
      ),
    );

    expect(position()).toBe(fenAtNode(tree, nodeAtSanPath(tree, ["e4", "c5"])));

    await openTab("moves");
    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("e4");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("e5");
    expect(screen.getByTestId("move-ply-3")).toHaveTextContent("Nf3");
    // The side line is back, hanging under the move it answers.
    expect(moveTokens()).toEqual(["c5"]);
    // …and the reader reopens standing inside it, not on the mainline.
    const standing = screen
      .getAllByTestId(/^tree-move-n/)
      .find((element) => element.getAttribute("aria-current") === "true");
    expect(standing).toHaveAttribute("data-san", "c5");
  });

  it("comes back facing the way it was left, and at its own settings", () => {
    reopen(
      savedAnalysisOf(
        "a1",
        grow([[[], ["e4"]]]),
        [],
        { depth: 22, multiPv: 5, moveTimeMs: 0 },
        "black",
        savedAt,
      ),
    );

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    expect(engine().setOptions).toContainEqual(["MultiPV", 5]);
  });

  it("goes on writing to the same row rather than starting a second", () => {
    reopen(
      savedAnalysisOf(
        "a1",
        grow([[[], ["e4", "e5"]]]),
        ["e4", "e5"],
        DEFAULT_ANALYSIS_SETTINGS,
        "white",
        savedAt,
      ),
    );

    drag("g1", "f3");

    const stored = savedAnalysesSnapshot();
    expect(stored.map((row) => row.id)).toEqual(["a1"]);
    expect(stored[0].pgn).toContain("Nf3");
  });

  it("opens an empty board for an id that names nothing", () => {
    renderScreen("/tools/analysis?analysis=nope");

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);
  });
});

describe("Analysis Board — the captured-pieces strips", () => {
  it("shows nothing on a position handed over, until something is taken", () => {
    // A queen-vs-rook-and-pawn study position: nothing on it is "captured"
    // relative to its own start, so the strips are empty.
    const study = "6rk/7p/8/8/8/8/8/K6Q w - - 0 1";
    renderScreen(`/tools/analysis?fen=${encodeURIComponent(study)}`);

    const white = screen.getByTestId("analysis-captured-white");
    const black = screen.getByTestId("analysis-captured-black");
    expect(white).toBeInTheDocument();
    expect(black).toBeInTheDocument();
    expect(white).not.toHaveAttribute("data-diff");
    expect(black).not.toHaveAttribute("data-diff");

    // White takes the study's pawn: one point up of the line's own start.
    drag("h1", "h7");

    expect(white).toHaveAttribute("data-diff", "1");
    expect(white).toHaveTextContent("+1");
    expect(screen.getByTestId("piece-bP")).toBeInTheDocument();
    expect(black).not.toHaveAttribute("data-diff");
  });
});
