import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import {
  createRepertoireFolder,
  repertoireFoldersSnapshot,
} from "../../lib/savedRepertoireFolderStore";
import { fileRepertoire, findSavedRepertoire } from "../../lib/savedRepertoireStore";
import { renderSection, storeRepertoire } from "./repertoireTestKit";

/*
  The Repertoires list's folders — one level deep: the top level lists the
  folders and then the Unfiled repertoires, `?folder=` opens one, and every
  repertoire moves between them — from its settings screen (CTA-68). The stores are real (jsdom's localStorage,
  cleared between tests by `src/test/setup.ts`); the board is stubbed as
  everywhere (`.claude/rules/chessboard.md` §8).
*/
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { id?: string } }) => (
    <div data-testid={`board-${options.id}`} />
  ),
}));

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

const folderNamed = (name: string) =>
  repertoireFoldersSnapshot()!.find((folder) => folder.name === name)!;

describe("repertoire folders on the list", () => {
  it("creates a folder from the top bar, listed ahead of the Unfiled repertoires", async () => {
    await storeRepertoire("a");
    await renderSection("/repertoires");

    await userEvent.click(screen.getByTestId("repertoires-new-folder"));
    fireEvent.change(screen.getByTestId("repertoire-folder-name-input"), {
      target: { value: "Caro-Kann" },
    });
    await userEvent.click(screen.getByTestId("repertoire-folder-name-save"));

    const folder = folderNamed("Caro-Kann");
    const rows = [...screen.getByTestId("repertoires-body").querySelectorAll("li")];
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      `repertoire-folder-${folder.id}`,
      "repertoires-item-a",
    ]);
    expect(screen.getByTestId(`repertoire-folder-${folder.id}`)).toHaveTextContent(
      "0 repertoires",
    );
  });

  it("moves a repertoire into a folder and out again, from its settings", async () => {
    await storeRepertoire("a");
    const folder = (await createRepertoireFolder("Caro"))!;
    await renderSection("/repertoires");

    await userEvent.click(screen.getByTestId("repertoires-settings-a"));
    await userEvent.click(screen.getByTestId(`repertoire-settings-folder-${folder.id}`));
    await userEvent.click(screen.getByTestId("repertoire-settings-save"));
    expect(findSavedRepertoire("a")?.folderId).toBe(folder.id);
    // Back on the list: gone from the top level, counted on the folder.
    expect(await screen.findByTestId("repertoires-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("repertoires-item-a")).not.toBeInTheDocument();
    expect(screen.getByTestId(`repertoire-folder-${folder.id}`)).toHaveTextContent(
      "1 repertoire",
    );

    // Inside the folder, and back out to Unfiled from there.
    await userEvent.click(screen.getByTestId(`repertoire-folder-open-${folder.id}`));
    expect(screen.getByTestId("repertoires-title")).toHaveTextContent("Caro");
    await userEvent.click(screen.getByTestId("repertoires-settings-a"));
    expect(screen.getByTestId(`repertoire-settings-folder-${folder.id}`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(screen.getByTestId("repertoire-settings-folder-unfiled"));
    await userEvent.click(screen.getByTestId("repertoire-settings-save"));
    expect(findSavedRepertoire("a")?.folderId).toBeNull();
    expect(await screen.findByTestId("repertoires-empty")).toHaveTextContent(
      "This folder is empty",
    );
  });

  it("shows only its own repertoires inside a folder, with no folders in it, and a way back", async () => {
    await storeRepertoire("a");
    await storeRepertoire("b");
    const folder = (await createRepertoireFolder("Caro"))!;
    await fileRepertoire("b", folder.id);
    await renderSection(`/repertoires?folder=${folder.id}`);

    expect(screen.getAllByTestId(/^repertoires-item-/).map((row) => row.dataset.testid)).toEqual(
      ["repertoires-item-b"],
    );
    expect(screen.queryByTestId(`repertoire-folder-${folder.id}`)).not.toBeInTheDocument();
    // One level: no New folder inside a folder.
    expect(screen.queryByTestId("repertoires-new-folder")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("repertoires-folder-back"));
    expect(screen.getByTestId("repertoires-title")).toHaveTextContent("Repertoires");
    expect(screen.getByTestId("repertoires-item-a")).toBeInTheDocument();
  });

  it("renames a folder from inside it", async () => {
    const folder = (await createRepertoireFolder("Caro"))!;
    await renderSection(`/repertoires?folder=${folder.id}`);

    await userEvent.click(screen.getByTestId("repertoires-folder-rename"));
    expect(screen.getByTestId("repertoire-folder-name-input")).toHaveValue("Caro");
    fireEvent.change(screen.getByTestId("repertoire-folder-name-input"), {
      target: { value: "Caro-Kann" },
    });
    await userEvent.click(screen.getByTestId("repertoire-folder-name-save"));
    expect(screen.getByTestId("repertoires-title")).toHaveTextContent("Caro-Kann");
  });

  it("deletes a folder with repertoires only after asking, and keeps them", async () => {
    await storeRepertoire("a");
    const folder = (await createRepertoireFolder("Caro"))!;
    await fileRepertoire("a", folder.id);
    await renderSection(`/repertoires?folder=${folder.id}`);

    await userEvent.click(screen.getByTestId("repertoires-folder-delete"));
    expect(screen.getByTestId("repertoire-folder-delete-text")).toHaveTextContent(
      "Its 1 repertoire moves to Unfiled",
    );
    await userEvent.click(screen.getByTestId("repertoire-folder-delete-confirm"));

    await waitFor(() => expect(findSavedRepertoire("a")?.folderId).toBeNull());
    expect(repertoireFoldersSnapshot()!).toEqual([]);
    // Back at the top level, where the repertoire now is.
    expect(screen.getByTestId("repertoires-title")).toHaveTextContent("Repertoires");
    expect(screen.getByTestId("repertoires-item-a")).toBeInTheDocument();
  });

  it("deletes an empty folder at once, from its row", async () => {
    const folder = (await createRepertoireFolder("Empty"))!;
    await renderSection("/repertoires");
    // Nothing in it, so nothing to download.
    expect(screen.getByTestId(`repertoire-folder-download-${folder.id}`)).toBeDisabled();

    await userEvent.click(screen.getByTestId(`repertoire-folder-delete-${folder.id}`));
    expect(screen.queryByTestId("repertoire-folder-delete-text")).not.toBeInTheDocument();
    expect(repertoireFoldersSnapshot()!).toEqual([]);
  });

  it("shows folders as cards in the board views", async () => {
    const folder = (await createRepertoireFolder("Caro"))!;
    await renderSection("/repertoires");
    await userEvent.click(screen.getByTestId("repertoires-view-compact"));
    expect(
      within(screen.getByTestId("repertoires-grid")).getByTestId(`repertoire-folder-${folder.id}`),
    ).toBeInTheDocument();
  });

  it("reads a folder that is not there as the top level", async () => {
    await storeRepertoire("a");
    await renderSection("/repertoires?folder=gone");
    expect(screen.getByTestId("repertoires-title")).toHaveTextContent("Repertoires");
    expect(screen.getByTestId("repertoires-item-a")).toBeInTheDocument();
  });

  it("returns from a repertoire's settings to the folder it was opened in", async () => {
    await storeRepertoire("a");
    const folder = (await createRepertoireFolder("Caro"))!;
    await fileRepertoire("a", folder.id);
    await renderSection(`/repertoires?folder=${folder.id}`);

    await userEvent.click(screen.getByTestId("repertoires-settings-a"));
    await userEvent.click(screen.getByTestId("repertoire-settings-cancel"));
    expect(await screen.findByTestId("repertoires-title")).toHaveTextContent("Caro");
  });
});
