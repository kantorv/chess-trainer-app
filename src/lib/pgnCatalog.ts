import { loadPgnLibrary, type PgnLibrary } from "./pgnLibrary";
import type { PgnKinds } from "./pgnKind";
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
 */
export const pgnKinds: PgnKinds = pgnCatalog.kinds;
