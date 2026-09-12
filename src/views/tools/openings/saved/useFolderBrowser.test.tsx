import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import i18n from "../../../../i18n";
import { emptyTree } from "../../../../lib/gameTree";
import { savedOpeningOf, type SavedOpening } from "../../../../lib/savedOpenings";
import type { OpeningFolder } from "../../../../lib/savedOpeningFolders";
import { createOpeningFolder } from "../../../../lib/savedOpeningFolderStore";
import { useFolderBrowser } from "./useFolderBrowser";

/*
  The unit test the split screen was made for: the folder browsing is a hook
  over plain parameters — `openings` and `folders` are arrays, not a store — so
  this drives it without the screen, and the screen's own suite covers the same
  behavior end to end through the pixels.
*/

/** One opening filed nowhere, or under the folder id given. */
const opening = (id: string, folderId: string | null): SavedOpening =>
  savedOpeningOf(
    id,
    emptyTree(),
    "white",
    `note ${id}`,
    folderId,
    new Date("2026-09-07T10:00:00.000Z"),
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("useFolderBrowser", () => {
  it("starts at the top level: root folders and the Unfiled openings", () => {
    const root = createOpeningFolder("Root", null);
    const nested = createOpeningFolder("Nested", root?.id ?? null);
    if (root === undefined || nested === undefined) throw new Error("no store");

    const { result } = renderHook(() =>
      useFolderBrowser(
        [opening("loose", null), opening("filed", root.id)],
        [root, nested],
      ),
    );

    expect(result.current.currentFolder).toBeUndefined();
    expect(result.current.browseId).toBeNull();
    // Only the roots drill from here; the nested one is a level down.
    expect(result.current.foldersHere.map((f) => f.name)).toEqual(["Root"]);
    // The Unfiled opening is a top-level item; the filed one is not.
    expect(result.current.openingsHere.map((o) => o.id)).toEqual(["loose"]);
    // No chain to show at the top.
    expect(result.current.crumbs).toEqual([]);
  });

  it("drills in and shows that folder's sub-folders and openings", () => {
    const root = createOpeningFolder("Root", null);
    const nested = createOpeningFolder("Nested", root?.id ?? null);
    if (root === undefined || nested === undefined) throw new Error("no store");

    const { result } = renderHook(() =>
      useFolderBrowser(
        [opening("loose", null), opening("filed", root.id)],
        [root, nested],
      ),
    );

    act(() => result.current.open(root.id));

    expect(result.current.currentFolder?.id).toBe(root.id);
    expect(result.current.browseId).toBe(root.id);
    expect(result.current.foldersHere.map((f) => f.id)).toEqual([nested.id]);
    expect(result.current.openingsHere.map((o) => o.id)).toEqual(["filed"]);
    // The breadcrumb chain is top down, this folder included.
    expect(result.current.crumbs.map((c) => c.name)).toEqual(["Root"]);
  });

  it("reads a folder deleted out from under the browser as the top level", () => {
    const root = createOpeningFolder("Root", null);
    if (root === undefined) throw new Error("no store");

    const { result, rerender } = renderHook(
      ({ folders }: { folders: readonly OpeningFolder[] }) =>
        useFolderBrowser([], folders),
      { initialProps: { folders: [root] as readonly OpeningFolder[] } },
    );

    act(() => result.current.open(root.id));
    expect(result.current.browseId).toBe(root.id);

    // Another tab's delete: the id no longer resolves. The next render reads
    // as the top level rather than as a hole in the tree.
    rerender({ folders: [] });
    expect(result.current.browseId).toBeNull();
    expect(result.current.currentFolder).toBeUndefined();
    expect(result.current.foldersHere).toEqual([]);
  });

  it("returns to the top level when told to, and by way of a parent id", () => {
    const root = createOpeningFolder("Root", null);
    const sub = createOpeningFolder("Sub", root?.id ?? null);
    if (root === undefined || sub === undefined) throw new Error("no store");

    const { result } = renderHook(() => useFolderBrowser([], [root, sub]));

    act(() => result.current.open(sub.id));
    expect(result.current.browseId).toBe(sub.id);

    // A delete standing down here goes to the deleted folder's own parent.
    act(() => result.current.open(root.id));
    expect(result.current.browseId).toBe(root.id);

    act(() => result.current.open(null));
    expect(result.current.browseId).toBeNull();
  });
});
