import { findCatalogGame, type CatalogGame, type GameCatalog } from "./gameCatalog";
import { playedGamesCatalog } from "./playedGameStore";
import { savedAnalysesCatalog } from "./savedAnalysisStore";

/**
 * How a **whole game** crosses to the Analysis Board: `?game=<key>/<path>/<id>`.
 *
 * A FEN is short enough to put in a URL; a game is not — a played game
 * carries its side lines, an analysis its comments — so what travels is a
 * *reference into a store's catalog* (`lib/gameCatalog.ts`), and the
 * destination looks the game up for itself. It keeps everything the `?fen=`
 * hand-off is good for:
 *
 * - it is a **query parameter**, so the link survives being bookmarked, shared
 *   and reloaded, where router state would not;
 * - the destination **validates** it (an unknown reference resolves to
 *   `undefined` and is ignored, exactly as an unparsable FEN is) and takes the
 *   result as *initial* state, because arriving at the URL mounts the screen;
 * - it is **additive**: `?fen=` is untouched.
 *
 * The registry below is the single place a key meets its store, and it has
 * two entries: the reader's saved analyses (`lib/savedAnalyses.ts`) and their
 * games against the engine (`lib/playedGames.ts`, CTA-74). **A line in it is
 * the whole cost of a new producer of games.**
 *
 * The Library (CTA-75) is deliberately **not** in it: a Library game opens on
 * the Library's own analysis board (`/library/<collection>/<game>`), so it
 * never has to cross. The pre-CTA-75 `library/…` and `pgn/…` keys went with
 * the old Library; such a link resolves to nothing, and the board opens as if
 * `?game=` were not there.
 */

/** The section key the reader's saved analysis boards carry. */
export const ANALYSIS_REFERENCE_KEY = "analysis";

/** The section key Play with Engine's games carry (CTA-74). */
export const PLAY_REFERENCE_KEY = "play";

/**
 * Which catalog a reference's first segment names. *Called* rather than held,
 * because the stores change while the app runs and a game saved a moment ago
 * has to be as referenceable as an old one; each store memoises its catalog on
 * its own snapshot.
 */
const catalogsByKey: Record<string, () => GameCatalog> = {
  [ANALYSIS_REFERENCE_KEY]: savedAnalysesCatalog,
  [PLAY_REFERENCE_KEY]: playedGamesCatalog,
};

/**
 * The game a reference names, or `undefined` for anything that does not
 * resolve — an unknown key, a path the store does not have, a missing id.
 */
export const resolveGameReference = (
  reference: string | null | undefined,
): CatalogGame | undefined => {
  if (reference === null || reference === undefined) return undefined;

  const [sectionKey, ...rest] = reference.split("/").filter(Boolean);
  if (sectionKey === undefined || rest.length === 0) return undefined;

  const catalogOf = catalogsByKey[sectionKey];
  return catalogOf === undefined ? undefined : findCatalogGame(rest, catalogOf());
};
