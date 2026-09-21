import { useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import type { GameTree } from "../../lib/gameTree";
import { parsePgnTree } from "../../lib/pgn";
import LibraryGameBoard from "./LibraryGameBoard";
import LibraryMiss from "./LibraryMiss";
import { useCollection } from "./useLibraryCollections";

/**
 * The route of one Library game — `/library/<collection>/<game>`, the game its
 * 1-based number: the collection resolved (a shipped file fetched on first
 * use), the game parsed **with its side lines** (`parsePgnTree` — `chess.js`
 * `loadPgn` would drop them), then the board. A number the collection does not
 * have is the miss; a game that will not parse says so, with the way back.
 *
 * The board is keyed by collection and number, so the previous / next game
 * mounts a fresh session rather than re-seeding one — every arrival option of
 * the core is read on its first render only.
 */
function LibraryGameScreen() {
  const { collectionId, game } = useParams();
  const { t } = useTranslation();
  const state = useCollection(collectionId);

  const number = /^\d+$/.test(game ?? "") ? Number(game) : NaN;
  const pgn =
    state.status === "ready" && number >= 1 ? state.collection.games[number - 1] : undefined;
  const tree = useMemo((): GameTree | null | undefined => {
    if (pgn === undefined) return undefined;
    try {
      return parsePgnTree(pgn);
    } catch {
      return null;
    }
  }, [pgn]);

  if (state.status === "loading") {
    return (
      <Typography data-testid="library-loading" sx={{ color: "text.secondary", p: 2 }}>
        {t("library.table.loading")}
      </Typography>
    );
  }
  if (state.status === "missing") return <LibraryMiss what="collection" />;
  if (tree === undefined) return <LibraryMiss what="game" />;
  if (tree === null) {
    return (
      <Box data-testid="library-game-unreadable" sx={{ p: 2, display: "grid", gap: 2, justifyItems: "start" }}>
        <Typography>{t("library.game.unreadable")}</Typography>
        <Button
          variant="outlined"
          component={RouterLink}
          to={`/library/${encodeURIComponent(state.collection.id)}`}
        >
          {t("library.game.back", { name: state.collection.name })}
        </Button>
      </Box>
    );
  }
  return (
    <LibraryGameBoard
      key={`${state.collection.id}/${number}`}
      collection={state.collection}
      number={number}
      tree={tree}
    />
  );
}

export default LibraryGameScreen;
