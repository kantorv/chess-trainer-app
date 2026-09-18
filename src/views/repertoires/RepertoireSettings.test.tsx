import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import {
  findSavedRepertoire,
  savedRepertoiresSnapshot,
} from "../../lib/savedRepertoireStore";
import { boardOptions } from "../dev/devTestHarness";
import { renderSection, storeRepertoire } from "./repertoireTestKit";

/*
  The settings screen, reached the way a reader reaches it — from the list's
  gear or the board's — and judged by what the rest of the section does with
  what it saves: the list's title and description, the board's orientation.
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

const store = (id: string) => storeRepertoire(id);

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("a repertoire's settings screen", () => {
  it("edits the title, description and main color, and the list shows them", async () => {
    store("a");
    store("b");
    renderSection("/repertoires");

    await userEvent.click(screen.getByTestId("repertoires-settings-a"));
    expect(screen.getByTestId("repertoire-settings-name")).toHaveValue("My Caro");
    expect(screen.getByTestId("repertoire-settings-color-white")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.change(screen.getByTestId("repertoire-settings-name"), {
      target: { value: "  Caro-Kann for Black " },
    });
    fireEvent.change(screen.getByTestId("repertoire-settings-description"), {
      target: { value: "Advance and Exchange.\n" },
    });
    await userEvent.click(screen.getByTestId("repertoire-settings-color-black"));
    await userEvent.click(screen.getByTestId("repertoire-settings-save"));

    // Back where it came from — the list — with the record edited in place.
    expect(await screen.findByTestId("repertoires-screen")).toBeInTheDocument();
    expect(savedRepertoiresSnapshot().map((row) => row.id)).toEqual(["b", "a"]);
    expect(findSavedRepertoire("a")).toMatchObject({
      name: "Caro-Kann for Black",
      settings: { description: "Advance and Exchange.", color: "black" },
    });
    expect(screen.getByTestId("repertoires-item-a")).toHaveTextContent("Caro-Kann for Black");
    expect(screen.getByTestId("repertoires-description-a")).toHaveTextContent(
      "Advance and Exchange.",
    );
  });

  it("keeps whether the board draws the next-move arrows, on by default", async () => {
    store("a");
    renderSection("/repertoires/a/settings");
    const toggle = screen.getByTestId("repertoire-settings-show-arrows");
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    await userEvent.click(screen.getByTestId("repertoire-settings-save"));
    expect(findSavedRepertoire("a")?.settings.showArrows).toBe(false);

    // The board, opened afresh, draws none.
    renderSection("/repertoires/a");
    await waitFor(() => expect(boardOptions().id).toBe("repertoire-board"), { timeout: 10_000 });
    await waitFor(() => expect(boardOptions().arrows).toEqual([]));
  });

  it("protects a repertoire by default, and saves the reader's no", async () => {
    store("a");
    renderSection("/repertoires/a/settings");
    const toggle = screen.getByTestId("repertoire-settings-protected");
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByTestId("repertoire-settings-save"));
    expect(findSavedRepertoire("a")?.settings.protected).toBe(false);
  });

  it("drops the draft on Cancel", async () => {
    store("a");
    renderSection("/repertoires");
    await userEvent.click(screen.getByTestId("repertoires-settings-a"));
    fireEvent.change(screen.getByTestId("repertoire-settings-name"), {
      target: { value: "Something else" },
    });
    await userEvent.click(screen.getByTestId("repertoire-settings-cancel"));

    expect(await screen.findByTestId("repertoires-screen")).toBeInTheDocument();
    expect(findSavedRepertoire("a")?.name).toBe("My Caro");
  });

  it("opens the board facing the main color, with the description above the lines", async () => {
    store("a");
    renderSection("/repertoires/a");
    await waitFor(() =>
      expect(screen.queryByTestId("repertoire-board-reading")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "white");
    expect(screen.queryByTestId("repertoire-board-description")).not.toBeInTheDocument();

    // From the board's own gear, and back to the board on Save.
    await userEvent.click(screen.getByTestId("repertoire-board-settings"));
    await userEvent.click(screen.getByTestId("repertoire-settings-color-black"));
    fireEvent.change(screen.getByTestId("repertoire-settings-description"), {
      target: { value: "Play it from Black." },
    });
    await userEvent.click(screen.getByTestId("repertoire-settings-save"));

    await waitFor(() =>
      expect(screen.queryByTestId("repertoire-board-reading")).not.toBeInTheDocument(),
    );
    expect(boardOptions().id).toBe("repertoire-board");
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "black");
    expect(screen.getByTestId("repertoire-board-description")).toHaveTextContent(
      "Play it from Black.",
    );
  });

  it("says so for an id this browser does not hold", () => {
    renderSection("/repertoires/nope/settings");
    expect(screen.getByTestId("repertoire-settings-missing")).toBeInTheDocument();
  });
});
