import type { CSSObject } from "@mui/material/styles";
import { cardSizeTrack, type CardSize } from "../library/cardSize";

/**
 * **The saved-list view machinery** — the pure half of what the three saved
 * screens share: [`views/engine/saved/SavedGames.tsx`](../engine/saved/SavedGames.tsx),
 * [`views/tools/analysis/saved/SavedAnalyses.tsx`](../tools/analysis/saved/SavedAnalyses.tsx)
 * and [`views/tools/openings/saved/SavedOpenings.tsx`](../tools/openings/saved/SavedOpenings.tsx)
 * all render the same two views (the list and the two board sizes) over the
 * same caption shape, and the parts of that that are *values* rather than
 * components live here — for the reason [`cardSize.ts`](../library/cardSize.ts)
 * gives: a component file that also exports values loses fast refresh.
 *
 * The component half — the view toggle, the export bar and the remove button —
 * are the three `SavedList*.tsx` files beside this one.
 */

/** The list, or one of the two board sizes — what all three screens show. */
export type SavedListView = "list" | CardSize;

/** What each screen opens on — the list, which is what every one shipped with. */
export const SAVED_LIST_DEFAULT_VIEW: SavedListView = "list";

/**
 * The board-view grid's styles. Identical in all three screens but for the
 * `cardSizeTrack` the pressed button chose, so the track is the one parameter.
 *
 * **`gridAutoRows: "max-content"` is the line that makes it scroll** — the same
 * trap `LibraryList` documents: an `auto` row inside a grid whose own height is
 * definite is stretched to share that height out, so the cards would be
 * squashed and clipped by `Card`'s own `overflow: hidden` and there would be no
 * overflow to scroll. Sized by their content, the rows overflow.
 */
export const savedListGridSx = (view: CardSize): CSSObject => ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  display: "grid",
  gridTemplateColumns: cardSizeTrack(view),
  gridAutoRows: "max-content",
  gap: 2,
  alignContent: "start",
  pt: 1.5,
});

/**
 * A record's `updatedAt` as the reader's own date, or `""` for one that does
 * not parse. `updatedAt` is stored as ISO so the record stays plain JSON, and
 * it is a date rather than notation, so it is the one caption fact formatted
 * for the reader rather than written the way PGN writes it — in the reader's
 * own language, which is what the `language` argument carries.
 */
export const savedListDate = (iso: string, language: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleDateString(language, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

/**
 * The secondary caption line: the facts that are there, joined. A record with
 * no readable game prints one sentence instead; a readable one drops the facts
 * it has nothing to say about — a finished game has no "in progress", an
 * opening with one line no "variations" — rather than rendering empty slots
 * between the separators.
 */
export const savedListLine = (parts: readonly string[]): string =>
  parts.filter((part) => part !== "").join(" · ");
