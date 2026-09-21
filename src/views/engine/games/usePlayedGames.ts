import { useSyncExternalStore } from "react";

import { playedGamesSnapshot, subscribePlayedGames } from "../../../lib/playedGameStore";
import type { PlayedGame } from "../../../lib/playedGames";

/**
 * Play with Engine's games as React state (CTA-74) — the whole of the binding
 * between [`lib/playedGameStore.ts`](../../../lib/playedGameStore.ts) and the
 * list.
 *
 * `useSyncExternalStore` rather than a context or a `useState` copy: the store
 * is `localStorage`, shared with the other tabs and written from plain
 * functions called out of an effect on a different screen, so React has to
 * *read* it rather than own it. The store returns the same array until its
 * stored text changes, which is the identity requirement this hook is built
 * on. A hook, so `src/lib/` stays free of React.
 */
export const usePlayedGames = (): readonly PlayedGame[] =>
  useSyncExternalStore(subscribePlayedGames, playedGamesSnapshot, playedGamesSnapshot);
