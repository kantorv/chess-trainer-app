import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { Chess } from "chess.js";

import i18n from "../../i18n";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import { FAKE_TIMERS, renderSection, storeRepertoire } from "./repertoireTestKit";

/*
  Play chances in the player (CTA-69) — lichess-tools' `prc:N`, set per
  branch from the move menu, saved as a session change, and followed by the
  trainer at once. The harness is `RepertoirePlayer.test.tsx`'s: fake timers
  for the trainer's delay, `Math.random` pinned so its pick is deterministic.
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

/** At 3. e5 the repertoire has Bf5 (the mainline) and c5 — one line each. */
const CARO = ['[Event "My Caro"]', "", "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *"].join("\n");

const fenAfter = (...sans: string[]) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
};

const mountIdle = async (path: string) => {
  await renderSection(path);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};
const drop = (from: string, to: string) =>
  act(() => {
    boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });
const wait = () =>
  act(() => {
    vi.advanceTimersByTime(2_000);
  });
const openMenuOn = (ply: number) =>
  fireEvent.contextMenu(screen.getByTestId(`move-ply-${ply}`), { clientX: 40, clientY: 60 });
const setChance = (san: string, value: string) =>
  fireEvent.change(screen.getByTestId(`play-chance-input-${san}`), { target: { value } });

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
  vi.useFakeTimers(FAKE_TIMERS);
  // A draw of 0 takes the first move with any chance.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("play chances", () => {
  it("are offered on a move with alternatives, and not on one without", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    openMenuOn(1);
    expect(screen.queryByTestId("move-menu-chances")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    openMenuOn(6);
    expect(screen.getByTestId("move-menu-chances")).toBeInTheDocument();
  });

  it("list the branch's moves with the chance each is played, worked out live", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    openMenuOn(6);
    fireEvent.click(screen.getByTestId("move-menu-chances"));

    const dialog = within(screen.getByTestId("play-chance-dialog"));
    expect(dialog.getByTestId("play-chance-after")).toHaveTextContent("3. e5");
    // Nothing marked: one line each, so an even split.
    expect(dialog.getByTestId("play-chance-result-Bf5")).toHaveTextContent("50%");
    expect(dialog.getByTestId("play-chance-result-c5")).toHaveTextContent("50%");

    setChance("c5", "75");
    expect(dialog.getByTestId("play-chance-result-c5")).toHaveTextContent("75%");
    expect(dialog.getByTestId("play-chance-result-Bf5")).toHaveTextContent("25%");

    setChance("Bf5", "150");
    expect(dialog.getByTestId("play-chance-total")).toHaveTextContent("0 to 100");
    expect(dialog.getByTestId("play-chance-save")).toBeDisabled();
  });

  it("save as prc:N in the moves' comments — a session change the trainer follows at once", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", CARO)}`);
    expect(screen.getByTestId("repertoire-board-save")).toBeDisabled();

    openMenuOn(6);
    fireEvent.click(screen.getByTestId("move-menu-chances"));
    setChance("Bf5", "0");
    setChance("c5", "100");
    fireEvent.click(screen.getByTestId("play-chance-save"));

    expect(screen.queryByTestId("play-chance-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-save")).toBeEnabled();
    expect(screen.getByTestId("move-comment-icon-6")).toBeInTheDocument();

    // Autoplay on: a draw of 0 would take Bf5, but it is marked never.
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-settings"));
    fireEvent.click(screen.getByTestId("repertoire-board-setting-autoplay").querySelector("input")!);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));
    for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"]]) {
      drop(from, to);
      wait();
    }
    expect(boardOptions().position).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));
  });

  it("show as a Play chance chip in the comment block", async () => {
    await mountIdle(
      `/repertoires/${await storeRepertoire("r", CARO.replace("3... c5", "3... c5 {Sharp. prc:30}"))}?at=e4,c6,d4,d5,e5,c5`,
    );
    const block = screen.getByTestId("repertoire-board-annotations");
    expect(block).toHaveTextContent("Sharp.");
    expect(block).not.toHaveTextContent("prc:30");
    expect(screen.getByTestId("repertoire-board-annotations-after-0-attr-prc")).toHaveTextContent(
      "Play chance 30%",
    );
  });
});

describe("↑ / ↓ in the player — switching the trainer's reply", () => {
  /** After 1. e4 the file answers c6 (the mainline) or e5, each with its line. */
  const TWO_REPLIES = ['[Event "Two"]', "", "1. e4 c6 (1... e5 2. Nf3 Nc6) 2. d4 *"].join("\n");
  const key = (name: string) => fireEvent.keyDown(document.body, { key: name });

  it("cycle the siblings, and the trainer goes on from the one chosen", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", TWO_REPLIES)}`);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-settings"));
    fireEvent.click(screen.getByTestId("repertoire-board-setting-autoplay").querySelector("input")!);
    fireEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));

    drop("e2", "e4");
    wait();
    // Even odds, a draw of 0: the trainer took c6.
    expect(boardOptions().position).toBe(fenAfter("e4", "c6"));

    key("ArrowDown");
    expect(boardOptions().position).toBe(fenAfter("e4", "e5"));
    // Nothing is owed after a navigation: the trainer does not move by itself.
    wait();
    expect(boardOptions().position).toBe(fenAfter("e4", "e5"));

    drop("g1", "f3");
    wait();
    expect(boardOptions().position).toBe(fenAfter("e4", "e5", "Nf3", "Nc6"));

    // Home and End are the line's start and end now. From the start the line
    // is the mainline again, so End is its end, not the branch just played.
    key("Home");
    expect(boardOptions().position).toBe(new Chess().fen());
    key("End");
    expect(boardOptions().position).toBe(fenAfter("e4", "c6", "d4"));
  });

  it("wrap around, and do nothing on a move without alternatives", async () => {
    await mountIdle(`/repertoires/${await storeRepertoire("r", TWO_REPLIES)}?at=e4,c6`);
    key("ArrowUp");
    expect(boardOptions().position).toBe(fenAfter("e4", "e5"));
    key("ArrowUp");
    expect(boardOptions().position).toBe(fenAfter("e4", "c6"));
    key("ArrowLeft");
    key("ArrowDown");
    expect(boardOptions().position).toBe(fenAfter("e4"));
  });
});
