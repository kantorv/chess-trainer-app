import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { Chess } from "chess.js";

import i18n from "../../i18n";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import { REQUIRED_MOVE_ARROW_COLOR } from "../tools/analysis/nextMoveArrows";
import { BACKTRACK_DELAY_MS } from "./RepertoirePlayer";
import {
  CARO_TWO_GAMES,
  renderSection,
  storeMultiGameRepertoire,
  storeRepertoire,
  FAKE_TIMERS,
} from "./repertoireTestKit";

/*
  The repertoire games (CTA-63) — `/repertoires/<id>/games/<game>`, the player
  with a game's rules. Stubbed as `RepertoirePlayer.test.tsx` is: the board
  (`chessboard.md` §8), the engine, the book; fake timers for the trainer's
  delay and Backtracking's return; `Math.random` pinned so the trainer's pick
  is the first move it may choose.
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

/** Two lines: `4. Nf3` (mainline) and `3... c5 4. dxc5`. */
const CARO = [
  '[Event "My Caro"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *",
].join("\n");

/** Two lines that fork at White's own move: `2. Nf3` and `2. Bc4`. */
const WHITE_FORK = ['[Event "Fork"]', "", "1. e4 e5 2. Nf3 (2. Bc4) *"].join("\n");

const ID = "repertoire-game";

const fenAfter = (...sans: string[]) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
};

const position = () => boardOptions().position;
const status = () => screen.getByTestId(`${ID}-status`).getAttribute("data-status");
const tally = () => [
  screen.getByTestId(`${ID}-score-successes`).textContent,
  screen.getByTestId(`${ID}-score-failures`).textContent,
];
const lines = () => screen.getByTestId(`${ID}-score-lines`).textContent;

const mount = async (path: string) => {
  await renderSection(path);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};

const drop = (from: string, to: string) =>
  act(() => {
    boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });

/** Long enough for the trainer to reply — not long enough to backtrack. */
const reply = () =>
  act(() => {
    vi.advanceTimersByTime(500);
  });

/** Long enough for Backtracking to go back, and the trainer to answer there. */
const backtrack = () => {
  act(() => {
    vi.advanceTimersByTime(BACKTRACK_DELAY_MS);
  });
  reply();
};

/** Play a line of drops, letting the trainer answer each. */
const play = (...moves: [string, string][]) => {
  for (const [from, to] of moves) {
    drop(from, to);
    reply();
  }
};

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
  vi.useFakeTimers(FAKE_TIMERS);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reaching a game", () => {
  it("is a menu on the repertoire's own view, and on its row in the list", async () => {
    await storeRepertoire("r", CARO);
    await mount("/repertoires/r");
    fireEvent.click(screen.getByTestId("repertoire-board-games"));
    expect(screen.getByTestId("repertoire-board-games-end")).toHaveAttribute(
      "href",
      "/repertoires/r/games/end",
    );
    expect(screen.getByTestId("repertoire-board-games-backtrack")).toHaveAttribute(
      "href",
      "/repertoires/r/games/backtrack",
    );
  });

  it("is the same menu in the list", async () => {
    await storeRepertoire("r", CARO);
    await mount("/repertoires");
    fireEvent.click(screen.getByTestId("repertoires-games-r"));
    expect(screen.getByTestId("repertoires-games-r-backtrack")).toHaveAttribute(
      "href",
      "/repertoires/r/games/backtrack",
    );
  });

  it("opens on the Score tab, with the trainer playing and no Autoplay switch", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO, "Caro")}/games/end`);
    expect(boardOptions().id).toBe(ID);
    expect(screen.getByTestId(`${ID}-title`)).toHaveTextContent("Get to the end");
    expect(screen.getByTestId(`${ID}-score`)).toBeVisible();
    expect(tally()).toEqual(["0", "0"]);
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-settings`));
    expect(screen.queryByTestId(`${ID}-setting-autoplay`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${ID}-back`)).toHaveAttribute("href", "/repertoires/r");
  });

  it("says so for a game there is no such thing as", async () => {
    await storeRepertoire("r", CARO);
    await mount("/repertoires/r/games/nope");
    expect(screen.getByTestId("repertoire-board-missing")).toBeInTheDocument();
  });

  it("offers a record from before the one-game rule its merge-or-split choice", async () => {
    await mount(`/repertoires/${await storeMultiGameRepertoire("old", CARO_TWO_GAMES, "Old")}/games/end`);
    expect(screen.getByTestId("repertoire-board-multi")).toBeInTheDocument();
  });
});

describe("Get to the end", () => {
  it("counts a right move, takes a wrong one back, and counts a position once", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/end`);

    play(["e2", "e4"]);
    expect(tally()).toEqual(["1", "0"]);
    expect(position()).toBe(fenAfter("e4", "c6"));

    // 2. d3 is not the repertoire's move: refused, counted, not added.
    drop("d2", "d3");
    expect(tally()).toEqual(["1", "1"]);
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(document.querySelector('[data-san="d3"]')).toBeNull();
    expect(status()).toBe("try-again");

    // Retries at the same position count nothing more, wrong or right.
    drop("c2", "c3");
    play(["d2", "d4"]);
    expect(tally()).toEqual(["1", "1"]);
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5"));

    // An illegal drop is not a move at all.
    drop("e4", "e6");
    expect(tally()).toEqual(["1", "1"]);

    drop("e4", "e5");
    expect(tally()).toEqual(["2", "1"]);
    expect(screen.getByTestId(`${ID}-score-accuracy`)).toHaveTextContent("67%");
  });

  it("finishes a line at its end, counts it, and counts again after a restart", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/end`);
    play(["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]);
    expect(status()).toBe("line-complete");
    expect(lines()).toBe("1 line finished");

    // Navigating back onto the end is not finishing it again.
    fireEvent.click(screen.getByTestId("board-control-previous"));
    fireEvent.click(screen.getByTestId("board-control-next"));
    expect(status()).toBe("out-of-book");
    expect(lines()).toBe("1 line finished");

    // Past the end: free play, extending, not judged.
    drop("e7", "e6");
    expect(tally()).toEqual(["4", "0"]);
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-moves`));
    expect(screen.getByTestId("move-ply-8")).toHaveAttribute("data-extension", "true");

    fireEvent.click(screen.getByTestId(`${ID}-restart`));
    play(["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]);
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-score`));
    expect(lines()).toBe("2 lines finished");

    fireEvent.click(screen.getByTestId(`${ID}-score-reset`));
    expect(tally()).toEqual(["0", "0"]);
  });
});

describe("Backtracking", () => {
  it("covers one line, goes back to the next, and ends when every line is covered", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    expect(screen.getByTestId(`${ID}-title`)).toHaveTextContent("Backtracking");
    expect(lines()).toBe("Lines covered: 0 of 2");

    play(["e2", "e4"], ["d2", "d4"], ["e4", "e5"]);
    // The trainer's first uncovered choice at 3. e5: the mainline's Bf5.
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "Bf5"));
    drop("g1", "f3");
    expect(status()).toBe("line-covered");
    expect(lines()).toBe("Lines covered: 1 of 2");

    // Back to 3. e5 — the deepest position with a line left — where the
    // trainer now plays the side line, the only one still open.
    backtrack();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));

    drop("d4", "c5");
    expect(status()).toBe("all-covered");
    expect(lines()).toBe("Lines covered: 2 of 2");
    // Finished: it stays where it is.
    backtrack();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5", "dxc5"));
    expect(tally()).toEqual(["5", "0"]);
  });

  it("marks the required move where the reader's other moves are covered, and refuses those", async () => {
    await mount(`/repertoires/${await storeRepertoire("f", WHITE_FORK)}/games/backtrack`);
    play(["e2", "e4"]);
    // Both of White's moves still lead somewhere new: nothing required.
    expect(status()).toBe("your-move");
    expect(boardOptions().arrows).toEqual([]);

    drop("g1", "f3");
    expect(status()).toBe("line-covered");
    backtrack();
    expect(position()).toBe(fenAfter("e4", "e5"));

    // Only 2. Bc4 is left: marked, and said.
    expect(status()).toBe("required");
    expect(boardOptions().arrows).toEqual([
      { startSquare: "f1", endSquare: "c4", color: REQUIRED_MOVE_ARROW_COLOR },
    ]);

    // 2. Nf3 is right but finished: refused, and not a failure.
    drop("g1", "f3");
    expect(position()).toBe(fenAfter("e4", "e5"));
    expect(tally()).toEqual(["2", "0"]);

    drop("f1", "c4");
    expect(tally()).toEqual(["3", "0"]);
    expect(status()).toBe("all-covered");
  });

  it("draws the repertoire as a map, with where the reader is and what is covered", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    const map = `${ID}-map`;
    // Get to the end has no map; Backtracking has, beside the Score.
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-map`));
    expect(screen.getByTestId(`${map}-svg`)).toHaveAttribute("data-rows", "2");
    expect(screen.getByTestId(`${map}-here`)).toHaveAttribute("data-node-id", "start");
    expect(screen.getByTestId(`${map}-left`)).toHaveTextContent("2 lines left");
    expect(screen.getByTestId(`${map}-covered-lines`).getAttribute("d")).toBe("");

    play(["e2", "e4"], ["d2", "d4"], ["e4", "e5"]);
    // The marker follows play: after 3... Bf5, six plies in, on the top row.
    const here = screen.getByTestId(`${map}-here`);
    expect(here.getAttribute("data-node-id")).not.toBe("start");
    expect(screen.getByTestId(`${map}-trail`).getAttribute("d")).not.toBe("");

    drop("g1", "f3");
    expect(screen.getByTestId(`${map}-left`)).toHaveTextContent("1 line left");
    expect(screen.getByTestId(`${map}-covered-lines`).getAttribute("d")).not.toBe("");
    expect(screen.getByTestId(`${map}-progress`)).toHaveAttribute("aria-valuenow", "50");

    backtrack();
    drop("d4", "c5");
    expect(screen.getByTestId(`${map}-left`)).toHaveTextContent("Every line is covered.");

    // A move the repertoire lacks is not on the map: the marker waits on the
    // last repertoire position before it.
    const end = screen.getByTestId(`${map}-here`).getAttribute("data-node-id");
    drop("e7", "e6");
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5", "dxc5", "e6"));
    expect(screen.getByTestId(`${map}-here`)).toHaveAttribute("data-node-id", end!);
  });

  it("dots every move in its side's colour, and rings the ones played", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    const map = `${ID}-map`;
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-map`));
    const dots = (name: string) =>
      (screen.getByTestId(`${map}-${name}`).getAttribute("d") ?? "").match(/h0/g)?.length ?? 0;

    // Every move a dot in its side's colour: White's e4, d4, e5; Black's c6,
    // d5, Bf5 and c5; both lines end on a White move (Nf3, dxc5).
    expect(dots("white-moves")).toBe(3);
    expect(dots("black-moves")).toBe(4);
    expect(dots("white-ends")).toBe(2);
    expect(dots("black-ends")).toBe(0);
    expect(dots("trail-moves")).toBe(0);

    play(["e2", "e4"], ["d2", "d4"]);
    // Four moves played, four dots on the way.
    expect(dots("trail-moves")).toBe(4);

    // Written on it by default, at a readable scale, in the tab itself.
    expect(screen.getByTestId(`${map}-show-moves`)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(`${map}-zoom`)).toHaveTextContent("250%");
    expect(within(screen.getByTestId(`${map}-labels`)).getByText("e4")).toBeInTheDocument();
  });

  it("zooms and pans the map in the tab as full screen does, and keeps it across tabs", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    const map = `${ID}-map`;
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-map`));
    const view = () => {
      const g = screen.getByTestId(`${map}-view`);
      return { x: Number(g.getAttribute("data-x")), y: Number(g.getAttribute("data-y")), k: Number(g.getAttribute("data-k")) };
    };
    const viewport = screen.getByTestId(`${map}-viewport`);

    const before = view();
    fireEvent.wheel(viewport, { deltaY: -200, clientX: 100, clientY: 80 });
    const after = view();
    expect(after.k).toBeGreaterThan(before.k);
    expect((100 - after.x) / after.k).toBeCloseTo((100 - before.x) / before.k);

    fireEvent.pointerDown(viewport, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 20, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    expect(view().x).toBeCloseTo(after.x - 30);
    expect(view().y).toBeCloseTo(after.y + 40);

    fireEvent.click(screen.getByTestId(`${map}-zoom-in`));
    expect(view().k).toBeCloseTo(after.k * 1.25);
    const kept = view();

    // Kept mounted: a trip to another tab leaves the view where it was.
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-moves`));
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-map`));
    expect(view()).toEqual(kept);
  });

  it("follows the reader when play leaves the view", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    const map = `${ID}-map`;
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-map`));
    const viewport = screen.getByTestId(`${map}-viewport`);
    // Dragged far away: the marker is off screen.
    fireEvent.pointerDown(viewport, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 3000, clientY: 3000, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    play(["e2", "e4"]);
    // The view came back to it (centred on 1. e4; the trainer's 1... c6, a
    // column on, was already in view): the marker is inside the viewport.
    const g = screen.getByTestId(`${map}-view`);
    const here = screen.getByTestId(`${map}-here`);
    const k = Number(g.getAttribute("data-k"));
    const sx = Number(here.getAttribute("cx")) * k + Number(g.getAttribute("data-x"));
    const sy = Number(here.getAttribute("cy")) * k + Number(g.getAttribute("data-y"));
    // The tab's fallback viewport (jsdom measures nothing) is 320 × 360.
    expect(sx).toBeGreaterThan(24);
    expect(sx).toBeLessThan(320 - 24);
    expect(sy).toBeGreaterThan(24);
    expect(sy).toBeLessThan(360 - 24);
  });

  it("opens the map full screen, zoomed with the wheel and moved by dragging", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    const map = `${ID}-map`;
    const full = `${map}-dialog`;
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-map`));
    play(["e2", "e4"]);

    fireEvent.click(screen.getByTestId(`${map}-fullscreen`));
    const view = () => {
      const g = screen.getByTestId(`${full}-view`);
      return { x: Number(g.getAttribute("data-x")), y: Number(g.getAttribute("data-y")), k: Number(g.getAttribute("data-k")) };
    };
    // The same drawing, with the reader on it, at the readable scale.
    expect(screen.getByTestId(`${full}-here`)).toHaveAttribute(
      "data-node-id",
      screen.getByTestId(`${map}-here`).getAttribute("data-node-id")!,
    );
    expect(view().k).toBe(2.5);
    expect(screen.getByTestId(`${full}-zoom`)).toHaveTextContent("250%");

    // The wheel zooms about the pointer: the drawing point under it stays put.
    const viewport = screen.getByTestId(`${full}-viewport`);
    const before = view();
    fireEvent.wheel(viewport, { deltaY: -200, clientX: 300, clientY: 200 });
    const after = view();
    expect(after.k).toBeGreaterThan(2.5);
    expect((300 - after.x) / after.k).toBeCloseTo((300 - before.x) / before.k);

    // A drag moves it by exactly the pointer's travel.
    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 140, clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    expect(view().x).toBeCloseTo(after.x + 40);
    expect(view().y).toBeCloseTo(after.y - 30);
    // Released: moving the pointer no longer pans.
    fireEvent.pointerMove(viewport, { clientX: 500, clientY: 500, pointerId: 1 });
    expect(view().x).toBeCloseTo(after.x + 40);

    // The buttons: zoom, fit the whole tree, and back to the reader.
    fireEvent.click(screen.getByTestId(`${full}-zoom-out`));
    expect(view().k).toBeCloseTo(after.k / 1.25);
    fireEvent.click(screen.getByTestId(`${full}-fit`));
    const fitted = view();
    expect(fitted.k).toBeGreaterThan(1); // a small tree, blown up to the screen
    fireEvent.click(screen.getByTestId(`${full}-locate`));
    expect(view().k).toBe(fitted.k);

    fireEvent.click(screen.getByTestId(`${full}-close`));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByTestId(`${full}-view`)).not.toBeInTheDocument();
  });

  it("writes the moves on the full-screen map by default, for the dots on screen", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/backtrack`);
    const full = `${ID}-map-dialog`;
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-map`));
    play(["e2", "e4"]);
    fireEvent.click(screen.getByTestId(`${ID}-map-fullscreen`));

    // On by default, at a readable scale: the moves around the reader, theirs picked out.
    const toggle = screen.getByTestId(`${full}-show-moves`);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    const labels = within(screen.getByTestId(`${full}-labels`));
    expect(labels.getByText("e4")).toHaveClass("map-label-trail");
    expect(labels.getByText("Bf5")).not.toHaveClass("map-label-trail");
    expect(screen.getByTestId(`${full}-hint`)).toHaveTextContent("Scroll to zoom, drag to move");

    // Zoomed out past reading: none, and a hint says so.
    for (let step = 0; step < 3; step += 1) fireEvent.click(screen.getByTestId(`${full}-zoom-out`));
    expect(screen.queryByTestId(`${full}-labels`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${full}-hint`)).toHaveTextContent("Zoom in to read the moves");
    for (let step = 0; step < 3; step += 1) fireEvent.click(screen.getByTestId(`${full}-zoom-in`));
    expect(screen.getByTestId(`${full}-labels`)).toBeInTheDocument();

    // Dragged far off the drawing: nothing on screen, nothing written.
    const viewport = screen.getByTestId(`${full}-viewport`);
    fireEvent.pointerDown(viewport, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 5000, clientY: 5000, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    expect(screen.queryByTestId(`${full}-labels`)).not.toBeInTheDocument();

    // Back, and off — one setting for both views. (A game's map has no links.)
    fireEvent.click(screen.getByTestId(`${full}-locate`));
    expect(screen.getByTestId(`${full}-labels`)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Go to / })).toHaveLength(0);
    fireEvent.click(toggle);
    expect(screen.queryByTestId(`${full}-labels`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${ID}-map-show-moves`)).toHaveAttribute("aria-pressed", "false");
  });

  it("has no map in Get to the end", async () => {
    await mount(`/repertoires/${await storeRepertoire("r", CARO)}/games/end`);
    expect(screen.queryByTestId(`${ID}-panel-tab-map`)).not.toBeInTheDocument();
  });

  it("starts over with nothing covered", async () => {
    await mount(`/repertoires/${await storeRepertoire("f", WHITE_FORK)}/games/backtrack`);
    play(["e2", "e4"]);
    drop("g1", "f3");
    expect(lines()).toBe("Lines covered: 1 of 2");

    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-score`));
    fireEvent.click(screen.getByTestId(`${ID}-score-start-over`));
    expect(lines()).toBe("Lines covered: 0 of 2");
    expect(position()).toBe(new Chess().fen());
    // The Score tab stays where it was.
    expect(within(screen.getByTestId(`${ID}-score`)).getByTestId(`${ID}-score-lines`)).toBeVisible();
  });
});
