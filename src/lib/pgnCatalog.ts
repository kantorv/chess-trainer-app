import { loadPgnLibrary, type PgnLibrary } from "./pgnLibrary";
import type { PgnKinds } from "./pgnKind";
import { mergePgnLibraries, uploadsLibraryOf, type PgnUpload } from "./pgnUploads";
import { uploadsSnapshot } from "./pgnUploadStore";
import rawManifest from "../data/pgn.json";

/**
 * The User PGNs library, loaded once — the third binding over the shared library
 * layer in [`libraryCatalog.ts`](./libraryCatalog.ts), and the first whose
 * content is not a JSON file at all.
 *
 * **Adding content is dropping a `.pgn` file into
 * [`src/data/pgn/`](../data/pgn).** The glob below finds it at build time, one
 * folder appears in the sidebar named from the file's `StudyName` tag (or from
 * the file name), each game inside it becomes a card, and `/pgn/*` already
 * serves every URL under it. No TypeScript, no locale key, no route.
 *
 * `import.meta.glob` is **eager** and `?raw`: Vite inlines each file's text into
 * the bundle at build time, so there is no fetch, no loading state and no
 * ordering problem for the sidebar — which is built from this catalog at module
 * scope and therefore has to have it. The cost is one parse per game on first
 * load, and that parse is also what validates the game
 * (`lib/pgnLibrary.ts`), so nothing is parsed twice.
 *
 * The manifest is [`src/data/pgn.json`](../data/pgn.json) and is optional in the
 * sense that matters: it renames, translates, nests and orders folders, and a
 * file it says nothing about still appears. `chess_com_games_2026-08-30.pgn` is
 * deliberately absent from it, so the shipped data exercises that promise.
 */

/**
 * Every `.pgn` under `src/data/pgn/`, as `path -> text`. Typed here rather than
 * inferred: the glob's own type depends on the `?raw` query, and one cast at the
 * seam is clearer than one at every use.
 */
const files = import.meta.glob("../data/pgn/*.pgn", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The shipped catalog, loaded once. */
export const pgnCatalog: PgnLibrary = loadPgnLibrary(files, rawManifest);

/**
 * What kind of thing each shipped folder is, keyed by category path — a study,
 * a collection of studies, a shelf of files, a file of played games
 * ([`pgnKind.ts`](./pgnKind.ts)). It is what `views/pgn/UserPgnsSection.tsx`
 * dispatches on, and it is re-exported here so a screen imports the catalog and
 * its kinds from one module.
 *
 * The **shipped** kinds. A screen wants `userPgnsLibrary().kinds` below, which
 * knows about the reader's uploads too.
 */
export const pgnKinds: PgnKinds = pgnCatalog.kinds;

/*
  The live library, memoised on the identity of the uploads snapshot.

  Parsing the uploads is the expensive half of this section (a twenty-eight
  study export is 169 games), and `userPgnsLibrary()` is called from render —
  by the section descriptor's `catalog` getter, on every screen. The store
  returns the same array until its stored text changes, so this rebuilds when
  the reader uploads or removes a file, and never in between.
*/
let live: { uploads: readonly PgnUpload[]; library: PgnLibrary } | undefined;

/**
 * **The User PGNs library as it stands now**: the shipped files, plus whatever
 * the reader has uploaded, as one catalog.
 *
 * Everything that reads the section goes through this — the section descriptor
 * ([`views/library/section.ts`](../views/library/section.ts)), the sidebar
 * generator and the `?game=` references — so an uploaded chapter is listed,
 * routed, searched and handed on exactly as a shipped one is. `pgnCatalog`
 * above stays the shipped-only value, which is what the shipped-data tests
 * assert against.
 */
export const userPgnsLibrary = (): PgnLibrary => {
  const uploads = uploadsSnapshot();
  if (live === undefined || live.uploads !== uploads) {
    live = { uploads, library: mergePgnLibraries(pgnCatalog, uploadsLibraryOf(uploads)) };
  }
  return live.library;
};
