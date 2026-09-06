import type { ComponentType } from "react";

import rawManifest from "../../data/pgn.json";
import { folderNotesOf, type FolderNotes } from "./folderNotes";

/**
 * The User PGNs section's folder notes, resolved once — the binding over
 * [`folderNotes.ts`](./folderNotes.ts), and the exact counterpart of
 * `lib/pgnCatalog.ts`: that module globs the `.pgn` files, this one globs the
 * `.mdx` files sitting beside them.
 *
 * **Writing notes for a folder is dropping `<same stem>.mdx` into
 * [`src/data/pgn/`](../../data/pgn).** The glob finds it at build time, the list
 * screen renders it in the right-hand panel instead of the static hint, and a
 * folder without one is untouched. No TypeScript, no locale key, no route.
 *
 * `eager` and unqueried, so Vite compiles each note through `@mdx-js/rollup`
 * (see `vite.config.ts`) and inlines the resulting component: the lookup is a
 * plain object at module scope, which is what lets the section descriptor hold
 * it and the panel render it with no loading state. The cost is that every
 * note is in the bundle whether or not its folder is ever opened — a paragraph
 * of prose each, against the megabytes of PGN already inlined next to it.
 */

/**
 * Every `.mdx` under `src/data/pgn/`, as `path -> component`. Typed at the seam
 * for the same reason `pgnCatalog.ts` types its own glob: the inferred type
 * depends on the glob's options, and one cast here is clearer than one per use.
 */
const notes = import.meta.glob("../../data/pgn/*.mdx", {
  import: "default",
  eager: true,
}) as Record<string, ComponentType>;

/** The shipped lookup, keyed by category path. */
export const pgnFolderNotes: FolderNotes = folderNotesOf(notes, rawManifest);
