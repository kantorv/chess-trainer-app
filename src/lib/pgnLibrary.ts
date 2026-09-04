import { gameTag, type Game } from "./gameModel";
import {
  libraryCatalogOf,
  type LibraryCategory,
  type LibraryCatalog,
  type LibraryGame,
  type LocalizedText,
} from "./libraryCatalog";
import { PgnParseError, parsePgnGame, splitPgnGames } from "./pgn";

/**
 * The **User PGNs** library, built out of the `.pgn` files the project ships —
 * the second producer of a {@link LibraryCatalog}, next to `loadLibraryCatalog`.
 *
 * One file is one folder; each game inside it — a chess.com export, a lichess
 * study chapter — is one item. **Dropping a `.pgn` file into `src/data/pgn/` is
 * what adds content**: no TypeScript, no locale key, no component edit, no
 * route. The shipped binding that does the dropping is `lib/pgnCatalog.ts`; this
 * module is pure, takes its files as a parameter and knows nothing about Vite,
 * so the tests feed it text.
 *
 * ## A file holding several studies is a folder of folders
 *
 * Lichess exports *all* of an author's studies as one file, and such a file is
 * not one study with a lot of chapters — it is many studies whose chapters
 * happen to share a file. Flattened into one folder its chapter names collide
 * ("Chapter 1" fourteen times over) and the thing a reader is actually looking
 * for, the study, is not addressable at all.
 *
 * So **a file carrying more than one `StudyName` splits**: its folder becomes a
 * group, and each study in it becomes a sub-folder named from that tag, in the
 * order the file first mentions it. A file with one `StudyName` — every shipped
 * export today — is untouched, and so is one with none.
 *
 * That is deliberately *not* a fourth kind of screen. A category holding
 * sub-categories is what the library layer has always been (`positions.json`
 * nests, and the manifest's `under` already builds a group here), so the splat
 * route, the sidebar generator, the list screen and the `?game=` reference all
 * serve the deeper paths with no edit: `/pgn/<file>/<study>/<chapter>` is
 * `resolveLibraryPath` doing what it does for `/positions/queen-vs-rook/…`.
 * The one thing that did change is that a group's list screen now shows its
 * sub-folders (`views/library/LibraryList.tsx`), because a study you cannot
 * click is a folder that only the sidebar can reach.
 *
 * A game in a multi-study file with **no** `StudyName` stays in the file's own
 * folder, next to the study sub-folders rather than in a made-up one.
 *
 * ## Where a name comes from
 *
 * From the PGN itself, and never from `src/locales`:
 *
 * | Thing | Named from | Falling back to |
 * | --- | --- | --- |
 * | a folder | the manifest's `label`, else the file's `StudyName` tag | the file name, humanised |
 * | a study sub-folder | its `StudyName` tag | — (a file only splits on that tag) |
 * | a game | its `ChapterName` tag (a study) | `White – Black (Result)` (a game), else `Event`, else its number |
 *
 * A multi-study file has no single `StudyName` to be named from, so its own
 * folder falls to the manifest label or to the file name.
 *
 * ## The manifest is optional, and additive
 *
 * `src/data/pgn.json` may rename a folder, give it a Hebrew name, nest it under
 * a deeper path, or order it. It may not *hide* a file: **a `.pgn` with no
 * manifest entry still appears**, because the promise this section makes is that
 * dropping a file in is enough. A manifest entry naming a file that is not there
 * is a `problems` line, not a silent no-op.
 *
 * ## Nothing throws
 *
 * A game that will not parse, a file with no games at all, a manifest that is
 * not an object: each is a line in `problems` and the rest of the library still
 * loads. A broken file must not take the other folders — or the app, since this
 * runs at module scope — down with it.
 */

/** What the manifest may say about one file. Every field is optional. */
export type PgnManifestEntry = {
  /** A category path to nest this file's folder under — `"studies"`. */
  under?: string;
  /** The folder's name, overriding whatever the file would be named from. */
  label?: LocalizedText;
  /** Sort key among its siblings. Files without one sort last, by file name. */
  order?: number;
};

/** `src/data/pgn.json`, validated. */
export type PgnManifest = {
  /** Names for the intermediate folders `under` paths create, keyed by full path. */
  folders: Record<string, LocalizedText>;
  /** Per-file entries, keyed by file name (`"my_study.pgn"`). */
  files: Record<string, PgnManifestEntry>;
};

const EMPTY_MANIFEST: PgnManifest = { folders: {}, files: {} };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/** A `LocalizedText` if it has a non-empty `en`, `undefined` otherwise. */
const localizedTextOf = (value: unknown): LocalizedText | undefined => {
  if (!isRecord(value) || !nonEmptyString(value.en)) return undefined;

  const text: LocalizedText = { en: value.en };
  for (const [language, translation] of Object.entries(value)) {
    if (language !== "en" && nonEmptyString(translation)) {
      (text as Record<string, string>)[language] = translation;
    }
  }
  return text;
};

/**
 * A URL-safe id out of a human name. Anything that is not a letter or a digit
 * becomes a separator, so `"Chapter 1"` is `"chapter-1"` and
 * `"AlbertSimTL – lalala732"` is `"albertsimtl-lalala732"`.
 *
 * A name with no ASCII alphanumerics at all — a Hebrew chapter title — slugs to
 * the empty string, which the callers below answer with a numbered fallback
 * rather than with an unaddressable item.
 */
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The file name out of a glob key, which is a path. */
const baseNameOf = (path: string): string => path.split("/").pop() ?? path;

/** `"chess_com_games_2026-08-30.pgn"` → `"Chess com games 2026-08-30"`. */
const humanizeFileName = (fileName: string): string => {
  const stem = fileName.replace(/\.pgn$/i, "").replace(/[_]+/g, " ").trim();
  return stem === "" ? fileName : stem.charAt(0).toUpperCase() + stem.slice(1);
};

/** The last segment of a category path, humanised — an unlabelled folder's name. */
const humanizeSegment = (segment: string): string => {
  const words = segment.replace(/[-_]+/g, " ").trim();
  return words === "" ? segment : words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * What one game is called. A study chapter has a name of its own; a played game
 * is named by who played it and how it ended, which is what tells nine
 * chess.com games apart in a list. `gameTag` is what keeps the `"?"` placeholders
 * `chess.js` fills the seven-tag roster with out of the answer.
 */
export const gameDisplayName = (game: Game, gameNumber: number): string => {
  const chapter = gameTag(game.headers, "ChapterName");
  if (chapter !== undefined) return chapter;

  const white = gameTag(game.headers, "White");
  const black = gameTag(game.headers, "Black");
  if (white !== undefined || black !== undefined) {
    const players = `${white ?? "?"} – ${black ?? "?"}`;
    const result = gameTag(game.headers, "Result");
    return result === undefined ? players : `${players} (${result})`;
  }

  return gameTag(game.headers, "Event") ?? `Game ${gameNumber}`;
};

/** Validate the raw manifest. A malformed one is reported and then ignored. */
export const readPgnManifest = (
  raw: unknown,
  problems: string[],
): PgnManifest => {
  if (raw === undefined || raw === null) return EMPTY_MANIFEST;
  if (!isRecord(raw)) {
    problems.push("Manifest is not an object.");
    return EMPTY_MANIFEST;
  }

  const folders: Record<string, LocalizedText> = {};
  if (raw.folders !== undefined) {
    if (!isRecord(raw.folders)) {
      problems.push("Manifest `folders` is not an object.");
    } else {
      for (const [path, value] of Object.entries(raw.folders)) {
        const label = localizedTextOf(value);
        if (label === undefined) {
          problems.push(`Manifest folder "${path}": missing an English label.`);
          continue;
        }
        folders[path] = label;
      }
    }
  }

  const files: Record<string, PgnManifestEntry> = {};
  if (raw.files !== undefined) {
    if (!isRecord(raw.files)) {
      problems.push("Manifest `files` is not an object.");
    } else {
      for (const [fileName, value] of Object.entries(raw.files)) {
        if (!isRecord(value)) {
          problems.push(`Manifest file "${fileName}": entry is not an object.`);
          continue;
        }
        files[fileName] = {
          ...(nonEmptyString(value.under) ? { under: value.under.trim() } : {}),
          ...(localizedTextOf(value.label)
            ? { label: localizedTextOf(value.label) }
            : {}),
          ...(typeof value.order === "number" && Number.isFinite(value.order)
            ? { order: value.order }
            : {}),
        };
      }
    }
  }

  return { folders, files };
};

/**
 * A mutable category while the tree is being built. `children` is filled in
 * place, so a folder created for an `under` path can gain siblings later without
 * the tree being rebuilt.
 */
type Building = Omit<LibraryCategory, "children"> & {
  children: LibraryCategory[];
};

/** One game of a file, parsed, with its 1-based position in that file. */
type ParsedGame = { game: Game; pgn: string; number: number };

/**
 * The games of one file, grouped by their `StudyName` tag — the whole of the
 * multi-study rule, and pure so it can be read on its own.
 *
 * Groups come back in the order the file **first mentions** each study, which is
 * the order a lichess export writes them in and the only order the data offers;
 * a study's chapters keep their own order inside it. Games with no `StudyName`
 * share one untitled group, so a mixed file loses nothing.
 */
export const studyGroupsOf = (
  parsed: readonly ParsedGame[],
): { study?: string; games: ParsedGame[] }[] => {
  const byStudy = new Map<string, { study?: string; games: ParsedGame[] }>();

  for (const entry of parsed) {
    const study = gameTag(entry.game.headers, "StudyName");
    // `""` is the untitled group: a study cannot be named that, since `gameTag`
    // reports an empty tag as absent.
    const key = study ?? "";
    const group = byStudy.get(key);
    if (group === undefined) {
      byStudy.set(key, { ...(study !== undefined ? { study } : {}), games: [entry] });
    } else {
      group.games.push(entry);
    }
  }

  return [...byStudy.values()];
};

/**
 * Build the library from `path -> raw PGN text` and the optional manifest.
 *
 * Files are taken in manifest `order` (absent sorts last), then by file name, so
 * the sidebar and the list screens agree and neither depends on the order the
 * bundler happened to hand the glob back in.
 *
 * A file holding more than one `StudyName` becomes a folder of study
 * sub-folders — see {@link studyGroupsOf} and the note at the top of the file.
 */
export const loadPgnLibrary = (
  files: Record<string, string>,
  rawManifest?: unknown,
): LibraryCatalog => {
  const problems: string[] = [];
  const manifest = readPgnManifest(rawManifest, problems);

  const roots: Building[] = [];
  const byPath = new Map<string, Building>();

  /**
   * The folder at this path, created — with every ancestor it needs — if it is
   * not there yet. That is what makes `under: "studies/lichess"` a folder tree
   * rather than a path segment nobody declared.
   */
  const folderAt = (path: string, label?: LocalizedText): Building => {
    const existing = byPath.get(path);
    if (existing !== undefined) {
      // A file's own label wins over the placeholder an ancestor walk left.
      if (label !== undefined) existing.label = label;
      return existing;
    }

    const segments = path.split("/");
    const id = segments[segments.length - 1];
    const category: Building = {
      id,
      path,
      label: label ??
        manifest.folders[path] ?? { en: humanizeSegment(id) },
      children: [],
    };
    byPath.set(path, category);

    if (segments.length === 1) {
      roots.push(category);
    } else {
      folderAt(segments.slice(0, -1).join("/")).children.push(category);
    }
    return category;
  };

  for (const declared of Object.keys(manifest.files)) {
    if (!Object.keys(files).some((path) => baseNameOf(path) === declared)) {
      problems.push(`Manifest file "${declared}": no such file in the library.`);
    }
  }

  const ordered = Object.entries(files)
    .map(([path, text]) => {
      const fileName = baseNameOf(path);
      return { fileName, text, entry: manifest.files[fileName] };
    })
    .sort(
      (a, b) =>
        (a.entry?.order ?? Number.MAX_SAFE_INTEGER) -
          (b.entry?.order ?? Number.MAX_SAFE_INTEGER) ||
        a.fileName.localeCompare(b.fileName),
    );

  const items: LibraryGame[] = [];

  for (const { fileName, text, entry } of ordered) {
    const chunks = splitPgnGames(text);
    if (chunks.length === 0) {
      problems.push(`File "${fileName}": holds no games.`);
      continue;
    }

    /*
      Parsed before the folder is created. A file whose every game is broken
      gets no folder at all — an empty folder in the sidebar would be a promise
      of content the section cannot keep — but one broken game among nine costs
      only that game.
    */
    const parsed: ParsedGame[] = [];
    chunks.forEach((chunk, index) => {
      try {
        parsed.push({ game: parsePgnGame(chunk), pgn: chunk, number: index + 1 });
      } catch (cause) {
        problems.push(
          `File "${fileName}" game ${index + 1}: ${
            cause instanceof PgnParseError ? cause.detail : String(cause)
          }`,
        );
      }
    });

    if (parsed.length === 0) {
      problems.push(`File "${fileName}": no game in it could be read.`);
      continue;
    }

    const folderId = slugify(fileName.replace(/\.pgn$/i, "")) || slugify(fileName);
    const path =
      entry?.under !== undefined && entry.under !== ""
        ? `${entry.under}/${folderId}`
        : folderId;

    if (byPath.has(path)) {
      problems.push(`File "${fileName}": the folder path "${path}" is already taken.`);
      continue;
    }

    /**
     * File these games into one category. Ids are unique **within that
     * category**, which is what a URL addresses one by — so two studies in the
     * same file may both hold a `chapter-1`, exactly as two files may.
     */
    const addGames = (categoryPath: string, games: readonly ParsedGame[]) => {
      const seen = new Set<string>();
      for (const { game, pgn, number } of games) {
        const name = gameDisplayName(game, number);
        /*
          A slug can collide (two chess.com games between the same players) or be
          empty (a chapter title with no ASCII in it). The game's own number
          settles both, and it is what keeps the id stable: a name-derived id
          survives a game being inserted earlier in the file, which a purely
          positional one would not, and a bookmarked URL is the reason that
          matters.
        */
        const base = slugify(name) || "game";
        let id = seen.has(base) ? `${base}-${number}` : base;
        while (seen.has(id)) id = `${id}-${number}`;
        seen.add(id);

        items.push({
          kind: "game",
          id,
          category: categoryPath,
          pgn,
          game,
          name: { en: name },
        });
      }
    };

    const groups = studyGroupsOf(parsed);
    const studies = groups.filter((group) => group.study !== undefined);

    if (studies.length < 2) {
      // One study, or none: the file is one folder, as it has always been.
      const studyName = studies[0]?.study;
      folderAt(
        path,
        entry?.label ??
          (studyName !== undefined
            ? { en: studyName }
            : { en: humanizeFileName(fileName) }),
      );
      addGames(path, parsed);
      continue;
    }

    /*
      Several studies in one file. The file's own folder groups them and is
      named from the manifest or the file name — there is no single `StudyName`
      it could take, and taking the first study's would name the group after one
      of the things inside it.
    */
    folderAt(path, entry?.label ?? { en: humanizeFileName(fileName) });

    const takenSlugs = new Set<string>();
    groups.forEach((group, index) => {
      if (group.study === undefined) {
        // Chapters with no study of their own stay in the file's folder rather
        // than in a sub-folder invented to hold them.
        addGames(path, group.games);
        return;
      }

      // Same fallbacks a game id gets, for the same reasons: a Hebrew study
      // title slugs to nothing, and two studies can be named alike.
      const base = slugify(group.study) || `study-${index + 1}`;
      let slug = takenSlugs.has(base) ? `${base}-${index + 1}` : base;
      while (takenSlugs.has(slug)) slug = `${slug}-${index + 1}`;
      takenSlugs.add(slug);

      const studyPath = `${path}/${slug}`;
      folderAt(studyPath, { en: group.study });
      addGames(studyPath, group.games);
    });
  }

  return libraryCatalogOf(roots, items, problems);
};
