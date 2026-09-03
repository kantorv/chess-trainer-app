import type { AppLanguage } from "../i18n";
import { FenParseError, parseFen } from "./fen";
import rawCatalog from "../data/mates.json";

/**
 * The mates library, as data.
 *
 * `src/data/mates.json` is the only file an extension touches: adding a
 * position is an entry there and nothing else — no TypeScript, no locale key,
 * no component edit. This module is the single place that knows what that JSON
 * looks like, and everything above it (the list screen, the detail screen, the
 * tests) reads the catalog through here.
 *
 * Two rules the shape rests on:
 *
 * - **A category id is data, not a type.** `MateCategoryId` is a plain string
 *   alias on purpose. Narrowing it to a union of the three shipped ids would
 *   make a fourth category a code edit, which is exactly what the JSON exists to
 *   avoid — and the ids arrive from a route parameter anyway, where the
 *   compiler has nothing to say about them. What *is* checked is that a
 *   position's category is one the catalog declares (below), which is the
 *   honest version of the same guarantee.
 * - **A malformed entry is reported, never thrown.** A position with a bad FEN
 *   or a missing name is dropped and named in `problems`; the rest of the
 *   catalog still loads. A library screen that cannot render one card must not
 *   take the other five down with it, and a `throw` at module scope would take
 *   the whole app down.
 *
 * Names live here rather than in `src/locales`: `he` is typed `typeof en`, so a
 * catalog key is a two-file edit and a compile error until both are done. That
 * is right for chrome the app *ships* and wrong for content it *lists*. Only the
 * section's chrome — the folder and screen labels, the page titles, the button
 * labels — is in the locale catalogs; a position's name and description are
 * per-language fields on the entry, with an `en` fallback.
 */

/**
 * A category id — `"basic"`, `"advanced"`, `"complex"`, and whatever the data
 * declares next. A string, deliberately; see the note above.
 */
export type MateCategoryId = string;

/**
 * A per-language string carried by the data. `en` is required and is what every
 * other language falls back to, so a half-translated entry renders in English
 * rather than blank.
 */
export type LocalizedText = { en: string } & Partial<Record<AppLanguage, string>>;

/** A category: an id the routes and the entries use, and its chrome label key. */
export type MateCategory = {
  id: MateCategoryId;
  /** i18n key, not a label — the screens render `t(labelKey)`. */
  labelKey: string;
};

/** One position in the library. `fen` has been through `parseFen`. */
export type MatePosition = {
  id: string;
  category: MateCategoryId;
  fen: string;
  name: LocalizedText;
  description?: LocalizedText;
};

/**
 * A loaded catalog. `problems` is English and diagnostic — it is what the data
 * file got wrong, for a developer and for the tests, not a string to render at
 * a reader.
 */
export type MatesCatalog = {
  categories: readonly MateCategory[];
  positions: readonly MatePosition[];
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
 * Validate raw JSON into a catalog. Never throws: everything it rejects comes
 * back in `problems`, and what survives is safe for a screen to render.
 *
 * Takes the raw data as a parameter rather than reading the import, so the
 * tests can feed it deliberately broken catalogs.
 */
export const loadMatesCatalog = (raw: unknown): MatesCatalog => {
  const problems: string[] = [];

  if (!isRecord(raw)) {
    return { categories: [], positions: [], problems: ["Catalog is not an object."] };
  }

  const categories: MateCategory[] = [];
  const seenCategories = new Set<string>();

  if (!Array.isArray(raw.categories)) {
    problems.push("Catalog has no `categories` array.");
  } else {
    raw.categories.forEach((entry, index) => {
      if (!isRecord(entry) || !nonEmptyString(entry.id)) {
        problems.push(`Category ${index}: missing an id.`);
        return;
      }
      if (!nonEmptyString(entry.labelKey)) {
        problems.push(`Category "${entry.id}": missing a labelKey.`);
        return;
      }
      if (seenCategories.has(entry.id)) {
        problems.push(`Category "${entry.id}": duplicate id.`);
        return;
      }
      seenCategories.add(entry.id);
      categories.push({ id: entry.id, labelKey: entry.labelKey });
    });
  }

  const positions: MatePosition[] = [];
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
      if (!nonEmptyString(entry.category) || !seenCategories.has(entry.category)) {
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

/** The shipped catalog, loaded once. */
export const matesCatalog: MatesCatalog = loadMatesCatalog(rawCatalog);

/** The category with this id, or `undefined` — an unknown id from a URL. */
export const findMateCategory = (
  id: string | undefined,
  catalog: MatesCatalog = matesCatalog,
): MateCategory | undefined =>
  id === undefined ? undefined : catalog.categories.find((c) => c.id === id);

/** That category's positions, in the order the data lists them. */
export const positionsInCategory = (
  category: string | undefined,
  catalog: MatesCatalog = matesCatalog,
): readonly MatePosition[] =>
  category === undefined
    ? []
    : catalog.positions.filter((position) => position.category === category);

/**
 * One position, addressed the way the URL addresses it. Both parts have to
 * match: `/mates/basic/queen-vs-rook` names a position that exists, in a
 * category it is not in, and that is a miss rather than a redirect.
 */
export const findMatePosition = (
  category: string | undefined,
  id: string | undefined,
  catalog: MatesCatalog = matesCatalog,
): MatePosition | undefined =>
  category === undefined || id === undefined
    ? undefined
    : catalog.positions.find(
        (position) => position.category === category && position.id === id,
      );

/** The active language's text, falling back to English. */
export const localizedText = (
  text: LocalizedText | undefined,
  language: AppLanguage,
): string => (text === undefined ? "" : (text[language] ?? text.en));

/**
 * The side to move, read off the FEN's second field.
 *
 * Load-bearing rather than cosmetic: `/engine/play` derives `playAs` and the
 * board orientation from the incoming position's side to move, so every shipped
 * entry has the *mating* side to move — `matesCatalog.test.ts` asserts it over
 * the whole catalog. Read here rather than by constructing a `chess.js`, which
 * `parseFen` has already done on the way in.
 */
export const sideToMoveOf = (position: MatePosition): "w" | "b" =>
  position.fen.split(" ")[1] === "b" ? "b" : "w";
