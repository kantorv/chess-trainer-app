import { useEffect, useState } from "react";

import {
  getPositionBook,
  loadOpeningBook,
  type OpeningBook,
  type PositionBook,
} from "../../lib/openings";

/**
 * The opening book, for the line under a saved list's cards — loaded lazily
 * and shared, because the book is the same ~3MB of JSON for all three saved
 * screens: `loadOpeningBook` caches its promise, so a reader who has already
 * opened a game screen pays nothing here, and one who never opens a saved
 * screen never downloads it. Until it resolves the state is `null`, and the
 * cards simply carry no opening line — where `CurrentOpening` says "loading",
 * because there it is the whole point of the line and here it is a fourth fact
 * on a card.
 *
 * This is the one effect all three screens ran identically, extracted; what
 * each screen still does *with* the book is its own: which line each record
 * walks (`openingOfLine` over the whole game, or over the mainline of a tree)
 * is a per-screen choice, memoised against the stable snapshot this returns.
 */
export const useOpeningBook = (): {
  book: OpeningBook;
  positions: PositionBook;
} | null => {
  const [loaded, setLoaded] = useState<{
    book: OpeningBook;
    positions: PositionBook;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOpeningBook().then((book) => {
      if (!cancelled) setLoaded({ book, positions: getPositionBook(book) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return loaded;
};
