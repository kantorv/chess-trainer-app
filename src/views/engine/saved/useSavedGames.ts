import { useSyncExternalStore } from "react";

import type { SavedGame } from "../../../lib/savedGames";
import {
  savedGamesSnapshot,
  subscribeSavedGames,
} from "../../../lib/savedGameStore";

/**
 * The reader's saved engine games, as React state — the whole of the binding
 * between [`lib/savedGameStore.ts`](../../../lib/savedGameStore.ts) and the
 * components.
 *
 * `useSyncExternalStore` rather than a context or a `useState` copy: the store
 * is `localStorage`, shared with the other tabs and written from plain functions
 * (`saveGame`, `removeSavedGame`) called out of an effect on a different screen.
 * React has to *read* it rather than own it. The store returns the same array
 * until its stored text changes, which is the identity requirement this hook is
 * built on — and what lets `savedGamesCatalog()` be memoised on it.
 *
 * A hook, so `src/lib/` stays free of React — the same line
 * `views/pgn/useUploads.ts` draws over the uploads store.
 */
export const useSavedGames = (): readonly SavedGame[] =>
  useSyncExternalStore(
    subscribeSavedGames,
    savedGamesSnapshot,
    savedGamesSnapshot,
  );
