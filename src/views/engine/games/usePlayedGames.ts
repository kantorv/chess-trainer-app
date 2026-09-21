import { useSyncExternalStore } from "react";

import { playedGamesSnapshot, subscribePlayedGames } from "../../../lib/playedGameStore";
import type { PlayedGame } from "../../../lib/playedGames";

/**
 * Play with Engine v2's games as React state (CTA-74) — the binding between
 * [`lib/playedGameStore.ts`](../../../lib/playedGameStore.ts) and the list,
 * `views/engine/saved/useSavedGames.ts` again: the store is `localStorage`,
 * written from an effect on another screen, so React reads it rather than
 * owning it.
 */
export const usePlayedGames = (): readonly PlayedGame[] =>
  useSyncExternalStore(subscribePlayedGames, playedGamesSnapshot, playedGamesSnapshot);
