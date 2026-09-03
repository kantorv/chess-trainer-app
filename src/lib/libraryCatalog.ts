import type { AppLanguage } from "../i18n";
import { FenParseError, parseFen } from "./fen";
import { TreeManager } from "./treeManager";

/**
 * A **position library**, as data — the layer under both the Mates section and
 * the Positions section.
 *
 * A library is a tree of categories with a flat list of positions hanging off
 * it, and a JSON file is the only thing an extension touches: adding a
 * category *at any depth*, or a position inside one, is an entry in that file
 * and nothing else — no TypeScript, no locale key, no component edit.
 *
 * Three rules the shape rests on, two of them inherited from the Mates catalog
 * this generalises:
 *
 * - **A category id is data, not a type.** Narrowing it to the shipped ids
 *   would make a new category a code edit, which is exactly what the JSON
 *   exists to avoid — and the ids arrive from a route parameter anyway, where
 *   the compiler has nothing to say about them. What *is* checked is that a
 *   position names a category the catalog declares.
 * - **A malformed entry is reported, never thrown.** A bad FEN, a missing name,
 *   a category with no label: the row is dropped and named in `problems`, and
 *   the rest of the library still loads. A screen that cannot render one card
 *   must not take the other five down with it, and a `throw` at module scope
 *   would take the whole app down.
 * - **A category is addressed by its full path**, `"queen-vs-rook/rosettes"`,
 *   and a position by that path plus its id. One splat route then serves every
 *   depth (`resolveLibraryPath` below), so the route table never learns how
 *   deep the data goes. A one-level library — Mates — is the same shape with
 *   every path a single segment, which is why `mates.json` needed no edit.
 *
 * **A label is either chrome or content, and a category says which.** `labelKey`
 * names an `src/locales` key, for a section whose category names ship with the
 * app (Mates, whose keys were already written). `label` is a per-language
 * `{ en, he }` on the entry, for a section whose categories are content the
 * data owns (Positions) — the case that must not require a locale edit. Exactly
 * one of the two; `categoryLabel` reads whichever is there.
 *
 * What deliberately does **not** live here: the Mates rule that the mating side
 * is to move in every entry. That is asserted in `matesCatalog.test.ts` and is
 * true of mates only — Philidor's rook defense, Vancura, the short-side defense
 * and the trebuchet are positions in which the side to move is the *defender*,
 * and a library of them could not ship under an attacker-to-move rule.
 */

/** A category id, or a `"/"`-joined path of them. A string, deliberately. */
export type LibraryCategoryId = string;

/**
 * A per-language string carried by the data. `en` is required and is what every
 * other language falls back to, so a half-translated entry renders in English
 * rather than blank.
 */
export type LocalizedText = { en: string } & Partial<Record<AppLanguage, string>>;

/** One category, with its sub-categories. */
export type LibraryCategory = {
  id: LibraryCategoryId;
  /** The full path from a root, `"/"`-joined — what the URL addresses it by. */
  path: string;
  /** i18n key, for a section whose category names are chrome. */
  labelKey?: string;
  /** Per-language label, for a section whose category names are content. */
  label?: LocalizedText;
  /** Sub-categories, in the order the data lists them. Never `undefined`. */
  children: readonly LibraryCategory[];
};

/** One position. `fen` has been through `parseFen`; `category` is a full path. */
export type LibraryPosition = {
  id: string;
  category: LibraryCategoryId;
  fen: string;
  name: LocalizedText;
  description?: LocalizedText;
};

/**
 * A loaded library. `categories` are the roots; `problems` is English and
 * diagnostic — what the data file got wrong, for a developer and for the tests,
 * not a string to render at a reader.
 */
export type LibraryCatalog = {
  categories: readonly LibraryCategory[];
  positions: readonly LibraryPosition[];
  problems: readonly string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/**
 * A `LocalizedText` if it has at least a non-empty `en`, `undefined` otherwise.
 * Other languages are kept only when they are non-empty strings, so a `"he": ""`
 * left behind in the data falls back to English rather than rendering nothing.
 */
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
 * Validate raw JSON into a library. Never throws: everything it rejects comes
 * back in `problems`, and what survives is safe for a screen to render.
 *
 * Takes the raw data as a parameter rather than reading an import, so the tests
 * can feed it deliberately broken catalogs.
 */
export const loadLibraryCatalog = (raw: unknown): LibraryCatalog => {
  const problems: string[] = [];

  if (!isRecord(raw)) {
    return { categories: [], positions: [], problems: ["Catalog is not an object."] };
  }

  /*
    Every category by path, filled in as the tree is walked. It is what a
    position's `category` is checked against and what `findLibraryCategory`
    reads — a lookup rather than a search, since a nested library is walked far
    more often than it is loaded.
  */
  const byPath = new Map<string, LibraryCategory>();

  const readCategories = (
    entries: unknown,
    parentPath: string,
  ): LibraryCategory[] => {
    // A category with no `children` key is a leaf, and says nothing wrong. The
    // *root* list is not optional in the same way: a file with no `categories`
    // at all is a broken catalog, and falls through to the report below.
    if (entries === undefined && parentPath !== "") return [];
    if (!Array.isArray(entries)) {
      problems.push(
        parentPath === ""
          ? "Catalog has no `categories` array."
          : `Category "${parentPath}": \`children\` is not an array.`,
      );
      return [];
    }

    const here: LibraryCategory[] = [];

    entries.forEach((entry, index) => {
      const where = parentPath === "" ? `${index}` : `${parentPath}[${index}]`;
      if (!isRecord(entry) || !nonEmptyString(entry.id)) {
        problems.push(`Category ${where}: missing an id.`);
        return;
      }
      const path = parentPath === "" ? entry.id : `${parentPath}/${entry.id}`;

      const label = localizedTextOf(entry.label);
      if (!nonEmptyString(entry.labelKey) && label === undefined) {
        problems.push(`Category "${path}": missing a labelKey or an English label.`);
        return;
      }
      if (byPath.has(path)) {
        problems.push(`Category "${path}": duplicate id.`);
        return;
      }

      /*
        Registered before its children are read, so a duplicate deeper down is
        reported against a parent that already exists — and so a sub-category
        can never be reached by a path whose parent was dropped.
      */
      const category: LibraryCategory = {
        id: entry.id,
        path,
        ...(nonEmptyString(entry.labelKey) ? { labelKey: entry.labelKey } : {}),
        ...(label ? { label } : {}),
        children: [],
      };
      byPath.set(path, category);
      category.children = readCategories(entry.children, path);
      here.push(category);
    });

    return here;
  };

  const categories = readCategories(raw.categories, "");

  const positions: LibraryPosition[] = [];
  const seenPositions = new Set<string>();

  if (!Array.isArray(raw.positions)) {
    problems.push("Catalog has no `positions` array.");
  } else {
    raw.positions.forEach((entry, index) => {
      if (!isRecord(entry) || !nonEmptyString(entry.id)) {
        problems.push(`Position ${index}: missing an id.`);
        return;
      }
      const id = entry.id;

      if (seenPositions.has(id)) {
        problems.push(`Position "${id}": duplicate id.`);
        return;
      }
      if (!nonEmptyString(entry.category) || !byPath.has(entry.category)) {
        problems.push(`Position "${id}": unknown category.`);
        return;
      }
      const name = localizedTextOf(entry.name);
      if (name === undefined) {
        problems.push(`Position "${id}": missing an English name.`);
        return;
      }
      if (!nonEmptyString(entry.fen)) {
        problems.push(`Position "${id}": missing a FEN.`);
        return;
      }

      /*
        The same gate every other way into a position goes through — a catalog
        entry is a claim about a finished position exactly as a pasted FEN is,
        so it is validated on the way in rather than trusted because it shipped
        with the app.
      */
      let fen: string;
      try {
        fen = parseFen(entry.fen);
      } catch (cause) {
        problems.push(
          `Position "${id}": invalid FEN — ${
            cause instanceof FenParseError ? cause.detail : String(cause)
          }`,
        );
        return;
      }

      seenPositions.add(id);
      const description = localizedTextOf(entry.description);
      positions.push({
        id,
        category: entry.category,
        fen,
        name,
        ...(description ? { description } : {}),
      });
    });
  }

  return { categories, positions, problems };
};

/**
 * Every category in the library, depth-first, parent before children — through
 * `TreeManager`, which is this project's one place a tree walk is written.
 */
export const allCategories = (
  catalog: LibraryCatalog,
): readonly LibraryCategory[] =>
  new TreeManager<LibraryCategory>(catalog.categories).toArray();

/**
 * The category at this path, or `undefined` — an unknown path from a URL. A
 * single segment addresses a root category, which is what makes a flat library
 * (Mates) a special case of this one rather than a second shape.
 */
export const findLibraryCategory = (
  path: string | undefined,
  catalog: LibraryCatalog,
): LibraryCategory | undefined =>
  path === undefined
    ? undefined
    : allCategories(catalog).find((category) => category.path === path);

/**
 * That category's own positions, in the order the data lists them. A
 * sub-category's positions are its own — they do not roll up into the parent's
 * list, or a top-level category would show everything beneath it twice.
 */
export const positionsInLibraryCategory = (
  path: string | undefined,
  catalog: LibraryCatalog,
): readonly LibraryPosition[] =>
  path === undefined
    ? []
    : catalog.positions.filter((position) => position.category === path);

/**
 * One position, addressed the way the URL addresses it. Both parts have to
 * match: a real id asked for under a category it is not in is a miss rather
 * than a redirect.
 */
export const findLibraryPosition = (
  categoryPath: string | undefined,
  id: string | undefined,
  catalog: LibraryCatalog,
): LibraryPosition | undefined =>
  categoryPath === undefined || id === undefined
    ? undefined
    : catalog.positions.find(
        (position) => position.category === categoryPath && position.id === id,
      );

/** Where a URL landed. The four cases a library screen has to render. */
export type LibraryLocation =
  | { kind: "category"; category: LibraryCategory }
  | { kind: "position"; category: LibraryCategory; position: LibraryPosition }
  | { kind: "unknown-category" }
  | { kind: "unknown-position"; category: LibraryCategory };

/**
 * Resolve the URL segments under a section's base — `["queen-vs-rook",
 * "rosettes"]`, or `["basic", "back-rank"]` — into a category and, when one is
 * named, a position.
 *
 * **Longest category prefix wins.** The segments are matched against the
 * category tree from the longest prefix down, and whatever is left over (at
 * most one segment) is a position id. That is what lets a single splat route
 * serve a library nested to any depth: the router never has to know whether
 * `.../rosettes` is a sub-category or a position, because the data does. A
 * category and a position of the same name in the same place resolve to the
 * category — an ambiguity the data can simply avoid.
 */
export const resolveLibraryPath = (
  segments: readonly string[],
  catalog: LibraryCatalog,
): LibraryLocation => {
  for (let taken = segments.length; taken > 0; taken -= 1) {
    const category = findLibraryCategory(segments.slice(0, taken).join("/"), catalog);
    if (category === undefined) continue;

    const rest = segments.slice(taken);
    if (rest.length === 0) return { kind: "category", category };
    if (rest.length > 1) return { kind: "unknown-position", category };

    const position = findLibraryPosition(category.path, rest[0], catalog);
    return position === undefined
      ? { kind: "unknown-position", category }
      : { kind: "position", category, position };
  }

  return { kind: "unknown-category" };
};

/** The active language's text, falling back to English. */
export const localizedText = (
  text: LocalizedText | undefined,
  language: AppLanguage,
): string => (text === undefined ? "" : (text[language] ?? text.en));

/**
 * A category's name, from wherever that section keeps it: an `src/locales` key
 * for chrome the app ships, the entry's own `{ en, he }` for content the data
 * owns. The one place the two are told apart, so no screen has to.
 */
export const categoryLabel = (
  category: LibraryCategory | undefined,
  translate: (key: string) => string,
  language: AppLanguage,
): string => {
  if (category === undefined) return "";
  return category.labelKey !== undefined
    ? translate(category.labelKey)
    : localizedText(category.label, language);
};

/**
 * The side to move, read off the FEN's second field.
 *
 * Load-bearing rather than cosmetic: `/engine/play` derives `playAs` and the
 * board orientation from an incoming position's side to move, and every library
 * screen faces its board the same way. Read here rather than by constructing a
 * `chess.js`, which `parseFen` has already done on the way in.
 */
export const sideToMoveOf = (position: LibraryPosition): "w" | "b" =>
  position.fen.split(" ")[1] === "b" ? "b" : "w";
