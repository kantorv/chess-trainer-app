import type { AppLanguage } from "../../i18n";
import { gameTag } from "../../lib/gameModel";
import {
  localizedText,
  type LibraryCategory,
  type LibraryItem,
} from "../../lib/libraryCatalog";
import { gameSummaryOf } from "./gameSummary";

/**
 * Filtering a category's cards by what the reader types — the list screen's
 * name search.
 *
 * Pure, and separate from the component that renders the box, for the same
 * reason `gameSummary.ts` is: what a card is *findable by* is a question about
 * data, and it is the part worth asserting. `LibraryList` keeps the input, the
 * state and the layout; this module answers "does this item match?".
 *
 * Two rules the whole thing rests on:
 *
 * - **You can find a card by what it says.** The haystack is the text the card
 *   already renders — its name, and for a game the lines `gameSummaryOf`
 *   derives — so a search that matches nothing visible never hides a card, and
 *   a card the reader can see the words on is always reachable. The two
 *   exceptions are deliberate: a game's `White` and `Black` tags are searchable
 *   even when the footer never prints them, because a lichess chapter is named
 *   `"Chapter 3"` and the players are exactly what someone looks it up by; and
 *   the item's description, which the detail page shows and the card does not.
 * - **The kind is not a branch here.** `searchTextOf` folds a position and a
 *   game into one string, so `LibraryList` filters one list and stays the grid
 *   of cards it was — the screen's one branch on the item kind is still
 *   `LibraryCardFooter`, as the section's design says.
 *
 * Matching is case-insensitive, and every whitespace-separated token has to
 * appear somewhere in the item's text: `"capablanca 1924"` finds the game
 * whichever order the two facts are written in, which a single-substring match
 * would not.
 */

/** The whitespace-separated tokens of a query, lowercased. Empty = no filter. */
const tokensOf = (query: string): readonly string[] =>
  query.trim().toLowerCase().split(/\s+/).filter((token) => token !== "");

/**
 * Everything one item is findable by, lowercased and run together — see the
 * two rules above. Exported for the tests, which assert what is in it rather
 * than probing the filter one query at a time.
 */
export const searchTextOf = (
  item: LibraryItem,
  language: AppLanguage,
): string => {
  const name = localizedText(item.name, language);
  const parts: readonly (string | undefined)[] =
    item.kind === "position"
      ? [name, localizedText(item.description, language)]
      : (() => {
          const summary = gameSummaryOf(item.game, name);
          return [
            name,
            localizedText(item.description, language),
            summary.result,
            summary.occasion,
            summary.opening,
            summary.eco,
            gameTag(item.game.headers, "White"),
            gameTag(item.game.headers, "Black"),
          ];
        })();

  return parts
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ")
    .toLowerCase();
};

/**
 * The items a query leaves on screen, in the order the catalog listed them.
 *
 * An empty or whitespace-only query returns the list **by reference**, so
 * clearing the box costs no work and restores exactly what was there.
 */
export const filterLibraryItems = (
  items: readonly LibraryItem[],
  query: string,
  language: AppLanguage,
): readonly LibraryItem[] => {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return items;

  return items.filter((item) => {
    const text = searchTextOf(item, language);
    return tokens.every((token) => text.includes(token));
  });
};

/**
 * The same filter over a category's **sub-folders**, which the list screen shows
 * as cards alongside its items — a file of twenty-eight studies is a folder the
 * reader searches exactly as they search a folder of chapters.
 *
 * A folder is findable by its name and by nothing else: that is all its card
 * prints, and the rule above ("you can find a card by what it says") is what
 * keeps a search from hiding something for reasons the screen never showed. The
 * name arrives already resolved, because a category keeps it as a locale key or
 * as `{ en, he }` and `categoryLabel` is the one place those are told apart.
 */
export const filterLibraryCategories = (
  categories: readonly LibraryCategory[],
  query: string,
  label: (category: LibraryCategory) => string,
): readonly LibraryCategory[] => {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return categories;

  return categories.filter((category) => {
    const text = label(category).toLowerCase();
    return tokens.every((token) => text.includes(token));
  });
};
