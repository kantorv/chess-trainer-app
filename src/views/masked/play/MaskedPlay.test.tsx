import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import MaskedPlay from "./MaskedPlay";

/*
  Stood in for exactly as on `/engine/play`, and for the same two reasons:
  `<Chessboard>` measures a square jsdom cannot give it
  (`.claude/rules/chessboard.md` §8), and `Engine` builds a `Worker` there is
  none of. The board stub additionally keeps the `pieces` renderer it was
  handed, which is how a test reads what the mask is drawing.
*/

const harness = vi.hoisted(() => {
  type Listener = (message: Record<string, unknown>) => void;

  class FakeEngine {
    static instances: FakeEngine[] = [];

    readonly searches: string[] = [];
    readonly options = new Map<
      string,
      { name: string; type: string; min?: number; max?: number }
    >([
      ["MultiPV", { name: "MultiPV", type: "spin", min: 1, max: 500 }],
      ["Skill Level", { name: "Skill Level", type: "spin", min: 0, max: 20 }],
    ]);
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

    setOption(name: string) {
      return this.options.has(name);
    }

    search(fen: string) {
      this.searches.push(fen);
    }

    stop() {}

    terminate() {
      this.listeners.clear();
    }

    say(message: Record<string, unknown>) {
      [...this.listeners].forEach((listener) => listener(message));
    }

    get lastSearch() {
      return this.searches.at(-1);
    }
  }

  const board: { options: Record<string, never> | null } = { options: null };

  /*
    Named stand-ins for the library's piece drawings. `maskedPieces` looks a
    type up in `defaultPieces` and hands back what it finds, so asserting that
    the renderer under `wR` is the *pawn's* one is exactly the assertion "a rook
    is drawn as a pawn" — and it needs the two to be distinguishable objects.
  */
  const defaultPieces = Object.fromEntries(
    ["w", "b"].flatMap((color) =>
      ["K", "Q", "R", "B", "N", "P"].map((letter) => {
        const type = `${color}${letter}`;
        return [type, () => <svg data-testid={`piece-${type}`} />];
      }),
    ),
  );

  return { FakeEngine, board, defaultPieces };
});

vi.mock("../../../lib/engine", () => ({ default: harness.FakeEngine }));

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: Record<string, never> }) => {
    harness.board.options = options;
    return (
      <div
        data-testid="board"
        data-position={(options as { position?: string }).position}
        data-dragging={String(
          (options as { allowDragging?: boolean }).allowDragging,
        )}
      />
    );
  },
  chessColumnToColumnIndex: (
    column: string,
    _columns: number,
    orientation: string,
  ) =>
    orientation === "white"
      ? column.charCodeAt(0) - "a".charCodeAt(0)
      : 7 - (column.charCodeAt(0) - "a".charCodeAt(0)),
  defaultPieces: harness.defaultPieces,
}));

const engine = () => {
  const instance = harness.FakeEngine.instances.at(-1);
  if (!instance) throw new Error("no engine was constructed");
  return instance;
};

const boardOptions = () => {
  const options = harness.board.options as {
    position?: string;
    pieces?: Record<string, unknown>;
    onPieceDrop?: (args: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => boolean;
  } | null;
  if (!options) throw new Error("the board has not rendered");
  return options;
};

/** What the board is told to draw for one piece type. */
const drawnAs = (type: string) => boardOptions().pieces?.[type];

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

const engineReplies = (uci: string) => {
  const fen = engine().lastSearch;
  act(() => {
    engine().say({ fen, bestMove: uci, uciMessage: `bestmove ${uci}` });
  });
};

const engineReports = (info: { depth: number; multipv: number; cp: number; pv: string }) => {
  const fen = engine().lastSearch;
  act(() => {
    engine().say({
      fen,
      uciMessage: "info",
      depth: info.depth,
      multipv: info.multipv,
      positionEvaluation: String(info.cp),
      pv: info.pv,
    });
  });
};

const renderScreen = (entry = "/masked/play") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <MaskedPlay />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const position = () => screen.getByTestId("board").getAttribute("data-position");

const openTab = (id: string) =>
  userEvent.click(screen.getByTestId(`masked-panel-tab-${id}`));

beforeEach(async () => {
  harness.FakeEngine.instances = [];
  harness.board.options = null;
  await i18n.changeLanguage("en");
});

describe("Masked Pieces — what the board draws", () => {
  it("opens on the canonical exercise: the non-pawns drawn as pawns", () => {
    renderScreen();

    expect(drawnAs("wQ")).toBe(harness.defaultPieces.wP);
    expect(drawnAs("bN")).toBe(harness.defaultPieces.bP);
    // The kings are the landmark this preset leaves standing.
    expect(drawnAs("wK")).toBe(harness.defaultPieces.wK);
  });

  it("changes only what is drawn when the mask changes", async () => {
    renderScreen();
    const before = position();

    await openTab("masking");
    await userEvent.click(screen.getByTestId("mask-preset-allIdentical"));

    expect(drawnAs("wK")).toBe(harness.defaultPieces.wP);
    // The position itself is untouched: the mask never reaches `chess.js`.
    expect(position()).toBe(before);
  });

  it("shows the real pieces again on the identity preset", async () => {
    renderScreen();

    await openTab("masking");
    await userEvent.click(screen.getByTestId("mask-preset-identity"));

    expect(drawnAs("wQ")).toBe(harness.defaultPieces.wQ);
    expect(drawnAs("bR")).toBe(harness.defaultPieces.bR);
  });

  it("masks one type on its own, and one colour on its own", async () => {
    renderScreen();

    await openTab("masking");
    await userEvent.click(screen.getByTestId("mask-preset-identity"));
    await userEvent.selectOptions(screen.getByTestId("mask-select-bR"), "bP");

    expect(drawnAs("bR")).toBe(harness.defaultPieces.bP);
    // White's rook is a different entry and is left alone.
    expect(drawnAs("wR")).toBe(harness.defaultPieces.wR);
  });
});

describe("Masked Pieces — the game underneath is ordinary chess", () => {
  it("plays a full exchange, exactly as the unmasked screen does", () => {
    renderScreen();

    expect(drag("e2", "e4")).toBe(true);
    expect(position()).toContain("4P3");
    expect(engine().lastSearch).toBe(position());

    engineReplies("e7e5");
    expect(position()).toContain("4p3");
  });

  it("still refuses a move that is illegal for the real piece", () => {
    renderScreen();
    const before = position();

    // The knight on g1 is drawn as a pawn; it is still a knight, and a pawn's
    // move from g1 is not one of its moves.
    expect(drag("g1", "g3")).toBe(false);
    expect(position()).toBe(before);

    // What it can do is what a knight can do.
    expect(drag("g1", "f3")).toBe(true);
  });

  it("castles, which is a king move the board is drawing as a king", () => {
    renderScreen();
    drag("e2", "e4");
    engineReplies("e7e5");
    drag("g1", "f3");
    engineReplies("b8c6");
    drag("f1", "c4");
    engineReplies("g8f6");

    expect(drag("e1", "g1")).toBe(true);
    // Rook on f1, king on g1: the whole castle, from a board that never knew.
    expect(position()).toMatch(/^r1bqkb1r\/pppp1ppp.*RNBQ1RK1/);
  });

  it("draws a promoted pawn as whatever a queen is drawn as", async () => {
    // White is one move from queening, and the queens are drawn as pawns.
    const fen = "7k/4P3/8/8/8/8/8/7K w - - 0 1";
    renderScreen(`/masked/play?fen=${encodeURIComponent(fen)}`);

    expect(drag("e7", "e8")).toBe(true);
    await userEvent.click(screen.getByTestId("promotion-choice-q"));

    // A queen on e8 in the real position...
    expect(position()).toMatch(/^4Q2k/);
    // ...and nothing on the board to say so, because nothing recorded that the
    // pawn used to be a pawn: the mask is read per type, at render time.
    expect(drawnAs("wQ")).toBe(harness.defaultPieces.wP);
  });
});

describe("Masked Pieces — the notation", () => {
  const playTwoMoves = () => {
    renderScreen();
    drag("g1", "f3");
    engineReplies("g8f6");
  };

  it("writes a masked piece's move as coordinates, on by default", () => {
    playTwoMoves();

    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("g1f3");
    expect(screen.getByTestId("move-ply-2")).toHaveTextContent("g8f6");
    expect(screen.getByTestId("move-list")).not.toHaveTextContent("Nf3");
  });

  it("hides the pieces in the engine's variations too", async () => {
    renderScreen();
    engineReports({ depth: 20, multipv: 1, cp: 30, pv: "g1f3 g8f6" });

    await openTab("lines");

    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "1. g1f3 g8f6",
    );
  });

  it("gives the notation back when the setting is switched off", async () => {
    playTwoMoves();

    await openTab("masking");
    await userEvent.click(
      screen.getByTestId("mask-setting-notation").querySelector("input")!,
    );
    await openTab("game");

    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("Nf3");
  });

  it("leaves SAN alone once nothing on the board is hidden", async () => {
    playTwoMoves();

    await openTab("masking");
    await userEvent.click(screen.getByTestId("mask-preset-identity"));
    await openTab("game");

    expect(screen.getByTestId("move-ply-1")).toHaveTextContent("Nf3");
  });
});

describe("Masked Pieces — the rest of the screen", () => {
  it("is Play with Engine: eval bar, settings, variations and board controls", async () => {
    renderScreen();
    engineReports({ depth: 18, multipv: 1, cp: 120, pv: "e2e4 e7e5" });

    expect(screen.getByTestId("eval-bar")).toHaveAttribute(
      "data-score",
      "+1.20",
    );

    await openTab("engine");
    expect(screen.getByTestId("engine-settings")).toBeInTheDocument();

    await openTab("lines");
    expect(screen.getByTestId("best-variations")).toBeInTheDocument();

    expect(screen.getByTestId("board-control-flip")).toBeInTheDocument();
  });

  it("takes a position handed over in the URL, and faces the side to move", () => {
    const handedOver = "6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1";
    renderScreen(`/masked/play?fen=${encodeURIComponent(handedOver)}`);

    expect(position()).toBe(handedOver);
    expect(engine().lastSearch).toBe(handedOver);
  });

  it("does not share a board id with the unmasked screen", () => {
    renderScreen();

    // Two boards on one page must not answer to the same `options.id`
    // (`.claude/rules/chessboard.md` §2).
    expect((boardOptions() as { id?: string }).id).toBe("masked-play");
  });
});
