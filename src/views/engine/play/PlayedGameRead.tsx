import type { ReactNode } from "react";
import Typography from "@mui/material/Typography";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { loadPlayedGames, playedGamesSnapshot } from "../../../lib/playedGameStore";
import { useStoreRead } from "../../shared/useStoreRead";

const isRead = () => playedGamesSnapshot() !== undefined;

/**
 * The play routes' wait: a `?saved=<id>` arrival names a played game, and the
 * games are IndexedDB's (`lib/playedGameStore.ts`) — so the route reads the
 * store before it mounts the screen, whose arrival (`arrivalOf`) is read once.
 * Without the wait, a reload of a game in progress would open a new game. An
 * arrival with no `?saved=` mounts at once.
 */
export function PlayedGameRead({ testId, children }: { testId: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const ready = useStoreRead(searchParams.get("saved") !== null, isRead, loadPlayedGames);
  if (!ready) {
    return (
      <Typography data-testid={`${testId}-loading`} sx={{ color: "text.secondary", p: 2 }}>
        {t("playedGames.loading")}
      </Typography>
    );
  }
  return children;
}
