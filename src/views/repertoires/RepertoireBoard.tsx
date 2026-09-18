import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import {
  isMultiGameRepertoire,
  readRepertoireText,
  type RepertoireReading,
  type SavedRepertoire,
} from "../../lib/savedRepertoires";
import RepertoireMergeSplit from "./RepertoireMergeSplit";
import RepertoirePlayer from "./RepertoirePlayer";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **A repertoire's own view** (`/repertoires/<id>`) — the route: it resolves
 * the record and hands it to the **player** (`RepertoirePlayer.tsx`, CTA-63),
 * the one screen the repertoire is read, tried, drilled (Autoplay) and — from
 * its Games menu — played on. The same file keeps the two things that are not
 * a board: the miss, and a record saved **before** the one-game rule, which
 * opens on the merge-or-split choice (`RepertoireMergeSplit`) rather than a
 * board, and is replaced by what the reader picks.
 *
 * Before CTA-63 this file was the read-only board; the player took its place
 * and everything it had (the opening line, the description, the settings
 * link, the next-moves bar, the engine), with the engine now off by default.
 */



function RepertoireBoard() {
  const { id } = useParams();
  const repertoires = useSavedRepertoires();
  const saved = repertoires.find((row) => row.id === id);

  if (saved === undefined) return <MissingRepertoire />;
  // Keyed, so opening another repertoire is a fresh screen rather than this
  // one's state carried over — the "every arrival is initial state" rule.
  if (isMultiGameRepertoire(saved)) {
    return <MultiGameRepertoire key={saved.id} saved={saved} />;
  }
  return <RepertoirePlayer key={saved.id} saved={saved} />;
}

/**
 * A record from before the one-game rule: read (after a paint — the Alapin
 * example is 310 games) and offered the merge-or-split choice in its place.
 */
export function MultiGameRepertoire({ saved }: { saved: SavedRepertoire }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reading, setReading] = useState<RepertoireReading | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setReading(readRepertoireText(saved.pgn)), 0);
    return () => clearTimeout(timer);
  }, [saved.pgn]);

  return (
    <Box data-testid="repertoire-board-multi" sx={{ height: "100%", overflowY: "auto" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {saved.name || t("repertoires.untitled")}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("repertoires.choice.legacy")}
      </Typography>
      {reading === null ? (
        <CircularProgress size={16} data-testid="repertoire-board-reading" />
      ) : reading.ok && reading.games.length > 1 ? (
        <RepertoireMergeSplit
          reading={reading}
          typedName={saved.name}
          replacing={saved.id}
          settings={saved.settings}
          onDone={(path) => navigate(path)}
        />
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("repertoires.detail.unreadable")}
        </Typography>
      )}
    </Box>
  );
}

/** An id this browser does not hold — the board's miss, and the play screen's. */
export function MissingRepertoire() {
  const { t } = useTranslation();
  return (
    <Box data-testid="repertoire-board-missing" sx={{ py: 4, textAlign: "center" }}>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("repertoires.detail.missing")}
      </Typography>
      <Button component={RouterLink} to="/repertoires" variant="outlined" size="small">
        {t("repertoires.detail.back")}
      </Button>
    </Box>
  );
}

export default RepertoireBoard;
