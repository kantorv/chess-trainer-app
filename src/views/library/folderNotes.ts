import type { ComponentType } from "react";

import { readPgnManifest, slugify } from "../../lib/pgnLibrary";

/**
 * **A library folder's authored notes**, as a lookup from a category path to the
 * component that renders them.
 *
 * A folder in the User PGNs section is a `.pgn` file; its notes are a **sibling
 * `.mdx` file with the same stem** — `my_study.pgn` is described by
 * `my_study.mdx` next to it. Same promise the section already makes for the PGN
 * itself: adding notes is a one-file drop, with no manifest field, no locale key
 * and no component edit.
 *
 * ## Why this lives in the view layer
 *
 * The obvious home would be a field on `LibraryCategory`, and that is exactly
 * what it must not be. `src/lib/` is pure data — `libraryCatalog.ts` and its
 * tests treat a catalog as something you can compare, serialise and reason about
 * without a renderer — and a `ComponentType` field would drag React into it. So
 * the notes are a **second lookup, keyed by the same category path**, that a
 * screen resolves beside the catalog rather than out of it.
 *
 * It reaches the screens through the `LibrarySection` descriptor
 * ([`section.ts`](./section.ts)), so `LibraryList` renders whatever notes its
 * section carries and knows nothing about `.mdx`, about PGN files, or about
 * which sections happen to have any. Mates and Positions could carry notes
 * later by filling that one field.
 *
 * ## Deriving the path
 *
 * The key has to be the path `loadPgnLibrary` gave the folder, or a note sits in
 * the bundle addressing nothing: the slug of the file stem, under the manifest's
 * `under` prefix when it has one. Both come from `lib/pgnLibrary.ts` — the
 * `slugify` used here is the one that named the folder, not a second copy of the
 * rule.
 *
 * An `.mdx` whose `.pgn` is not there is not an error worth a `problems` line:
 * it names a folder that does not exist, so nothing ever looks it up.
 */

/** Category path → the component rendering that folder's notes. */
export type FolderNotes = Record<string, ComponentType>;

/** The file name out of a glob key, which is a path. */
const baseNameOf = (path: string): string => path.split("/").pop() ?? path;

/**
 * Build the lookup from `path -> MDX component` plus the same raw manifest
 * `loadPgnLibrary` reads.
 *
 * Pure, and takes its modules as a parameter: the shipped binding with the
 * `import.meta.glob` in it is [`pgnFolderNotes.ts`](./pgnFolderNotes.ts), so the
 * tests can hand this plain components.
 *
 * Manifest problems are the catalog loader's to report — it reads the same file
 * and would say it twice — so they are collected and dropped here.
 */
export const folderNotesOf = (
  modules: Record<string, ComponentType>,
  rawManifest?: unknown,
): FolderNotes => {
  const manifest = readPgnManifest(rawManifest, []);
  const notes: FolderNotes = {};

  for (const [path, Notes] of Object.entries(modules)) {
    const stem = baseNameOf(path).replace(/\.mdx$/i, "");
    // The manifest is keyed by the *PGN* file name — the notes are a sibling of
    // it, and the folder they describe is the one that file made.
    const entry = manifest.files[`${stem}.pgn`];
    const folderId = slugify(stem) || slugify(`${stem}.pgn`);
    if (folderId === "") continue;

    notes[
      entry?.under !== undefined && entry.under !== ""
        ? `${entry.under}/${folderId}`
        : folderId
    ] = Notes;
  }

  return notes;
};
