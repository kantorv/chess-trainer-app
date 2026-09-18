import { useParams } from "react-router";

import { isRepertoireGameId } from "../../lib/repertoireGames";
import { isMultiGameRepertoire } from "../../lib/savedRepertoires";
import { MissingRepertoire, MultiGameRepertoire } from "./RepertoireBoard";
import RepertoirePlayer from "./RepertoirePlayer";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **A repertoire game** (`/repertoires/<id>/games/<game>`, CTA-63) — the
 * route: the record and the game resolved, then the player with that game
 * (`RepertoirePlayer.tsx`; the games are `lib/repertoireGames.ts`). An id this
 * browser does not hold, or a game there is no such thing as, is the same
 * miss the repertoire's own view shows; a record from before the one-game rule
 * gets its merge-or-split choice first, as there.
 */
function RepertoireGame() {
  const { id, game } = useParams();
  const repertoires = useSavedRepertoires();
  const saved = repertoires.find((row) => row.id === id);

  if (saved === undefined || !isRepertoireGameId(game)) return <MissingRepertoire />;
  if (isMultiGameRepertoire(saved)) {
    return <MultiGameRepertoire key={saved.id} saved={saved} />;
  }
  // Keyed on both: another repertoire, or another game, is a fresh session.
  return <RepertoirePlayer key={`${saved.id}/${game}`} saved={saved} game={game} />;
}

export default RepertoireGame;
