import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { Chess } from "chess.js";
import { useLocation } from "react-router";

import i18n from "../../i18n";
import { downloadPgn } from "../../lib/pgnExport";
import { SAVED_REPERTOIRES_STORAGE_KEY } from "../../lib/savedRepertoireStore";
import {
  NEXT_MOVE_ARROW_COLOR,
  SIDELINE_NEXT_MOVE_ARROW_COLOR,
} from "../tools/analysis/nextMoveArrows";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import {
  renderSection,
  storeRepertoire,
} from "./repertoireTestKit";

/*
  The repertoire player (CTA-63) — a repertoire's own view — with the real panel —
  `RepertoirePropagation.test.tsx` is the other half, with the panel replaced
  by a sentinel. The board is stubbed as `chessboard.md` §8 requires (the
  Development section's stand-ins, `defaultPieces` included), the trainer's
  "thinking" delay runs on fake timers, and `Math.random` is pinned so the
  trainer's uniform pick is deterministic.
*/
vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../dev/devTestHarness");
  return reactChessboardMock();
});
vi.mock("../../lib/engine", async () => ({
  default: (await import("../dev/devTestHarness")).FakeEngine,
}));
vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../dev/devTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../lib/openings")>,
  );
});
vi.mock("../../lib/pgnExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/pgnExport")>()),
  downloadPgn: vi.fn(() => true),
}));

/** `3... Bf5` mainline, `3... c5` a side line: the trainer's one real choice. */
const CARO = [
  '[Event "My Caro"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *",
].join("\n");

/** The FEN after a line of SANs from the start. */
const fenAfter = (...sans: string[]) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
};

const position = () => boardOptions().position;
const status = () => screen.getByTestId("repertoire-board-status").getAttribute("data-status");

/** Mount the screen and let the tree be read (the `setTimeout(0)` parse). */
const mountIdle = (path: string) => {
  renderSection(path);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};

/** Mount it with Autoplay switched on — the trainer answering. */
const mount = (path: string) => {
  mountIdle(path);
  openSettings();
  fireEvent.click(screen.getByTestId("repertoire-board-setting-autoplay").querySelector("input")!);
  fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));
};

/** The reader drags a piece. */
const drop = (from: string, to: string) =>
  act(() => {
    boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });

/** Open the Settings tab, where the side and the arrows live. */
const openSettings = () =>
  fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-settings"));

/** Switch the engine on — its switch is in the Settings tab. */
const engineOn = () => {
  openSettings();
  fireEvent.click(screen.getByTestId("repertoire-board-setting-engine").querySelector("input")!);
};

/** Long enough for the trainer to have replied, if it is going to. */
const wait = () =>
  act(() => {
    vi.advanceTimersByTime(2_000);
  });

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
  vi.mocked(downloadPgn).mockClear();
  vi.useFakeTimers();
  // The first of the node's moves — children[0] — every time.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the repertoire player, Autoplay on", () => {
  it("renders on the shared shell, facing the repertoire's main color, engine off", () => {
    mountIdle(`/repertoires/${storeRepertoire("r", CARO, "Caro")}`);

    expect(boardOptions().id).toBe("repertoire-board");
    expect(screen.getByTestId("repertoire-board-panel")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-name")).toHaveTextContent("Caro");
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "white");
    // A drill shows no answer until asked: the engine is off — no lines, no
    // bar, no search — and the status row says so.
    expect(screen.queryByTestId("repertoire-board-panel-variations")).not.toBeInTheDocument();
    expect(screen.queryByTestId("eval-bar")).not.toBeInTheDocument();
    expect(FakeEngine.latest().searches).toEqual([]);
    expect(screen.getByTestId("repertoire-board-panel-status")).toHaveTextContent(
      i18n.t("analysis.settings.engineOff"),
    );
    // Moves · Map · Settings · Engine, the Engine tab disabled while its engine is off.
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("data-testid"))).toEqual([
      "repertoire-board-panel-tab-moves",
      "repertoire-board-panel-tab-map",
      "repertoire-board-panel-tab-settings",
      "repertoire-board-panel-tab-engine",
    ]);
    expect(screen.getByTestId("repertoire-board-panel-tab-engine")).toBeDisabled();
    // Its switch is in Settings, and off.
    openSettings();
    expect(
      screen.getByTestId("repertoire-board-setting-engine").querySelector("input"),
    ).not.toBeChecked();
    // Autoplay is off by default: the reader moves both sides, and the footer
    // is the next-moves bar rather than the trainer's status.
    expect(
      screen.getByTestId("repertoire-board-setting-autoplay").querySelector("input"),
    ).not.toBeChecked();
    expect(screen.queryByTestId("repertoire-board-status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));
    drop("e2", "e4");
    wait();
    expect(position()).toBe(fenAfter("e4"));
    for (const [from, to] of [["c7", "c6"], ["d2", "d4"], ["d7", "d5"], ["e4", "e5"]]) {
      drop(from, to);
    }
    wait();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5"));
    // At the fork, the bar offers the repertoire's two answers.
    expect(screen.getByTestId("analysis-next-moves")).toHaveTextContent("Bf5");
  });

  it("replies from the repertoire after the reader moves", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);

    drop("e2", "e4");
    expect(status()).toBe("trainer-thinking");
    expect(position()).toBe(fenAfter("e4"));

    wait();
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(status()).toBe("your-move");
  });

  it("picks among the repertoire's moves, not only the mainline", () => {
    vi.mocked(Math.random).mockReturnValue(0.9);
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);

    for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"]]) {
      drop(from, to);
      wait();
    }
    // At 3. e5 the repertoire has Bf5 and c5; a draw near 1 takes the second.
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));
  });

  it("moves first when the reader takes Black, and the side toggle restarts", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    drop("e2", "e4");
    wait();
    expect(position()).toBe(fenAfter("e4", "c6"));

    openSettings();
    fireEvent.click(screen.getByTestId("repertoire-board-side-black"));
    // Back at the start, facing Black, and the trainer thinking as White.
    expect(position()).toBe(new Chess().fen());
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "black");
    expect(status()).toBe("trainer-thinking");

    wait();
    expect(position()).toBe(fenAfter("e4"));
  });

  it("adds a move the repertoire does not have, marks it, and stays silent after it", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    drop("e2", "e4");
    wait();

    // 2. d3 instead of the repertoire's 2. d4: a new side line.
    drop("d2", "d3");
    expect(status()).toBe("out-of-book");
    const added = document.querySelector('[data-san="d3"]');
    expect(added).toHaveAttribute("data-extension", "true");
    // The repertoire's own moves are not marked.
    expect(screen.getByTestId("move-ply-3")).not.toHaveAttribute("data-extension");

    wait();
    expect(position()).toBe(fenAfter("e4", "c6", "d3"));

    // Past the end of the variation the reader moves both colours, and every
    // move extends the repertoire.
    drop("e7", "e5");
    expect(position()).toBe(fenAfter("e4", "c6", "d3", "e5"));
    expect(document.querySelector('[data-san="e5"][data-extension="true"]')).not.toBeNull();
  });

  it("marks an extension of the mainline in the numbered rows", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]]) {
      drop(from, to);
      wait();
    }
    // 4. Nf3 ends the mainline: nothing to answer with.
    expect(status()).toBe("out-of-book");
    drop("e7", "e6");
    expect(screen.getByTestId("move-ply-8")).toHaveAttribute("data-extension", "true");
    expect(screen.getByTestId("move-ply-7")).not.toHaveAttribute("data-extension");
  });

  it("does not reply when the reader merely steps back to the trainer's turn", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    drop("e2", "e4");
    wait();
    drop("d2", "d4");
    wait();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5"));

    // Back to after 2. d4 — Black's move there, the trainer's side.
    fireEvent.click(screen.getByTestId("board-control-previous"));
    expect(position()).toBe(fenAfter("e4", "c6", "d4"));
    wait();
    expect(position()).toBe(fenAfter("e4", "c6", "d4"));

    // Stepping away while it thinks cancels the reply.
    fireEvent.click(screen.getByTestId("board-control-first"));
    drop("e2", "e4");
    fireEvent.click(screen.getByTestId("board-control-first"));
    wait();
    expect(position()).toBe(new Chess().fen());
  });

  it("draws no arrows until asked, then the mainline and side lines in two colours", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    // Off by default: a drill does not show the answer.
    expect(boardOptions().arrows).toEqual([]);

    openSettings();
    fireEvent.click(screen.getByTestId("repertoire-board-arrows").querySelector("input")!);
    // One continuation is still drawn — unlike the reading boards.
    expect(boardOptions().arrows).toEqual([
      { startSquare: "e2", endSquare: "e4", color: NEXT_MOVE_ARROW_COLOR },
    ]);

    // Add 2. d3 beside the repertoire's 2. d4, then step back to where both hang.
    drop("e2", "e4");
    wait();
    drop("d2", "d3");
    fireEvent.click(screen.getByTestId("board-control-previous"));
    expect(boardOptions().arrows).toEqual([
      { startSquare: "d2", endSquare: "d4", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "d2", endSquare: "d3", color: SIDELINE_NEXT_MOVE_ARROW_COLOR },
    ]);

    // And off again.
    fireEvent.click(screen.getByTestId("repertoire-board-arrows").querySelector("input")!);
    expect(boardOptions().arrows).toEqual([]);
  });

  it("shows the best variations once the engine is switched on, and never moves for it", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    engineOn();
    expect(screen.getByTestId("repertoire-board-panel-tab-engine")).toBeEnabled();

    const engine = FakeEngine.latest();
    expect(engine.lastSearch).toBe(new Chess().fen());
    act(() => {
      engine.say({
        fen: engine.lastSearch,
        uciMessage: "info",
        depth: 14,
        multipv: 1,
        positionEvaluation: "42",
        pv: "e2e4 e7e5",
      });
    });
    const block = screen.getByTestId("repertoire-board-panel-variations");
    expect(within(block).getByText("+0.42")).toBeInTheDocument();
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();

    // A bestmove is not a reply: the trainer is the only opponent.
    act(() => {
      engine.say({ fen: engine.lastSearch, uciMessage: "bestmove", bestMove: "e2e4" });
    });
    wait();
    expect(position()).toBe(new Chess().fen());

    // The engine's settings are the other boards' own Engine tab.
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-engine"));
    expect(screen.getByTestId("analysis-settings")).toBeInTheDocument();
  });

  it("clears the session's additions from the Engine tab", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    drop("e2", "e4");
    wait();
    drop("d2", "d3");
    expect(document.querySelector('[data-san="d3"]')).not.toBeNull();

    engineOn();
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-engine"));
    fireEvent.click(screen.getByTestId("analysis-clear"));
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));
    expect(position()).toBe(new Chess().fen());
    expect(document.querySelector('[data-san="d3"]')).toBeNull();
  });

  it("keeps the side and the arrows in a Settings tab beside Moves", () => {
    mountIdle(`/repertoires/${storeRepertoire("r", CARO)}`);
    for (const tab of ["moves", "settings"]) {
      expect(screen.getByTestId(`repertoire-board-panel-tab-${tab}`)).toBeInTheDocument();
    }
    // Not in the header any more, and not on screen until the tab is opened.
    const header = screen.getByTestId("repertoire-board-panel-header");
    expect(header.querySelector('[data-testid="repertoire-board-side"]')).toBeNull();
    expect(screen.queryByTestId("repertoire-board-arrows")).not.toBeInTheDocument();

    const list = screen.getByTestId("move-list");
    openSettings();
    expect(screen.getByTestId("repertoire-board-settings")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-side-white")).toHaveAttribute("aria-pressed", "true");
    // The move list is kept mounted, hidden, while Settings shows.
    expect(screen.getByTestId("repertoire-board-panel-content-moves")).not.toBeVisible();

    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));
    expect(screen.getByTestId("move-list")).toBe(list);
  });

  it("restarts at the start position and keeps the extensions", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}`);
    drop("e2", "e4");
    wait();
    drop("d2", "d3");

    fireEvent.click(screen.getByTestId("repertoire-board-restart"));
    expect(position()).toBe(new Chess().fen());
    expect(document.querySelector('[data-san="d3"][data-extension="true"]')).not.toBeNull();
  });

  it("downloads the extended tree as PGN, and never touches the saved record", () => {
    storeRepertoire("r", CARO, "My Caro");
    const stored = localStorage.getItem(SAVED_REPERTOIRES_STORAGE_KEY);
    mount("/repertoires/r");
    drop("e2", "e4");
    wait();
    drop("d2", "d3");

    fireEvent.click(screen.getByTestId("repertoire-board-download"));
    expect(downloadPgn).toHaveBeenCalledTimes(1);
    const [stem, pgns] = vi.mocked(downloadPgn).mock.calls[0];
    expect(stem).toBe("my-caro");
    expect(pgns).toHaveLength(1);
    // The extension as a side line, the repertoire's own side line kept.
    expect(pgns[0]).toContain("2. d4 (2. d3) 2... d5");
    expect(pgns[0]).toContain("(3... c5 4. dxc5)");

    expect(localStorage.getItem(SAVED_REPERTOIRES_STORAGE_KEY)).toBe(stored);
  });
});

/** Where the router is — the permanent link under test. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location" data-path={location.pathname} data-search={location.search} />;
}
const atParam = () =>
  new URLSearchParams(screen.getByTestId("location").getAttribute("data-search") ?? "").get("at");

/** Mount with the probe beside the screen, and let the tree be read. */
const mountProbed = (path: string) => {
  renderSection(path, <LocationProbe />);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};

describe("the player's map and its permanent link", () => {
  const MAP = "repertoire-board-map";
  const FULL = `${MAP}-dialog`;

  it("draws the repertoire without a game: its size, not a progress bar", () => {
    mountIdle(`/repertoires/${storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    expect(screen.queryByTestId(`${MAP}-progress`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${MAP}-left`)).toHaveTextContent("2 lines, 9 moves");
    expect(screen.getByTestId(`${MAP}-covered-lines`).getAttribute("d")).toBe("");
    expect(screen.getByTestId(`${MAP}-here`)).toHaveAttribute("data-node-id", "start");
  });

  it("draws the moves the reader adds as they are added, in their own colour", () => {
    mountIdle(`/repertoires/${storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    const dots = (name: string) =>
      (screen.getByTestId(`${MAP}-${name}`).getAttribute("d") ?? "").match(/h0/g)?.length ?? 0;
    expect(screen.getByTestId(`${MAP}-added-lines`).getAttribute("d")).toBe("");

    // 1. e4 is the repertoire's; 1... d5 is not — a new line, on the map at once.
    drop("e2", "e4");
    drop("d7", "d5");
    expect(dots("added-moves")).toBe(1);
    expect(screen.getByTestId(`${MAP}-added-lines`).getAttribute("d")).not.toBe("");
    expect(screen.getByTestId(`${MAP}-left`)).toHaveTextContent("3 lines, 10 moves · 1 added");
    // The marker stands on the added move itself, not before it.
    const here = screen.getByTestId(`${MAP}-here`).getAttribute("data-node-id");
    expect(here).not.toBe("start");
    expect(document.querySelector(`[data-testid="tree-move-${here}"]`)).toHaveAttribute(
      "data-extension",
      "true",
    );

    // And it grows with the line.
    drop("e4", "d5");
    expect(dots("added-moves")).toBe(2);
    expect(screen.getByTestId(`${MAP}-left`)).toHaveTextContent("3 lines, 11 moves · 2 added");
    // Black's 1... d5 is a black dot, White's 2. exd5 a white one.
    expect(dots("black-ends")).toBe(0);
    expect(dots("white-ends")).toBe(3);
  });

  it("goes to a dot clicked on the full-screen map, closes it, and links there", () => {
    mountProbed(`/repertoires/${storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    fireEvent.click(screen.getByTestId(`${MAP}-fullscreen`));
    fireEvent.click(screen.getByTestId(`${FULL}-show-moves`));
    // Not links until they are written — and they are written once readable.
    expect(screen.queryAllByRole("button", { name: /^Go to / })).toHaveLength(0);
    fireEvent.click(screen.getByTestId(`${FULL}-zoom-in`));
    fireEvent.click(screen.getByTestId(`${FULL}-zoom-in`));
    fireEvent.click(screen.getByTestId(`${FULL}-fit`));

    fireEvent.click(screen.getByRole("button", { name: "Go to c5" }));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByTestId(`${FULL}-view`)).not.toBeInTheDocument();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));
    expect(atParam()).toBe("e4,c6,d4,d5,e5,c5");
  });

  it("pans, rather than jumps, when a drag starts on a dot", () => {
    mountIdle(`/repertoires/${storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    fireEvent.click(screen.getByTestId(`${MAP}-fullscreen`));
    fireEvent.click(screen.getByTestId(`${FULL}-show-moves`));
    fireEvent.click(screen.getByTestId(`${FULL}-fit`));
    const dot = screen.getByRole("button", { name: "Go to c5" });
    const viewport = screen.getByTestId(`${FULL}-viewport`);
    fireEvent.pointerDown(dot, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 160, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    fireEvent.click(dot);
    expect(screen.getByTestId(`${FULL}-view`)).toBeInTheDocument();
    expect(position()).toBe(new Chess().fen());
  });

  it("opens at the position a link names, and follows the reader in the address", () => {
    mountProbed(`/repertoires/${storeRepertoire("r", CARO)}?at=e4,c6,d4,d5,e5,c5`);
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));

    fireEvent.click(screen.getByTestId("board-control-previous"));
    expect(atParam()).toBe("e4,c6,d4,d5,e5");
    fireEvent.click(screen.getByTestId("board-control-first"));
    // The start position is the bare address.
    expect(atParam()).toBeNull();
  });

  it("goes as far as a stale link goes", () => {
    mountProbed(`/repertoires/${storeRepertoire("r", CARO)}?at=e4,c6,Nf3`);
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(atParam()).toBe("e4,c6");
  });

  it("is the player's only: a game starts at the start", () => {
    mountProbed(`/repertoires/${storeRepertoire("r", CARO)}/games/end?at=e4,c6`);
    expect(position()).toBe(new Chess().fen());
  });
});
