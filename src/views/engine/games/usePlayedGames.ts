import { useSyncExternalStore } from "react";

import { playedGamesSnapshot, subscribePlayedGames } from "../../../lib/playedGameStore";
import type { PlayedGame } from "../../../lib/playedGames";

/**
 * Play with Engine's games as React state (CTA-74) — the whole of the binding
 * between [`lib/playedGameStore.ts`](../../../lib/playedGameStore.ts) and the
 * list. **`undefined` while the store's first read is out** (IndexedDB — a
 * read is a promise); subscribing starts it, and every later visit renders
 * the kept list on its first frame.
 *
 * `useSyncExternalStore` rather than a context or a `useState` copy: the store
 * is shared with the other tabs and written from plain functions called out
 * of an effect on a different screen, so React has to *read* it rather than
 * own it. The store returns the same array until a write changes it, which is
 * the identity requirement this hook is built on. A hook, so `src/lib/` stays
 * free of React.
 */
export const usePlayedGames = (): readonly PlayedGame[] | undefined =>
  useSyncExternalStore(subscribePlayedGames, playedGamesSnapshot, playedGamesSnapshot);
