import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import {
  checkRepertoirePgn,
  savedRepertoireOf,
} from "../../lib/savedRepertoires";
import { saveRepertoire } from "../../lib/savedRepertoireStore";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import { CARO, renderSection } from "./repertoireTestKit";

/*
  The board screen, with the **real** panel — `RepertoirePropagation.test.tsx`
  is the other half, with the panel replaced by a sentinel. The stand-ins are
  the Development section's own (`views/dev/devTestHarness.tsx`): the section's
  board is composed from the same core, so it is stubbed the same way.
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

const files = import.meta.glob<string>("../../data/pgn/*.pgn", {
  query: "?raw",
  import: "default",
  eager: true,
});
const shipped = (name: string) => files[`../../data/pgn/${name}`]!;

/** Bring a text in the way the upload screen does, and return its id. */
const bringIn = (id: string, text: string, name = "") => {
  const check = checkRepertoirePgn(text);
  if (!check.ok) throw new Error(`fixture did not read: ${check.problem}`);
  expect(saveRepertoire(savedRepertoireOf(id, text, name, check.previewFen))).toBeUndefined();
  return id;
};

const AFTER_NF3 = "rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/5N2/PPP2PPP/RNBQKB1R b KQkq - 2 4";
const AFTER_CXD5 = "rnbqkbnr/pp2pppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4";

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

/** Wait for the line picked to be read onto the board. */
const lineReady = () =>
  waitFor(() =>
    expect(screen.queryByTestId("repertoire-board-reading")).not.toBeInTheDocument(),
  );

describe("a repertoire on the v2 board", () => {
  it("renders the shared board square and the shared panel skeleton", async () => {
    renderSection(`/repertoires/${bringIn("r", CARO, "Caro")}`);
    await lineReady();

    // The square is `EngineBoardSquare`'s, reached through `BoardShell`.
    expect(screen.getByTestId("repertoire-board-screen")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-board")).toBeInTheDocument();
    expect(boardOptions().id).toBe("repertoire-board");

    // The skeleton is `BoardPanel`'s: pinned variations, status, the tabs, the controls.
    expect(screen.getByTestId("repertoire-board-panel")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-panel-variations")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-panel-status")).toBeInTheDocument();
    for (const tab of ["lines", "moves", "tree", "engine"]) {
      expect(screen.getByTestId(`repertoire-board-panel-tab-${tab}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("board-controls")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-name")).toHaveTextContent("Caro");
  });

  it("opens on the Lines tab with the first line on the board", async () => {
    renderSection(`/repertoires/${bringIn("r", CARO)}`);
    await lineReady();

    const lines = screen.getByTestId("repertoire-lines");
    expect(within(lines).getByText("Advance")).toBeInTheDocument();
    expect(within(lines).getByText("Exchange")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-line-0")).toHaveClass("Mui-selected");
    expect(screen.getByTestId("repertoire-board-line")).toHaveTextContent("3...Bf5");

    // Loaded at ply 0, the way a game arrives; the end of the line is a click away.
    await userEvent.click(screen.getByTestId("board-control-last"));
    expect(boardOptions().position).toBe(AFTER_NF3);
  });

  it("loads a picked line into the same board, side lines intact", async () => {
    renderSection(`/repertoires/${bringIn("r", CARO)}`);
    await lineReady();
    const engineBefore = FakeEngine.instances.length;

    await userEvent.click(screen.getByTestId("repertoire-line-1"));
    await lineReady();
    expect(screen.getByTestId("repertoire-board-line")).toHaveTextContent("3...cxd5");
    await userEvent.click(screen.getByTestId("board-control-last"));
    expect(boardOptions().position).toBe(AFTER_CXD5);
    // The same board: no remount, so no second worker.
    expect(FakeEngine.instances.length).toBe(engineBefore);

    // Back to the first line, and its `(3... c5 4. dxc5)` is in the tree.
    await userEvent.click(screen.getByTestId("repertoire-line-0"));
    await lineReady();
    await userEvent.click(screen.getByTestId("repertoire-board-panel-tab-tree"));
    const tree = screen.getByTestId("repertoire-board-panel-content-tree");
    expect(tree).toHaveTextContent("c5");
    expect(tree).toHaveTextContent("dxc5");
  });

  it("never moves a piece by itself", async () => {
    renderSection(`/repertoires/${bringIn("r", CARO)}`);
    await lineReady();
    const before = boardOptions().position;
    act(() => {
      FakeEngine.latest().say({ bestMove: "e2e4", fen: before });
    });
    expect(boardOptions().position).toBe(before);
  });

  it("says so for an id this browser does not hold", () => {
    renderSection("/repertoires/nope");
    expect(screen.getByTestId("repertoire-board-missing")).toBeInTheDocument();
  });

  it("browses the Alapin example: 310 lines in its chapters, any one a click away", async () => {
    const alapin = shipped(
      "Tame_the_Sicilian_The_Alapin_Variation_GM_Kasimdzhanov__&_GM_Ganguly.pgn",
    );
    renderSection(`/repertoires/${bringIn("alapin", alapin, "Alapin")}`);
    await lineReady();

    expect(screen.getAllByTestId(/^repertoire-line-\d+$/)).toHaveLength(310);
    expect(screen.getAllByTestId(/^repertoire-chapter-\d+$/).length).toBeGreaterThanOrEqual(29);

    await userEvent.click(screen.getByTestId("repertoire-line-200"));
    await lineReady();
    expect(screen.getByTestId("repertoire-line-200")).toHaveClass("Mui-selected");
    await userEvent.click(screen.getByTestId("board-control-last"));
    expect(boardOptions().position).not.toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  }, 30_000);

  it("opens the 9,146-node Nimzo-Indian example, reading first and then showing it", async () => {
    const nimzo = shipped("nimzo-indian-repertoire.pgn");
    renderSection(`/repertoires/${bringIn("nimzo", nimzo)}`);

    // The screen is up before the tree is: it says it is reading.
    expect(screen.getByTestId("repertoire-board-panel")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-reading")).toBeInTheDocument();

    await waitFor(
      () =>
        expect(
          screen.queryByTestId("repertoire-board-reading"),
        ).not.toBeInTheDocument(),
      { timeout: 10_000 },
    );
    expect(screen.getByTestId("repertoire-board-name")).toHaveTextContent(
      "Complete Nimzo-Indian Repertoire for Black by @hpy",
    );

    // And it can be stepped through: a move, and the board follows.
    await userEvent.click(screen.getByTestId("board-control-next"));
    expect(boardOptions().position).toContain("PPP1PPPP");
  }, 30_000);
});
