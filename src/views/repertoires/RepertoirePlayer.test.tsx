import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { Chess } from "chess.js";
import { useLocation } from "react-router";

import i18n from "../../i18n";
import { downloadPgn } from "../../lib/pgnExport";
import {
  findSavedRepertoire,
  settledSavedRepertoires,
  savedRepertoiresSnapshot,
  updateRepertoireSettings,
} from "../../lib/savedRepertoireStore";
import {
  CHANCE_ARROW_BORDER_COLOR,
  CHANCE_ARROW_FILL_COLOR,
} from "../explorer/chanceArrows";
import {
  NEXT_MOVE_ARROW_COLOR,
  SIDELINE_NEXT_MOVE_ARROW_COLOR,
} from "../tools/analysis/nextMoveArrows";
import { boardOptions, FakeEngine } from "../board/boardTestHarness";
import {
  renderSection,
  storeRepertoire,
  FAKE_TIMERS,
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
  const { reactChessboardMock } = await import("../board/boardTestHarness");
  return reactChessboardMock();
});
vi.mock("../../lib/engine", async () => ({
  default: (await import("../board/boardTestHarness")).FakeEngine,
}));
vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../board/boardTestHarness");
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

/**
 * A marked fork — `2. Nf3 {prc:97.8}` against `2. Bc4 {prc:2.2}`, and under it
 * the unmarked `2... Nc6 (2... f5)` — one fixture for the play-chance arrows'
 * on and off cases (CTA-71).
 */
const MARKED = [
  '[Event "Marked"]',
  "",
  "1. e4 e5 2. Nf3 {prc:97.8} (2. Bc4 {prc:2.2}) 2... Nc6 (2... f5) 3. Bb5 *",
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
const mountIdle = async (path: string) => {
  await renderSection(path);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};

/** Mount it with Autoplay switched on — the trainer answering. */
const mount = async (path: string) => {
  await mountIdle(path);
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

/** Let the store's writes land (IndexedDB), and what the screen does with their answers. */
const landed = () =>
  act(async () => {
    await settledSavedRepertoires();
  });

/** Long enough for the trainer to have replied, if it is going to. */
const wait = () =>
  act(() => {
    vi.advanceTimersByTime(2_000);
  });

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
  vi.mocked(downloadPgn).mockClear();
  vi.useFakeTimers(FAKE_TIMERS);
  // The first of the node's moves — children[0] — every time.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the repertoire player, Autoplay on", () => {
  it("renders on the shared shell, facing the repertoire's main color, engine off", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO, "Caro")}`);

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

  it("replies from the repertoire after the reader moves", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);

    drop("e2", "e4");
    expect(status()).toBe("trainer-thinking");
    expect(position()).toBe(fenAfter("e4"));

    wait();
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(status()).toBe("your-move");
  });

  it("picks among the repertoire's moves, not only the mainline", async () => {
    vi.mocked(Math.random).mockReturnValue(0.9);
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);

    for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"]]) {
      drop(from, to);
      wait();
    }
    // At 3. e5 the repertoire has Bf5 and c5; a draw near 1 takes the second.
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));
  });

  it("moves first when the reader takes Black, and the side toggle restarts", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("adds a move the repertoire does not have, marks it, and stays silent after it", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("marks an extension of the mainline in the numbered rows", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("does not reply when the reader merely steps back to the trainer's turn", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("draws the next-move arrows as the repertoire's settings say, mainline and side lines apart", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
    // On by default (the setting's default), and one continuation is drawn too.
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

    // Switched off for the session in the Settings tab — the record is untouched.
    const stored = savedRepertoiresSnapshot();
    openSettings();
    fireEvent.click(screen.getByTestId("repertoire-board-arrows").querySelector("input")!);
    expect(boardOptions().arrows).toEqual([]);
    await landed();
    expect(savedRepertoiresSnapshot()).toBe(stored);
  });

  it("opens without arrows when the repertoire's settings say so, and so does a game", async () => {
    await storeRepertoire("r", CARO);
    await updateRepertoireSettings("r", "", { ...findSavedRepertoire("r")!.settings, showArrows: false });
    await mountIdle("/repertoires/r");
    expect(boardOptions().arrows).toEqual([]);
    openSettings();
    expect(screen.getByTestId("repertoire-board-arrows").querySelector("input")).not.toBeChecked();
  });

  it("opens a game without arrows whatever the setting says", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}/games/end`);
    expect(boardOptions().arrows).toEqual([]);
  });

  it("draws the arrows by play chance at a marked fork, switched for a session", async () => {
    // Autoplay off, so the reader walks both sides to the fork at move 2.
    await mountIdle(`/repertoires/${await storeRepertoire("r", MARKED)}`);
    drop("e2", "e4");
    drop("e7", "e5");
    // Off by default: the green/blue pair stands even where the moves carry
    // marks, no overlay is drawn, and the bar prints the SANs alone.
    expect(boardOptions().arrows).toEqual([
      { startSquare: "g1", endSquare: "f3", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "f1", endSquare: "c4", color: SIDELINE_NEXT_MOVE_ARROW_COLOR },
    ]);
    expect(
      screen.queryByTestId("repertoire-board-chance-arrows-overlay"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("analysis-next-moves")).not.toHaveTextContent("97.8%");

    // Switched on in the Settings tab: the library arrows stand down and the
    // overlay draws each continuation white with a magenta border, the wider
    // the likelier — and the bar prints the same numbers beside the SANs.
    // The record is untouched.
    const stored = savedRepertoiresSnapshot();
    openSettings();
    fireEvent.click(screen.getByTestId("repertoire-board-chance-arrows").querySelector("input")!);
    expect(boardOptions().arrows).toEqual([]);
    const overlay = screen.getByTestId("repertoire-board-chance-arrows-overlay");
    const likely = overlay.querySelector('path[data-from="g1"]')!;
    const rare = overlay.querySelector('path[data-from="f1"]')!;
    expect(likely.getAttribute("data-to")).toBe("f3");
    expect(likely.getAttribute("fill")).toBe(CHANCE_ARROW_FILL_COLOR);
    expect(likely.getAttribute("stroke")).toBe(CHANCE_ARROW_BORDER_COLOR);
    expect(rare.getAttribute("data-to")).toBe("c4");
    expect(
      Number(likely.getAttribute("stroke-width")),
    ).toBeGreaterThan(Number(rare.getAttribute("stroke-width")));
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));
    expect(screen.getByTestId("analysis-next-moves")).toHaveTextContent("97.8%");
    expect(screen.getByTestId("analysis-next-moves")).toHaveTextContent("2.2%");
    await landed();
    expect(savedRepertoiresSnapshot()).toBe(stored);

    // The unmarked fork under it keeps the green and blue: with no mark to
    // read anywhere at the branch, the overlay says nothing and the bar
    // prints the SANs alone.
    drop("g1", "f3");
    expect(boardOptions().arrows).toEqual([
      { startSquare: "b8", endSquare: "c6", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "f7", endSquare: "f5", color: SIDELINE_NEXT_MOVE_ARROW_COLOR },
    ]);
    expect(
      screen.queryByTestId("repertoire-board-chance-arrows-overlay"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("analysis-next-moves")).not.toHaveTextContent("%");
  });

  it("seeds the chance arrows from the repertoire's settings", async () => {
    await storeRepertoire("r", MARKED);
    await updateRepertoireSettings("r", "", {
      ...findSavedRepertoire("r")!.settings,
      chanceArrows: true,
    });
    await mountIdle("/repertoires/r");
    drop("e2", "e4");
    drop("e7", "e5");
    expect(boardOptions().arrows).toEqual([]);
    const overlay = screen.getByTestId("repertoire-board-chance-arrows-overlay");
    expect(overlay.querySelector('path[data-from="g1"]')).not.toBeNull();
    expect(overlay.querySelector('path[data-from="f1"]')).not.toBeNull();
    // The same switch's other half: the percentages print beside the SANs.
    expect(screen.getByTestId("analysis-next-moves")).toHaveTextContent("97.8%");
    openSettings();
    expect(screen.getByTestId("repertoire-board-chance-arrows").querySelector("input")).toBeChecked();
  });

  it("opens a game without the chance arrows whatever the setting says", async () => {
    await storeRepertoire("r", MARKED);
    await updateRepertoireSettings("r", "", {
      ...findSavedRepertoire("r")!.settings,
      chanceArrows: true,
    });
    await mountIdle("/repertoires/r/games/end");
    expect(boardOptions().arrows).toEqual([]);
    expect(
      screen.queryByTestId("repertoire-game-chance-arrows-overlay"),
    ).not.toBeInTheDocument();
    // The bar never renders in a game — its footer is the trainer's status
    // line — so a drill shows no percentages either.
    expect(screen.queryByTestId("analysis-next-moves")).not.toBeInTheDocument();
    // And no switch for it in the game's Settings — a drill must not show the
    // answer's odds.
    fireEvent.click(screen.getByTestId("repertoire-game-panel-tab-settings"));
    expect(screen.queryByTestId("repertoire-game-chance-arrows")).not.toBeInTheDocument();
  });

  it("shows the best variations once the engine is switched on, and never moves for it", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("clears the session's additions from the Engine tab", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("keeps the side and the arrows in a Settings tab beside Moves", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("restarts at the start position and keeps the extensions", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}`);
    drop("e2", "e4");
    wait();
    drop("d2", "d3");

    fireEvent.click(screen.getByTestId("repertoire-board-restart"));
    expect(position()).toBe(new Chess().fen());
    expect(document.querySelector('[data-san="d3"][data-extension="true"]')).not.toBeNull();
  });

  it("downloads the extended tree as PGN, and never touches the saved record", async () => {
    await storeRepertoire("r", CARO, "My Caro");
    const stored = savedRepertoiresSnapshot();
    await mount("/repertoires/r");
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

    await landed();
    expect(savedRepertoiresSnapshot()).toBe(stored);
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
const mountProbed = async (path: string) => {
  await renderSection(path, <LocationProbe />);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};

describe("the player's map and its permanent link", () => {
  const MAP = "repertoire-board-map";
  const FULL = `${MAP}-dialog`;

  it("draws the repertoire without a game: its size, not a progress bar", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    expect(screen.queryByTestId(`${MAP}-progress`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${MAP}-left`)).toHaveTextContent("2 lines, 9 moves");
    expect(screen.getByTestId(`${MAP}-covered-lines`).getAttribute("d")).toBe("");
    expect(screen.getByTestId(`${MAP}-here`)).toHaveAttribute("data-node-id", "start");
  });

  it("draws the moves the reader adds as they are added, in their own colour", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
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

  it("goes to a dot clicked in the tab's map, and links there", async () => {
    await mountProbed(`/repertoires/${await storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    const tab = within(screen.getByTestId(`${MAP}-viewport`));
    fireEvent.click(tab.getByRole("button", { name: "Go to e4" }));
    expect(position()).toBe(fenAfter("e4"));
    expect(atParam()).toBe("e4");
  });

  it("goes to a dot clicked on the full-screen map, closes it, and links there", async () => {
    await mountProbed(`/repertoires/${await storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    fireEvent.click(screen.getByTestId(`${MAP}-fullscreen`));
    const full = within(screen.getByTestId(`${FULL}-viewport`));

    fireEvent.click(full.getByRole("button", { name: "Go to c5" }));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByTestId(`${FULL}-view`)).not.toBeInTheDocument();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));
    expect(atParam()).toBe("e4,c6,d4,d5,e5,c5");
  });

  it("pans, rather than jumps, when a drag starts on a dot", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    fireEvent.click(screen.getByTestId(`${MAP}-fullscreen`));
    const dot = within(screen.getByTestId(`${FULL}-viewport`)).getByRole("button", {
      name: "Go to c5",
    });
    const viewport = screen.getByTestId(`${FULL}-viewport`);
    fireEvent.pointerDown(dot, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 160, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    fireEvent.click(dot);
    expect(screen.getByTestId(`${FULL}-view`)).toBeInTheDocument();
    expect(position()).toBe(new Chess().fen());
  });

  it("opens at the position a link names, and follows the reader in the address", async () => {
    await mountProbed(`/repertoires/${await storeRepertoire("r", CARO)}?at=e4,c6,d4,d5,e5,c5`);
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));

    fireEvent.click(screen.getByTestId("board-control-previous"));
    expect(atParam()).toBe("e4,c6,d4,d5,e5");
    fireEvent.click(screen.getByTestId("board-control-first"));
    // The start position is the bare address.
    expect(atParam()).toBeNull();
  });

  it("goes as far as a stale link goes", async () => {
    await mountProbed(`/repertoires/${await storeRepertoire("r", CARO)}?at=e4,c6,Nf3`);
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(atParam()).toBe("e4,c6");
  });

  it("is the player's only: a game starts at the start", async () => {
    await mountProbed(`/repertoires/${await storeRepertoire("r", CARO)}/games/end?at=e4,c6`);
    expect(position()).toBe(new Chess().fen());
  });
});

describe("keeping a session's changes", () => {
  const BAR = "repertoire-board-changes";
  const path = () => screen.getByTestId("location").getAttribute("data-path");
  const SAVE = "repertoire-board-save";
  /** Open the strip from the header's Save button. */
  const openChanges = () => fireEvent.click(screen.getByTestId(SAVE));

  /** 1. e4 c6, then 2. d3 — beside the repertoire's 2. d4, so a change. */
  const addD3 = () => {
    drop("e2", "e4");
    drop("c7", "c6");
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();
    drop("d2", "d3");
  };

  it("keeps the strip behind the header's Save button, which lights up with a change", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    // Nothing changed: disabled, and no strip.
    expect(screen.getByTestId(SAVE)).toBeDisabled();
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();

    addD3();
    // Changed: enabled and coloured — but the strip waits for the click.
    expect(screen.getByTestId(SAVE)).toBeEnabled();
    expect(screen.getByTestId(SAVE)).toHaveClass("MuiIconButton-colorPrimary");
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();

    openChanges();
    expect(screen.getByTestId(BAR)).toBeInTheDocument();
    expect(screen.getByTestId(SAVE)).toHaveAttribute("aria-pressed", "true");
    // A second click puts it away again; the changes stay.
    openChanges();
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();
    expect(screen.getByTestId(SAVE)).toBeEnabled();

    // Dropped, the button goes back to disabled and the strip stays closed.
    openChanges();
    fireEvent.click(screen.getByTestId(`${BAR}-discard`));
    expect(screen.getByTestId(SAVE)).toBeDisabled();
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();
  });

  it("offers the choice only while something has changed", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    // Following the repertoire's own moves is not a change.
    drop("e2", "e4");
    drop("c7", "c6");
    drop("d2", "d4");
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("board-control-previous"));
    drop("d2", "d3");
    openChanges();
    expect(screen.getByTestId(`${BAR}-summary`)).toHaveTextContent("1 move added");
  });

  /** Switch a stored repertoire's protection off, as its settings screen would. */
  const unprotect = async (id: string) =>
    await updateRepertoireSettings(id, findSavedRepertoire(id)!.name, {
      ...findSavedRepertoire(id)!.settings,
      protected: false,
    });

  it("updates an unprotected repertoire in place, and the session becomes the record", async () => {
    await storeRepertoire("r", CARO);
    await unprotect("r");
    await storeRepertoire("other", CARO);
    await mountIdle("/repertoires/r");
    addD3();
    openChanges();
    fireEvent.click(screen.getByTestId(`${BAR}-update`));
    await landed();

    const record = findSavedRepertoire("r")!;
    expect(record.pgn).toContain("2. d4 (2. d3)");
    expect(record.stats).toEqual({ moves: 4, variations: 2 });
    // Changed, so it is the one most recently worked on.
    expect(savedRepertoiresSnapshot()![0].id).toBe("r");
    // Nothing left to save, the reader still where they were, 2. d3 no longer an addition.
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();
    expect(position()).toBe(fenAfter("e4", "c6", "d3"));
    expect(document.querySelector('[data-san="d3"]')).not.toHaveAttribute("data-extension");
  });

  it("saves a copy with the changes and opens it there, leaving the original as it was", async () => {
    await storeRepertoire("r", CARO, "Caro");
    const original = findSavedRepertoire("r")!.pgn;
    await mountProbed("/repertoires/r");
    addD3();
    openChanges();
    fireEvent.click(screen.getByTestId(`${BAR}-copy`));
    await landed();
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(findSavedRepertoire("r")!.pgn).toBe(original);
    const copy = savedRepertoiresSnapshot()!.find((row) => row.id !== "r")!;
    expect(copy).toMatchObject({ name: "Caro (copy)" });
    expect(copy.pgn).toContain("2. d4 (2. d3)");
    // Opened: its own route, at the position the reader was on, nothing unsaved.
    expect(path()).toBe(`/repertoires/${copy.id}`);
    expect(atParam()).toBe("e4,c6,d3");
    expect(screen.getByTestId("repertoire-board-name")).toHaveTextContent("Caro (copy)");
    expect(position()).toBe(fenAfter("e4", "c6", "d3"));
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();
  });

  it("says a protected repertoire — the default — is protected, and offers its settings instead of Update", async () => {
    await storeRepertoire("r", CARO);
    expect(findSavedRepertoire("r")!.settings.protected).toBe(true);
    await mountProbed("/repertoires/r?at=e4");
    addD3();
    openChanges();

    expect(screen.getByTestId(`${BAR}-protected`)).toHaveTextContent(
      "This repertoire is protected",
    );
    expect(screen.queryByTestId(`${BAR}-update`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${BAR}-settings`)).toHaveAttribute(
      "href",
      "/repertoires/r/settings",
    );
    // No dialog on the way: the strip is the whole of it.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves an unprotected copy of a protected repertoire, which then updates in place", async () => {
    await storeRepertoire("r", CARO, "Caro");
    const original = findSavedRepertoire("r")!;
    await mountProbed("/repertoires/r");
    addD3();
    openChanges();
    fireEvent.click(screen.getByTestId(`${BAR}-copy`));
    await landed();
    act(() => {
      vi.advanceTimersByTime(0);
    });

    const copy = savedRepertoiresSnapshot()!.find((row) => row.id !== "r")!;
    expect(copy).toMatchObject({ name: "Caro (copy)", settings: { protected: false } });
    expect(findSavedRepertoire("r")).toEqual(original);
    expect(path()).toBe(`/repertoires/${copy.id}`);

    // The copy goes on being edited, and its strip has Update.
    drop("e7", "e5");
    openChanges();
    expect(screen.queryByTestId(`${BAR}-protected`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`${BAR}-update`));
    await landed();
    expect(findSavedRepertoire(copy.id)!.pgn).toContain("2. d4 (2. d3 e5)");
  });

  it("discards the changes, back on the last repertoire position", async () => {
    await storeRepertoire("r", CARO);
    const stored = savedRepertoiresSnapshot();
    await mountIdle("/repertoires/r");
    addD3();
    openChanges();
    drop("e7", "e5");
    expect(screen.getByTestId(`${BAR}-summary`)).toHaveTextContent("2 moves added");

    fireEvent.click(screen.getByTestId(`${BAR}-discard`));
    expect(screen.queryByTestId(BAR)).not.toBeInTheDocument();
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(document.querySelector('[data-san="d3"]')).toBeNull();
    await landed();
    expect(savedRepertoiresSnapshot()).toBe(stored);
  });

  it("is the player's only: a game never offers to write", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}/games/end`);
    for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]]) {
      drop(from, to);
      wait();
    }
    // Past the end, a move is added — and still nothing to save.
    drop("e7", "e6");
    expect(screen.queryByTestId("repertoire-game-changes")).not.toBeInTheDocument();
  });
});

describe("the variations explorer's move menu (CTA-64)", () => {
  const MENU = "move-menu";
  const token = (san: string) => document.querySelector<HTMLElement>(`[data-san="${san}"]`)!;
  /** Right-click a move where the pointer is. */
  const rightClick = (element: HTMLElement) =>
    fireEvent.contextMenu(element, { clientX: 40, clientY: 60 });
  /** Let the menu's and the dialog's transitions finish. */
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
  const mainlineText = () =>
    [1, 2, 3, 4, 5, 6, 7]
      .map((ply) => screen.queryByTestId(`move-ply-${ply}`)?.textContent ?? "")
      .join(" ")
      .trim();

  it("offers promote and make main line on a side-line move, and edits the session's tree", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    expect(screen.getByTestId("repertoire-board-save")).toBeDisabled();

    rightClick(token("c5"));
    const menu = within(screen.getByRole("menu"));
    expect(screen.getByTestId(`${MENU}-move`)).toHaveTextContent("3… c5");
    expect(screen.getByTestId(`${MENU}-move`)).toHaveAttribute("dir", "ltr");
    expect(menu.getByTestId(`${MENU}-promote`)).toBeInTheDocument();
    expect(menu.getByTestId(`${MENU}-copy`)).toBeInTheDocument();

    fireEvent.click(menu.getByTestId(`${MENU}-mainline`));
    settle();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(mainlineText()).toBe("e4 c6 d4 d5 e5 c5 dxc5");

    // A session change like any other: Save lights up, and the strip says what.
    expect(screen.getByTestId("repertoire-board-save")).toBeEnabled();
    fireEvent.click(screen.getByTestId("repertoire-board-save"));
    expect(screen.getByTestId("repertoire-board-changes-summary")).toHaveTextContent(
      "Lines or comments edited",
    );
  });

  it("offers neither on a mainline move", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    rightClick(screen.getByTestId("move-ply-6"));
    expect(screen.getByTestId(`${MENU}-move`)).toHaveTextContent("3… Bf5");
    expect(screen.queryByTestId(`${MENU}-promote`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${MENU}-mainline`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${MENU}-delete`)).toBeInTheDocument();
  });

  it("keeps the reader where they stand when a line is promoted", async () => {
    await mountProbed(`/repertoires/${await storeRepertoire("r", CARO)}?at=e4,c6,d4,d5,e5,c5,dxc5`);
    rightClick(token("dxc5"));
    fireEvent.click(screen.getByTestId(`${MENU}-promote`));
    settle();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5", "dxc5"));
    expect(atParam()).toBe("e4,c6,d4,d5,e5,c5,dxc5");
  });

  it("deletes from a move after saying how much goes, and steps back off what went", async () => {
    await mountProbed(`/repertoires/${await storeRepertoire("r", CARO)}?at=e4,c6,d4,d5,e5,Bf5,Nf3`);
    rightClick(screen.getByTestId("move-ply-5"));
    fireEvent.click(screen.getByTestId(`${MENU}-delete`));
    settle();

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByTestId(`${MENU}-delete-summary`)).toHaveTextContent(
      "5 moves / 2 lines will be deleted.",
    );
    // Cancelling changes nothing.
    fireEvent.click(dialog.getByTestId(`${MENU}-delete-cancel`));
    settle();
    expect(mainlineText()).toBe("e4 c6 d4 d5 e5 Bf5 Nf3");

    rightClick(screen.getByTestId("move-ply-5"));
    fireEvent.click(screen.getByTestId(`${MENU}-delete`));
    settle();
    fireEvent.click(screen.getByTestId(`${MENU}-delete-confirm`));
    settle();
    expect(mainlineText()).toBe("e4 c6 d4 d5");
    expect(token("c5")).toBeNull();
    // The reader stood on a deleted move: now on the move it answered.
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5"));
    expect(atParam()).toBe("e4,c6,d4,d5");
    expect(screen.getByTestId("repertoire-board-save")).toBeEnabled();
  });

  it("copies the line from the start to the move as PGN", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    rightClick(token("dxc5"));
    await act(async () => {
      fireEvent.click(screen.getByTestId(`${MENU}-copy`));
    });
    expect(writeText).toHaveBeenCalledWith(
      '[Event "My Caro"]\n\n1. e4 c6 2. d4 d5 3. e5 c5 4. dxc5 *',
    );
    expect(screen.getByTestId(`${MENU}-copied`)).toHaveTextContent("Variation PGN copied");
    // Copying is not an edit.
    expect(screen.getByTestId("repertoire-board-save")).toBeDisabled();
  });

  it("is the player's only: a game's move list leaves the right-click to the browser", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}/games/end`);
    drop("e2", "e4");
    wait();
    fireEvent.click(screen.getByTestId("repertoire-game-panel-tab-moves"));
    expect(fireEvent.contextMenu(screen.getByTestId("move-ply-1"))).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("the move menu on the player's map (CTA-67)", () => {
  const MAP = "repertoire-board-map";
  const FULL = `${MAP}-dialog`;
  const MENU = "move-menu";
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
  /** A written move on a map, by its SAN — the link round its dot. */
  const move = (viewport: string, san: string) =>
    within(screen.getByTestId(`${viewport}-viewport`)).getByRole("button", {
      name: `Go to ${san}`,
    });
  const idOf = (viewport: string, hit: HTMLElement) =>
    hit.getAttribute("data-testid")!.slice(`${viewport}-go-`.length);
  const labelY = (viewport: string, id: string) =>
    screen.getByTestId(`${viewport}-label-${id}`).getAttribute("y");
  const view = (viewport: string) => {
    const g = screen.getByTestId(`${viewport}-view`);
    return ["data-x", "data-y", "data-k"].map((name) => g.getAttribute(name));
  };
  /** Open the full-screen map. */
  const openFullScreen = async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    fireEvent.click(screen.getByTestId(`${MAP}-fullscreen`));
  };

  it("opens on a move right-clicked in the tab's map, in place of the browser's, and never pans", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-map"));
    const before = view(MAP);
    const e4 = move(MAP, "e4");

    // The right button does not start a drag, nor follow the link.
    fireEvent.pointerDown(e4, { button: 2, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(screen.getByTestId(`${MAP}-viewport`), {
      clientX: 180,
      clientY: 100,
      pointerId: 1,
    });
    expect(fireEvent.contextMenu(e4, { clientX: 100, clientY: 100 })).toBe(false);
    expect(view(MAP)).toEqual(before);
    expect(position()).toBe(new Chess().fen());

    // The Moves tab's menu, with its rules: a mainline move is neither promoted nor made main.
    expect(screen.getByTestId(`${MENU}-move`)).toHaveTextContent("1. e4");
    expect(screen.queryByTestId(`${MENU}-promote`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${MENU}-mainline`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${MENU}-delete`)).toBeInTheDocument();
    expect(screen.getByTestId(`${MENU}-copy`)).toBeInTheDocument();

    // Anywhere but a move, the right-click stays the browser's.
    expect(fireEvent.contextMenu(screen.getByTestId(`${MAP}-viewport`))).toBe(true);
  });

  it("makes a side line the main line from the full-screen map, which stays open and redraws at once", async () => {
    await openFullScreen();
    const c5 = idOf(FULL, move(FULL, "c5"));
    const e4 = idOf(FULL, move(FULL, "e4"));
    expect(labelY(FULL, c5)).not.toBe(labelY(FULL, e4));
    const before = view(FULL);

    fireEvent.contextMenu(move(FULL, "c5"), { clientX: 200, clientY: 200 });
    expect(screen.getByTestId(`${MENU}-move`)).toHaveTextContent("3… c5");
    fireEvent.click(screen.getByTestId(`${MENU}-mainline`));
    settle();

    // Still full screen, the view where it was, and c5 on the top row now.
    expect(screen.getByTestId(`${FULL}-view`)).toBeInTheDocument();
    expect(view(FULL)).toEqual(before);
    expect(labelY(FULL, c5)).toBe(labelY(FULL, e4));
    // A session change like one from the move list.
    expect(screen.getByTestId("repertoire-board-save")).toBeEnabled();
  });

  it("deletes from a move on the full-screen map after asking, and the line leaves the map", async () => {
    await openFullScreen();
    expect(screen.getByTestId(`${FULL}-svg`)).toHaveAttribute("data-rows", "2");
    const c5 = idOf(FULL, move(FULL, "c5"));

    fireEvent.contextMenu(move(FULL, "c5"), { clientX: 200, clientY: 200 });
    fireEvent.click(screen.getByTestId(`${MENU}-delete`));
    settle();
    expect(screen.getByTestId(`${MENU}-delete-summary`)).toHaveTextContent(
      "2 moves / 1 line will be deleted.",
    );
    fireEvent.click(screen.getByTestId(`${MENU}-delete-confirm`));
    settle();

    expect(screen.getByTestId(`${FULL}-view`)).toBeInTheDocument();
    expect(screen.getByTestId(`${FULL}-svg`)).toHaveAttribute("data-rows", "1");
    expect(screen.queryByTestId(`${FULL}-label-${c5}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${MAP}-left`)).toHaveTextContent("1 line, 7 moves");
  });

  it("is the player's only: a game's map leaves the right-click to the browser", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    fireEvent.click(screen.getByTestId("repertoire-game-panel-tab-map"));
    const label = document.querySelector<SVGElement>('[data-testid^="repertoire-game-map-label-"]')!;
    expect(label).not.toBeNull();
    expect(fireEvent.contextMenu(label)).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("the header's Play button (CTA-65)", () => {
  const play = () => screen.getByTestId("repertoire-board-play");
  const settingsSwitch = () =>
    screen.getByTestId("repertoire-board-setting-autoplay").querySelector("input")!;

  it("sits in the header, off, offering to play", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    expect(play()).toHaveAttribute("aria-pressed", "false");
    expect(play()).toHaveAccessibleName(i18n.t("repertoires.play.autoplayOn"));
    // Beside Restart, before it.
    expect(
      play().compareDocumentPosition(screen.getByTestId("repertoire-board-restart")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("toggles Autoplay: pressed while on, the trainer answering, and back off", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    fireEvent.click(play());
    expect(play()).toHaveAttribute("aria-pressed", "true");
    expect(play()).toHaveAccessibleName(i18n.t("repertoires.play.autoplayOff"));

    drop("e2", "e4");
    wait();
    expect(position()).toBe(fenAfter("e4", "c6"));

    fireEvent.click(play());
    expect(play()).toHaveAttribute("aria-pressed", "false");
    drop("d2", "d4");
    wait();
    // Off again: nobody answers.
    expect(position()).toBe(fenAfter("e4", "c6", "d4"));
  });

  it("stays in sync with the Settings switch in both directions", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    openSettings();

    fireEvent.click(play());
    expect(settingsSwitch()).toBeChecked();

    fireEvent.click(settingsSwitch());
    expect(settingsSwitch()).not.toBeChecked();
    expect(play()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(settingsSwitch());
    expect(play()).toHaveAttribute("aria-pressed", "true");
  });

  it("makes the trainer reply at once when switched on at its turn", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    openSettings();
    fireEvent.click(screen.getByTestId("repertoire-board-side-black"));
    // Autoplay is off, so White (the trainer's side) has not moved.
    wait();
    expect(position()).toBe(new Chess().fen());

    fireEvent.click(play());
    expect(status()).toBe("trainer-thinking");
    wait();
    expect(position()).toBe(fenAfter("e4"));
  });

  it("is absent from a game, where the trainer always plays", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}/games/end`);
    expect(screen.queryByTestId("repertoire-game-play")).not.toBeInTheDocument();
    expect(screen.getByTestId("repertoire-game-restart")).toBeInTheDocument();
  });
});
