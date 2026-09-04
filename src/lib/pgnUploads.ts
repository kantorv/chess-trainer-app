import {
  libraryCatalogOf,
  type LibraryCategory,
} from "./libraryCatalog";
import type { PgnKind, PgnKinds } from "./pgnKind";
import { loadPgnLibrary, slugify, type PgnLibrary } from "./pgnLibrary";

/**
 * **The reader's own PGN files** — the Uploads folder, and the one part of the
 * User PGNs library that is not in the bundle.
 *
 * Everything else in the section is decided at build time: a `.pgn` under
 * `src/data/pgn/` is inlined by a glob and the catalog is a module-scope
 * constant. A file the reader picks arrives at runtime, so it is kept in
 * `localStorage` and folded into that catalog on read
 * (`userPgnsLibrary()` in [`pgnCatalog.ts`](./pgnCatalog.ts)).
 *
 * ## An upload is a file, and nothing more
 *
 * It goes through **the same loader** as a shipped file, with the same manifest
 * mechanism (`under: "uploads"`), so it gets everything for free: a study
 * becomes a folder of chapters, a multi-study export becomes a collection with
 * its own index screen, a chess.com export becomes a folder of games, and each
 * is *recognised* rather than declared (`lib/pgnKind.ts`). Uploading a lichess
 * study is exactly as expressive as shipping one.
 *
 * ## Where it lives, and what that costs
 *
 * `localStorage`, under one key, as JSON. That is a deliberate ceiling: it is
 * per-browser and per-origin, it holds a few megabytes, and it is not a
 * synchronisation story — the notes below the button say so, because a reader
 * who uploads a study they care about should know it is not backed up.
 * Everything here is non-throwing for the same reason the catalog loaders are:
 * a corrupt entry, a private-mode `localStorage` that throws on read, a quota
 * that is full — none of them may take the section down.
 *
 * The module is split the way the rest of the section is: the **pure** half
 * (what an upload is, how it becomes a library, whether a file is worth
 * keeping) is here and is tested as a value; the storage half is
 * [`pgnUploadStore.ts`](./pgnUploadStore.ts); the React binding is
 * `views/pgn/useUploads.ts`, because a hook does not belong in `src/lib/`.
 */

/** One uploaded file. `name` is its file name and its identity. */
export type PgnUpload = {
  name: string;
  /** The PGN text, exactly as the file had it. */
  text: string;
  /** ISO 8601, for "added on" — a string so the whole store is plain JSON. */
  addedAt: string;
};

/** The category path of the Uploads folder, and its `pgn.json` `under` value. */
export const UPLOADS_PATH = "uploads";

/**
 * The Uploads folder's name is **chrome**, not content: the folder ships with
 * the app and is there before any file is, so it takes a locale key like the
 * authored sections do — unlike the folders inside it, which are named from the
 * files the reader picked.
 */
export const UPLOADS_LABEL_KEY = "userPgns.uploads.title";

/** What is wrong with a file the reader picked. The screen names each one. */
export type UploadProblem = "empty" | "unreadable" | "too-large" | "storage";

/** Whether a file is worth keeping, and what it turned out to hold. */
export type UploadCheck =
  | { ok: true; games: number; kind: PgnKind }
  | { ok: false; problem: UploadProblem; detail?: string };

/**
 * The most one upload may be, in characters of PGN text.
 *
 * `localStorage` is a few megabytes for the whole origin, shared with anything
 * else the app keeps there, and a rejected file with a reason is a better
 * outcome than a quota error halfway through a write. The shipped
 * twenty-eight-study export is ~138 KB, so this is roughly twenty of those.
 */
export const MAX_UPLOAD_CHARS = 3_000_000;

/**
 * Read a picked file the way the library will read it, before storing it.
 *
 * The check *is* the load: a file is worth keeping if `loadPgnLibrary` gets at
 * least one game out of it, and the same call says what kind of thing it is, so
 * the screen can tell the reader they uploaded a collection of twenty-eight
 * studies rather than just "a file".
 */
export const checkUploadPgn = (name: string, text: string): UploadCheck => {
  if (text.trim() === "") return { ok: false, problem: "empty" };
  if (text.length > MAX_UPLOAD_CHARS) return { ok: false, problem: "too-large" };

  const library = loadPgnLibrary({ [name]: text });
  const [category] = library.categories;

  if (category === undefined || library.items.length === 0) {
    return {
      ok: false,
      problem: "unreadable",
      ...(library.problems[0] !== undefined ? { detail: library.problems[0] } : {}),
    };
  }

  return {
    ok: true,
    games: library.items.length,
    kind: library.kinds[category.path] ?? "games",
  };
};

/**
 * The category path the file `name` becomes — `uploads/<slug of its stem>`.
 *
 * The loader derives that path from the file name, and this has to agree with
 * it or the Uploads screen would link a row to a folder that is not there. It
 * is built from the loader's own `slugify` rather than from a second copy of
 * the rule, and `pgnUploads.test.ts` asserts the two stay in step for the
 * awkward names (spaces, punctuation, a name with no ASCII in it at all).
 */
export const uploadFolderPath = (name: string): string => {
  const stem = name.replace(/\.pgn$/i, "");
  return `${UPLOADS_PATH}/${slugify(stem) || slugify(name)}`;
};

/**
 * The uploads as a library: one folder per file under the Uploads root, built
 * by the shipped loader and merged into the catalog by `userPgnsLibrary()`.
 *
 * The root category is assembled here rather than left to the manifest, because
 * it has to exist **even with no uploads at all** — it is a place to put files,
 * so it is there before there are any — and because it carries a locale key,
 * which the manifest has no way to express.
 */
export const uploadsLibraryOf = (uploads: readonly PgnUpload[]): PgnLibrary => {
  const files: Record<string, string> = {};
  const manifestFiles: Record<string, { under: string; order: number }> = {};

  uploads.forEach((upload, index) => {
    files[upload.name] = upload.text;
    // Stored order is what the reader sees, newest first; `order` is what makes
    // the sidebar and the screens agree on it.
    manifestFiles[upload.name] = { under: UPLOADS_PATH, order: index };
  });

  const built = loadPgnLibrary(files, { files: manifestFiles });
  const root = built.categories.find((category) => category.path === UPLOADS_PATH);

  const category: LibraryCategory = {
    id: UPLOADS_PATH,
    path: UPLOADS_PATH,
    labelKey: UPLOADS_LABEL_KEY,
    children: root?.children ?? [],
  };

  const kinds: PgnKinds = { ...built.kinds, [UPLOADS_PATH]: "uploads" };

  return { ...libraryCatalogOf([category], built.items, built.problems), kinds };
};

/**
 * The shipped library with the uploads folded in — one catalog, so every screen,
 * the splat route, the sidebar generator and the `?game=` references treat an
 * uploaded chapter exactly as they treat a shipped one.
 *
 * Uploads come **last**, so the reader's folder sits under the files the app
 * ships rather than in the middle of them, and a path can never collide: every
 * uploaded folder is under `uploads/`.
 */
export const mergePgnLibraries = (
  shipped: PgnLibrary,
  uploads: PgnLibrary,
): PgnLibrary => ({
  ...libraryCatalogOf(
    [...shipped.categories, ...uploads.categories],
    [...shipped.items, ...uploads.items],
    [...shipped.problems, ...uploads.problems],
  ),
  kinds: { ...shipped.kinds, ...uploads.kinds },
});
