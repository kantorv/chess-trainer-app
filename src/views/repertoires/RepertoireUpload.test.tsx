import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import type { SavedRepertoire } from "../../lib/savedRepertoires";
import {
  clearSavedRepertoires,
  savedRepertoiresSnapshot,
} from "../../lib/savedRepertoireStore";
import { repertoireFoldersSnapshot } from "../../lib/savedRepertoireFolderStore";
import { CARO, CARO_TWO_GAMES, renderSection } from "./repertoireTestKit";

/*
  The upload screen hands the reader to the board on success, so the board's
  stand-ins are needed too: the chessboard, the engine and the opening book.
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

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

/** Everything but the three fields a second bring-in must differ in. */
const content = (record: SavedRepertoire) => ({
  name: record.name,
  pgn: record.pgn,
  previewFen: record.previewFen,
  stats: record.stats,
  settings: record.settings,
  folderId: record.folderId,
});

const pickFile = async (text: string, name = "caro.pgn") => {
  const input = screen.getByTestId("repertoire-upload-input") as HTMLInputElement;
  await userEvent.upload(input, new File([text], name, { type: "application/x-chess-pgn" }));
};

const paste = (text: string) => {
  // `fireEvent.change` rather than `userEvent.type`: the text holds `[` `]`,
  // which user-event reads as key descriptors, and typing a whole file key by
  // key proves nothing a paste does not.
  fireEvent.change(screen.getByTestId("repertoire-upload-paste"), {
    target: { value: text },
  });
};

/** The record the last bring-in wrote — found once the screen has moved on. */
const stored = async (): Promise<SavedRepertoire> => {
  await waitFor(() => expect(savedRepertoiresSnapshot()).toHaveLength(1));
  return savedRepertoiresSnapshot()[0];
};

describe("bringing a repertoire in", () => {
  it("stores the identical record from a picked file and from the same text pasted", async () => {
    // A file off disk has Windows line endings; a textarea never does.
    const fileText = CARO.replace(/\n/g, "\r\n");

    const first = renderSection("/repertoires/new");
    await pickFile(fileText);
    const fromFile = await stored();
    first.unmount();

    clearSavedRepertoires();

    renderSection("/repertoires/new");
    paste(CARO);
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));
    const fromPaste = await stored();

    expect(content(fromPaste)).toEqual(content(fromFile));
    // Every field but these three is compared above — a field added to the
    // record fails here until it is added to `content` too.
    expect(Object.keys(fromFile).sort()).toEqual(
      [...Object.keys(content(fromFile)), "id", "savedAt", "updatedAt"].sort(),
    );
    expect(fromFile.name).toBe("My Caro");
    expect(fromFile.folderId).toBeNull();
  });

  it("names it as the reader asks, and then opens it on the board", async () => {
    renderSection("/repertoires/new");
    await userEvent.type(screen.getByTestId("repertoire-upload-name"), "Caro-Kann");
    await pickFile(CARO);

    const record = await stored();
    expect(record.name).toBe("Caro-Kann");
    expect(await screen.findByTestId("repertoire-board-name")).toHaveTextContent(
      "Caro-Kann",
    );
  });

  it("refuses what it cannot read, says why, and keeps nothing", async () => {
    renderSection("/repertoires/new");
    paste('[Event "x"]\n\n1. e4 Ke5 *');
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));

    expect(await screen.findByTestId("repertoire-upload-problem")).toHaveTextContent(
      "No line in it could be read.",
    );
    expect(savedRepertoiresSnapshot()).toEqual([]);
  });

  it("refuses an empty file", async () => {
    renderSection("/repertoires/new");
    await pickFile("   ");
    expect(await screen.findByTestId("repertoire-upload-problem")).toHaveTextContent(
      "That holds no PGN.",
    );
  });

  it("reports a full browser store rather than failing silently", async () => {
    renderSection("/repertoires/new");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    paste(CARO);
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));
    expect(await screen.findByTestId("repertoire-upload-problem")).toHaveTextContent(
      "storage is full",
    );
    setItem.mockRestore();
  });

  it("stores one game as it stands — no choice to make", async () => {
    renderSection("/repertoires/new");
    paste(CARO);
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));
    await stored();
    expect(screen.queryByTestId("repertoire-choice")).not.toBeInTheDocument();
  });
});

describe("a text of several games", () => {
  it("is not stored as it is: the reader is asked to merge or split", async () => {
    renderSection("/repertoires/new");
    paste(CARO_TWO_GAMES);
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));

    const choice = await screen.findByTestId("repertoire-choice");
    expect(choice).toHaveTextContent("This PGN holds 2 games");
    expect(screen.getByTestId("repertoire-choice-split")).toHaveTextContent(
      "Split into 2 repertoires",
    );
    expect(savedRepertoiresSnapshot()).toEqual([]);
  });

  it("merges into one repertoire and opens it", async () => {
    renderSection("/repertoires/new");
    fireEvent.change(screen.getByTestId("repertoire-upload-name"), {
      target: { value: "Caro-Kann" },
    });
    paste(CARO_TWO_GAMES);
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));
    await userEvent.click(await screen.findByTestId("repertoire-choice-merge"));

    const [record] = savedRepertoiresSnapshot();
    expect(savedRepertoiresSnapshot()).toHaveLength(1);
    expect(record).toMatchObject({ name: "Caro-Kann", stats: { moves: 4, variations: 1 } });
    expect(await screen.findByTestId("repertoire-board-name")).toHaveTextContent("Caro-Kann");
  });

  it("splits into one repertoire per game, in a folder of their own, and opens it", async () => {
    renderSection("/repertoires/new");
    paste(CARO_TWO_GAMES);
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));
    await userEvent.click(await screen.findByTestId("repertoire-choice-split"));

    const [folder] = repertoireFoldersSnapshot();
    expect(folder.name).toBe("My Caro");
    expect(
      savedRepertoiresSnapshot().map((row) => [row.name, row.folderId]),
    ).toEqual([
      ["Advance · 3...Bf5", folder.id],
      ["Exchange · 3...cxd5", folder.id],
    ]);
    // The reader lands inside the folder the split made.
    expect(await screen.findByTestId("repertoires-title")).toHaveTextContent("My Caro");
    expect(screen.getAllByTestId(/^repertoires-item-/)).toHaveLength(2);
  });

  it("offers no merge for games from different starts, and says why", async () => {
    renderSection("/repertoires/new");
    paste(
      `${CARO}\n\n[Event "Endgame"]\n[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. Kd2 *`,
    );
    await userEvent.click(screen.getByTestId("repertoire-upload-save"));
    expect(await screen.findByTestId("repertoire-choice-merge")).toBeDisabled();
    expect(screen.getByTestId("repertoire-choice")).toHaveTextContent(
      "start from different positions",
    );
  });
});
