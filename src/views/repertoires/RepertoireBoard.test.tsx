import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import { isMultiGameRepertoire, repertoireTreeOf } from "../../lib/savedRepertoires";
import { findSavedRepertoire, savedRepertoiresSnapshot } from "../../lib/savedRepertoireStore";
import { repertoireFoldersSnapshot } from "../../lib/savedRepertoireFolderStore";
import { boardOptions, FakeEngine } from "../board/boardTestHarness";
import {
  CARO,
  CARO_TWO_GAMES,
  renderSection,
  storeMultiGameRepertoire,
  storeRepertoire,
} from "./repertoireTestKit";

/*
  The board screen, with the **real** panel — `RepertoirePropagation.test.tsx`
  is the other half, with the panel replaced by a sentinel. The stand-ins are
  the Development section's own (`views/board/boardTestHarness.tsx`): the section's
  board is composed from the same core, so it is stubbed the same way.
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

const files = import.meta.glob<string>("../../test/fixtures/pgn/*.pgn", {
  query: "?raw",
  import: "default",
  eager: true,
});
const fixture = (name: string) => files[`../../test/fixtures/pgn/${name}`]!;

const AFTER_NF3 = "rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/5N2/PPP2PPP/RNBQKB1R b KQkq - 2 4";

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

/** Wait for the repertoire to be read onto the board. */
const ready = () =>
  waitFor(
    () =>
      expect(screen.queryByTestId("repertoire-board-reading")).not.toBeInTheDocument(),
    { timeout: 10_000 },
  );

describe("a repertoire's own view — the player, on the v2 board", () => {
  it("renders the shared board square and the shared panel skeleton", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", CARO, "Caro")}`);
    await ready();

    // The square is `EngineBoardSquare`'s, reached through `BoardShell`.
    expect(screen.getByTestId("repertoire-board-screen")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-board")).toBeInTheDocument();
    expect(boardOptions().id).toBe("repertoire-board");

    // The skeleton is `BoardPanel`'s: status, the tabs, the controls. The
    // pinned variations wait for the engine, which is off until asked (CTA-63).
    expect(screen.getByTestId("repertoire-board-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("repertoire-board-panel-variations")).not.toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-panel-status")).toBeInTheDocument();
    for (const tab of ["moves", "settings", "engine"]) {
      expect(screen.getByTestId(`repertoire-board-panel-tab-${tab}`)).toBeInTheDocument();
    }
    // The player (CTA-63): its games a menu away, no game running.
    expect(screen.getByTestId("repertoire-board-games")).toBeInTheDocument();
    expect(screen.queryByTestId("repertoire-board-panel-tab-score")).not.toBeInTheDocument();
    // One game, one board: no Lines tab to pick from, no Tree tab to repeat it.
    expect(screen.queryByTestId("repertoire-board-panel-tab-lines")).not.toBeInTheDocument();
    expect(screen.queryByTestId("repertoire-board-panel-tab-tree")).not.toBeInTheDocument();
    expect(screen.getByTestId("board-controls")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-name")).toHaveTextContent("Caro");
  });

  it("opens on the Moves tab with the repertoire's side lines in the list", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r")}`);
    await ready();

    const moves = screen.getByTestId("repertoire-board-panel-content-moves");
    const side = within(moves).getAllByRole("group");
    expect(side).toHaveLength(1);
    expect(side[0]).toHaveTextContent("3… c5");
    expect(side[0]).toHaveTextContent("dxc5");

    // Loaded at ply 0, the way a game arrives; the end of the mainline is a click away.
    await userEvent.click(screen.getByTestId("board-control-last"));
    expect(boardOptions().position).toBe(AFTER_NF3);
  });

  it("keeps the Moves tab mounted across tab switches, and follows the board while hidden", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r")}`);
    await ready();
    const list = screen.getByTestId("move-list");

    // Away to Settings: the list is still there, hidden, not unmounted.
    await userEvent.click(screen.getByTestId("repertoire-board-panel-tab-settings"));
    const hidden = screen.getByTestId("repertoire-board-panel-content-moves");
    expect(hidden).not.toBeVisible();
    expect(hidden).toContainElement(list);

    // A step while it is hidden still reaches it.
    await userEvent.click(screen.getByTestId("board-control-next"));
    expect(within(hidden).getByTestId("move-ply-1")).toHaveAttribute("aria-current", "true");

    // Back: the very same list, now visible — no remount.
    await userEvent.click(screen.getByTestId("repertoire-board-panel-tab-moves"));
    expect(screen.getByTestId("move-list")).toBe(list);
    expect(screen.getByTestId("repertoire-board-panel-content-moves")).toBeVisible();

    // The Settings tab is not kept: leaving it unmounts it, as every tab used to.
    expect(
      screen.queryByTestId("repertoire-board-panel-content-settings"),
    ).not.toBeInTheDocument();
  });

  it("never moves a piece by itself", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r")}`);
    await ready();
    const before = boardOptions().position;
    act(() => {
      FakeEngine.latest().say({ bestMove: "e2e4", fen: before });
    });
    expect(boardOptions().position).toBe(before);
  });

  it("says so for an id this browser does not hold", async () => {
    await renderSection("/repertoires/nope");
    expect(screen.getByTestId("repertoire-board-missing")).toBeInTheDocument();
  });

  it("opens the one-tree example (7,859 nodes), reading first and then showing it", async () => {
    const big = fixture("live-chess-2026-09-18.pgn");
    await renderSection(`/repertoires/${await storeRepertoire("big", big)}`);

    // The screen is up before the tree is: it says it is reading.
    expect(screen.getByTestId("repertoire-board-panel")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-board-reading")).toBeInTheDocument();

    await ready();
    expect(screen.getByTestId("repertoire-board-name")).toHaveTextContent(
      "Live Chess",
    );

    // And it can be stepped through: a move (1. e4), and the board follows.
    await userEvent.click(screen.getByTestId("board-control-next"));
    expect(boardOptions().position).toContain("PPPP1PPP");
  }, 30_000);
});

describe("a record from before the one-game rule", () => {
  it("opens on the merge-or-split choice, not on a board", async () => {
    await renderSection(`/repertoires/${await storeMultiGameRepertoire("old", CARO_TWO_GAMES, "Old Caro")}`);

    expect(screen.getByTestId("repertoire-board-multi")).toHaveTextContent("Old Caro");
    expect(await screen.findByTestId("repertoire-choice")).toHaveTextContent(
      "This PGN holds 2 games",
    );
    expect(screen.queryByTestId("repertoire-board-board")).not.toBeInTheDocument();
  });

  it("merges in place: the same id, now one game, and opens on the board", async () => {
    await storeMultiGameRepertoire("old", CARO_TWO_GAMES, "Old Caro");
    await storeRepertoire("newer");
    await renderSection("/repertoires/old");
    await userEvent.click(await screen.findByTestId("repertoire-choice-merge"));

    await waitFor(() => expect(isMultiGameRepertoire(findSavedRepertoire("old")!)).toBe(false));
    const merged = findSavedRepertoire("old")!;
    expect(isMultiGameRepertoire(merged)).toBe(false);
    expect(merged.name).toBe("Old Caro");
    expect(repertoireTreeOf(merged)?.moves).toHaveLength(1);
    // In its own place in the list, not moved to the top.
    expect(savedRepertoiresSnapshot()!.map((row) => row.id)).toEqual(["newer", "old"]);

    await ready();
    expect(screen.getByTestId("repertoire-board-board")).toBeInTheDocument();
  });

  it("splits in place: one repertoire per game where the old one stood", async () => {
    await storeMultiGameRepertoire("old", CARO_TWO_GAMES, "Old Caro");
    await storeRepertoire("newer");
    await renderSection("/repertoires/old");
    await userEvent.click(await screen.findByTestId("repertoire-choice-split"));

    // Into a folder named after the old record, in the old record's place.
    await waitFor(() => expect(findSavedRepertoire("old")).toBeUndefined());
    const [folder] = repertoireFoldersSnapshot()!;
    expect(folder.name).toBe("Old Caro");
    const rows = savedRepertoiresSnapshot()!;
    expect(rows.map((row) => [row.name, row.folderId])).toEqual([
      ["My Caro", null],
      ["Advance · 3...Bf5", folder.id],
      ["Exchange · 3...cxd5", folder.id],
    ]);
    expect(findSavedRepertoire("old")).toBeUndefined();
    expect(await screen.findByTestId("repertoires-title")).toHaveTextContent("Old Caro");
  });
});
