import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";

import { pgnCatalog } from "../../lib/pgnCatalog";
import type { LibraryCategory } from "../../lib/libraryCatalog";
import { folderNotesOf } from "./folderNotes";
import { pgnFolderNotes } from "./pgnFolderNotes";

/**
 * The lookup a folder's notes are found through. What is actually being pinned
 * down here is one thing: **the key is the path `loadPgnLibrary` gave the
 * folder.** A note keyed on anything else is in the bundle addressing nothing,
 * and it fails silently — the panel simply keeps the hint — so the shipped
 * assertion at the bottom is the one that matters most.
 */

// The components are never rendered here; only which path each ends up under.
const stub = (name: string) => {
  const Notes = (() => null) as ComponentType;
  Notes.displayName = name;
  return Notes;
};

const allPaths = (categories: readonly LibraryCategory[]): string[] =>
  categories.flatMap((category) => [
    category.path,
    ...allPaths(category.children),
  ]);

describe("folderNotesOf", () => {
  it("keys a note by the slug of its file's stem", () => {
    const notes = folderNotesOf({
      "../../data/pgn/my_study.mdx": stub("my_study"),
    });

    expect(Object.keys(notes)).toEqual(["my-study"]);
  });

  it("puts it under the same `under` prefix the manifest nests its PGN under", () => {
    // The manifest is keyed by the *PGN* file name — the note is a sibling of
    // it, and the folder it describes is the one that file made.
    const notes = folderNotesOf(
      { "../../data/pgn/part_one.mdx": stub("part_one") },
      { files: { "part_one.pgn": { under: "lessons" } } },
    );

    // Slugged with the same `slugify` that named the folder, so the underscore
    // is a hyphen on both sides of the match.
    expect(Object.keys(notes)).toEqual(["lessons/part-one"]);
  });

  it("ignores a manifest it cannot read rather than throwing", () => {
    // `loadPgnLibrary` reports that; saying it twice would be noise, and a
    // broken manifest must not cost a folder its notes.
    const notes = folderNotesOf(
      { "../../data/pgn/my_study.mdx": stub("my_study") },
      "not an object",
    );

    expect(Object.keys(notes)).toEqual(["my-study"]);
  });

  it("takes each note as it is — an `.mdx` naming no folder simply matches none", () => {
    const notes = folderNotesOf({
      "../../data/pgn/orphan.mdx": stub("orphan"),
    });

    // Nothing is dropped and nothing is reported: the key is a path no
    // category has, so no list screen ever asks for it.
    expect(notes["orphan"]).toBeDefined();
    expect(allPaths(pgnCatalog.categories)).not.toContain("orphan");
  });
});

describe("the shipped notes", () => {
  it("every one of them names a folder the catalog actually has", () => {
    const paths = allPaths(pgnCatalog.categories);

    expect(Object.keys(pgnFolderNotes).length).toBeGreaterThan(0);
    for (const path of Object.keys(pgnFolderNotes)) {
      expect(paths).toContain(path);
    }
  });

  it("describes the rosettes study, and leaves the other folders to the hint", () => {
    expect(
      pgnFolderNotes["lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08"],
    ).toBeDefined();
    expect(
      pgnFolderNotes["lichess-study-puzzles-custom-set-1-by-lalala732-2026-05-03"],
    ).toBeUndefined();
  });
});
