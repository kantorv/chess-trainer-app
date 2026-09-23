/**
 * The stand-ins every v2 board's tests share (it lives here, beside the core,
 * from the days of the Development section — CTA-60 to CTA-79).
 *
 * Not a test file — a helper the test files pull their `vi.mock` factories
 * from, because the boards composed from one core want one set of stubs, not
 * a copy each. Which is the same argument the core itself makes.
 *
 * Two things have to be stubbed for any board screen under jsdom
 * (`.claude/rules/chessboard.md` §8):
 *
 * - **`<Chessboard>`** measures its own square on mount and throws
 *   `"Square width not found"` where there is no layout engine. The stub keeps
 *   hold of the options it was handed, which is how a test drags a piece and
 *   reads the arrows back. A screen with the captured-pieces strips reaches for
 *   `defaultPieces` too, and the promotion picker for
 *   `chessColumnToColumnIndex`, so the mock provides those.
 * - **`Engine`** builds a real `Worker`, which jsdom has none of. The fake
 *   records what was searched and lets a test push UCI results back, so a
 *   board's engine behaviour is driven exactly and synchronously — including
 *   the property the core exists to keep, that a board which passes no
 *   `onBestMove` never moves a piece.
 */
import type { ReactNode } from "react";

type Listener = (message: Record<string, unknown>) => void;

/** A `lib/engine.ts` stand-in: no worker, and every message pushed by hand. */
export class FakeEngine {
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

  /** The most recently constructed instance — what a mounted screen talks to. */
  static latest(): FakeEngine {
    const instance = FakeEngine.instances.at(-1);
    if (!instance) throw new Error("no engine was constructed");
    return instance;
  }

  static reset() {
    FakeEngine.instances = [];
  }
}

/** The options the board stub was last handed — shared by the mock and the test. */
export const boardSpy: { options: Record<string, unknown> | null } = {
  options: null,
};

/** The `react-chessboard` stand-in, as a `vi.mock` factory's return value. */
export const reactChessboardMock = () => ({
  Chessboard: ({ options }: { options: Record<string, unknown> }) => {
    boardSpy.options = options;
    return (
      <div
        data-testid="board"
        data-board-id={String(options.id)}
        data-position={String(options.position)}
        data-orientation={String(options.boardOrientation)}
        data-dragging={String(options.allowDragging)}
        data-arrows={String(
          (options.arrows as { endSquare: string }[] | undefined)?.length ?? 0,
        )}
        data-masked={String(options.pieces !== undefined)}
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
  // The captured-pieces strips draw their icons with these.
  defaultPieces: Object.fromEntries(
    ["w", "b"].flatMap((color) =>
      ["K", "Q", "R", "B", "N", "P"].map((letter) => {
        const key = `${color}${letter}`;
        return [key, () => <svg data-testid={`piece-${key}`} />];
      }),
    ),
  ),
});

/**
 * The opening book, stubbed: the shared `CurrentOpening` and the book
 * capability must not pull the real ~3MB eco.json into a screen test.
 */
export const openingsMock = async (
  importOriginal: () => Promise<typeof import("../../lib/openings")>,
) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadOpeningBook: () => Promise.resolve({}),
    getPositionBook: () => ({}),
    findOpening: () => undefined,
    knownMoveOpenings: () => [],
  };
};

/** The board options the stub was last handed, or a legible failure. */
export const boardOptions = () => {
  if (boardSpy.options === null) {
    throw new Error("the board has not rendered");
  }
  return boardSpy.options as {
    id?: string;
    position?: string;
    boardOrientation?: "white" | "black";
    allowDragging?: boolean;
    pieces?: unknown;
    arrows?: { startSquare: string; endSquare: string; color: string }[];
    onPieceDrop?: (args: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => boolean;
  };
};

/** A tiny type alias so a test can name a rendered screen without `any`. */
export type Screen = () => ReactNode;
