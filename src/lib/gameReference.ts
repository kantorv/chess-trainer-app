import { findCatalogGame, type CatalogGame } from "./gameCatalog";
import { playedGamesCatalog } from "./playedGameStore";
import { findSavedAnalysisGame } from "./savedAnalysisStore";

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
 * Which store a reference's first segment names, as the resolver of the rest
 * of it (`<path>/<id>`). *Called* rather than held, because the stores change
 * while the app runs and a game saved a moment ago has to be as referenceable
 * as an old one. The played games memoise their whole catalog on their
 * snapshot; the saved analyses — thousands of records since CTA-77, in
 * IndexedDB — parse only the one named, out of what has been read (so the
 * Analysis Board waits for that read before it resolves one).
 */
const catalogsByKey: Record<string, (segments: readonly string[]) => CatalogGame | undefined> = {
  [ANALYSIS_REFERENCE_KEY]: findSavedAnalysisGame,
  [PLAY_REFERENCE_KEY]: (segments) => findCatalogGame(segments, playedGamesCatalog()),
};

const referenceSegments = (reference: string): string[] =>
  reference.split("/").filter(Boolean);

/**
 * Whether a reference names the saved analyses — the one store read
 * asynchronously, which a screen resolving it has to wait for.
 */
export const isAnalysisReference = (reference: string | null | undefined): boolean =>
  reference !== null &&
  reference !== undefined &&
  referenceSegments(reference)[0] === ANALYSIS_REFERENCE_KEY;

/**
 * The game a reference names, or `undefined` for anything that does not
 * resolve — an unknown key, a path the store does not have, a missing id.
 */
export const resolveGameReference = (
  reference: string | null | undefined,
): CatalogGame | undefined => {
  if (reference === null || reference === undefined) return undefined;

  const [sectionKey, ...rest] = referenceSegments(reference);
  if (sectionKey === undefined || rest.length === 0) return undefined;

  const resolve = catalogsByKey[sectionKey];
  return resolve === undefined ? undefined : resolve(rest);
};
