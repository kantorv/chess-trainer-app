import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import {
  SAVED_REPERTOIRES_STORAGE_KEY,
  savedRepertoiresSnapshot,
} from "../../lib/savedRepertoireStore";
import {
  CARO_TWO_GAMES,
  renderSection,
  storeLegacyRepertoire,
  storeRepertoire,
} from "./repertoireTestKit";

/*
  The list screen. `<Chessboard>` is stubbed (`.claude/rules/chessboard.md` §8)
  and keeps the id and position it was handed; the store is not — it writes to
  the `localStorage` jsdom provides, which `src/test/setup.ts` clears.
*/
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { id?: string; position?: string } }) => (
    <div data-testid={`board-${options.id}`} data-position={options.position} />
  ),
}));

/** Where CARO first branches: after 3.e5, 3...Bf5 or 3...c5. */
const BRANCH_FEN = "rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3";

// Stored in call order, so the last one stored is the newest.
const store = (id: string, name: string) => storeRepertoire(id, undefined, name);

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the Repertoires list", () => {
  it("says so when there are none, and offers the way in", () => {
    renderSection("/repertoires");
    expect(screen.getByTestId("repertoires-empty")).toBeInTheDocument();
    expect(screen.getByTestId("repertoires-add")).toHaveAttribute(
      "href",
      "/repertoires/new",
    );
  });

  it("lists stored repertoires newest first, with their size, and links each to its board", () => {
    store("a", "Caro");
    store("b", "");
    renderSection("/repertoires");

    const rows = screen.getAllByTestId(/^repertoires-item-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "repertoires-item-b",
      "repertoires-item-a",
    ]);
    // Unnamed by the reader, named by its own Event tag.
    expect(rows[0]).toHaveTextContent("My Caro");
    expect(rows[1]).toHaveTextContent("Caro");
    expect(rows[1]).toHaveTextContent("4 moves · 1 variation");
    expect(screen.getByTestId("repertoires-open-a")).toHaveAttribute(
      "href",
      "/repertoires/a",
    );
    expect(screen.getByTestId("repertoires-count")).toHaveTextContent("2");
  });

  it("survives a reload — a fresh mount reads what storage holds", () => {
    store("a", "Caro");
    const first = renderSection("/repertoires");
    first.unmount();

    expect(localStorage.getItem(SAVED_REPERTOIRES_STORAGE_KEY)).toContain('"id":"a"');
    renderSection("/repertoires");
    expect(screen.getByTestId("repertoires-item-a")).toBeInTheDocument();
  });

  it("carries no per-record delete or move, on a row or a card", async () => {
    store("a", "Caro");
    renderSection("/repertoires");
    expect(screen.queryByTestId("repertoires-remove-a")).not.toBeInTheDocument();
    expect(screen.queryByTestId("repertoires-move-a")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("repertoires-view-comfortable"));
    expect(screen.queryByTestId("repertoires-remove-a")).not.toBeInTheDocument();
    expect(screen.queryByTestId("repertoires-move-a")).not.toBeInTheDocument();
  });

  it("deletes the picked repertoires in bulk, after asking", async () => {
    store("a", "Caro");
    store("b", "Slav");
    store("c", "French");
    renderSection("/repertoires");

    // Nothing picked, nothing to delete.
    expect(screen.getByTestId("repertoires-delete")).toBeDisabled();

    await userEvent.click(within(screen.getByTestId("repertoires-select-a")).getByRole("checkbox"));
    await userEvent.click(within(screen.getByTestId("repertoires-select-c")).getByRole("checkbox"));
    await userEvent.click(screen.getByTestId("repertoires-delete"));
    expect(screen.getByTestId("repertoires-delete-title")).toHaveTextContent(
      "Delete 2 repertoires?",
    );
    await userEvent.click(screen.getByTestId("repertoires-delete-confirm"));

    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["b"]);
    expect(screen.getAllByTestId(/^repertoires-item-/).map((row) => row.dataset.testid)).toEqual(
      ["repertoires-item-b"],
    );
    // The selection went with them.
    expect(screen.queryByTestId("repertoires-selected-count")).not.toBeInTheDocument();
    expect(screen.getByTestId("repertoires-delete")).toBeDisabled();
  });

  it("deletes nothing when the ask is cancelled", async () => {
    store("a", "Caro");
    renderSection("/repertoires");

    await userEvent.click(within(screen.getByTestId("repertoires-select-a")).getByRole("checkbox"));
    await userEvent.click(screen.getByTestId("repertoires-delete"));
    expect(screen.getByTestId("repertoires-delete-title")).toHaveTextContent(
      "Delete 1 repertoire?",
    );
    await userEvent.click(screen.getByTestId("repertoires-delete-cancel"));

    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["a"]);
    expect(screen.getByTestId("repertoires-selected-count")).toHaveTextContent("1");
  });

  it("picks, downloads and deletes on the cards too, keeping the picks across views", async () => {
    store("a", "Caro");
    store("b", "Slav");
    renderSection("/repertoires");

    await userEvent.click(within(screen.getByTestId("repertoires-select-a")).getByRole("checkbox"));
    for (const view of ["compact", "comfortable"]) {
      await userEvent.click(screen.getByTestId(`repertoires-view-${view}`));
      const card = within(screen.getByTestId("repertoires-grid")).getByTestId(
        "repertoires-item-a",
      );
      expect(within(card).getByRole("checkbox")).toBeChecked();
      expect(screen.getByTestId("repertoires-selected-count")).toHaveTextContent("1");
      expect(screen.getByTestId("repertoires-download")).toBeEnabled();
    }

    // On the big boards: pick the other card too, then delete both.
    const cardB = within(screen.getByTestId("repertoires-grid")).getByTestId(
      "repertoires-item-b",
    );
    await userEvent.click(within(cardB).getByRole("checkbox"));
    expect(screen.getByTestId("repertoires-selected-count")).toHaveTextContent("2");
    await userEvent.click(screen.getByTestId("repertoires-delete"));
    await userEvent.click(screen.getByTestId("repertoires-delete-confirm"));
    expect(savedRepertoiresSnapshot()).toEqual([]);
    expect(screen.getByTestId("repertoires-empty")).toBeInTheDocument();
  });

  it("offers the saved screens' three views, and previews where the lines branch", async () => {
    store("a", "Caro");
    renderSection("/repertoires");

    for (const view of ["list", "compact", "comfortable"]) {
      expect(screen.getByTestId(`repertoires-view-${view}`)).toBeInTheDocument();
    }

    await userEvent.click(screen.getByTestId("repertoires-view-compact"));
    const card = within(screen.getByTestId("repertoires-grid")).getByTestId(
      "repertoires-item-a",
    );
    expect(within(card).getByTestId("board-repertoires-preview-a")).toHaveAttribute(
      "data-position",
      BRANCH_FEN,
    );
    // The cards carry checkboxes, so the export bar stays.
    expect(screen.getByTestId("repertoires-export")).toBeInTheDocument();
  });

  it("picks rows for export in the list view", async () => {
    store("a", "Caro");
    store("b", "Slav");
    renderSection("/repertoires");

    await userEvent.click(
      within(screen.getByTestId("repertoires-select-a")).getByRole("checkbox"),
    );
    expect(screen.getByTestId("repertoires-selected-count")).toHaveTextContent("1");
    await userEvent.click(
      within(screen.getByTestId("repertoires-select-all")).getByRole("checkbox"),
    );
    expect(screen.getByTestId("repertoires-selected-count")).toHaveTextContent("2");
    expect(screen.getByTestId("repertoires-download")).toBeEnabled();
  });

  it("follows a write made while it is showing", () => {
    renderSection("/repertoires");
    act(() => {
      store("a", "Caro");
    });
    expect(screen.getByTestId("repertoires-item-a")).toBeInTheDocument();
  });

  it("marks a record from before the one-game rule as needing a choice", () => {
    storeLegacyRepertoire("old", CARO_TWO_GAMES, "Old Caro");
    renderSection("/repertoires");
    expect(screen.getByTestId("repertoires-item-old")).toHaveTextContent(
      "Several games — open to merge or split",
    );
  });
});
