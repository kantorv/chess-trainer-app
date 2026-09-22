import { useCallback, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { DEFAULT_POSITION } from "chess.js";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import {
  DEFAULT_ENGINE_SETTINGS,
  uciOptionsOf,
  withClampedUciOptions,
  type EngineSettings as EngineSettingsValues,
} from "../../../lib/engineSettings";
import { newGameParams, type NewGameSide } from "../../../lib/newGameLink";
import { useEngineModule } from "../../dev/core/useEngineModule";
import EngineSettings from "../play/EngineSettings";

/**
 * **The Lobby's new-game form** (CTA-82) — the right-hand panel of
 * `/engine/games`: the reader's side (White, Black or Random) over the
 * in-game Engine tab itself (`EngineSettings`, not a copy of its controls),
 * and a full-width **Start** that opens `/engine/play` with the choice as
 * query parameters (`lib/newGameLink.ts`), which `arrivalOf` reads once.
 *
 * The form starts from `DEFAULT_ENGINE_SETTINGS` on every visit — nothing is
 * remembered. **An engine is handshaken but never searches**
 * (`useEngineModule` with `enabled: false`): what it declares is what the
 * tab renders — a pinned knob as pinned, an absent one as absent — and the
 * defaults are clamped into its bounds, exactly as on the play screen. Until
 * the handshake lands every control is adjustable within its fallback
 * bounds, which are the bounds the link is clamped into on arrival.
 */
function NewGameForm() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<EngineSettingsValues>(DEFAULT_ENGINE_SETTINGS);
  const [side, setSide] = useState<NewGameSide>("white");
  const [evalBar, setEvalBar] = useState(true);

  const onUciOptionsReady = useCallback(
    (clamped: Readonly<Record<string, number>>) =>
      setSettings((current) => withClampedUciOptions(current, clamped)),
    [],
  );
  const { engineOptions } = useEngineModule({
    // Handshake only: the lobby has no position to think about.
    enabled: false,
    fen: DEFAULT_POSITION,
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    uciOptions: useMemo(
      () =>
        uciOptionsOf({
          skillLevel: settings.skillLevel,
          multiPv: settings.multiPv,
          threads: settings.threads,
          hashMb: settings.hashMb,
        }),
      [settings.skillLevel, settings.multiPv, settings.threads, settings.hashMb],
    ),
    onUciOptionsReady,
  });

  const href = `/engine/play?${newGameParams(settings, side, evalBar)}`;

  return (
    <Box
      data-testid="new-game-form"
      sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 1.5 }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}>
        {t("playedGames.newGame.title")}
      </Typography>

      {/* The panel's one scrolling region: the aside scrolls nothing itself. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", pr: 0.5 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
            {t("playedGames.newGame.side")}
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={side}
            aria-label={t("playedGames.newGame.side")}
            data-testid="new-game-side"
            onChange={(_event, next: NewGameSide | null) => {
              if (next !== null) setSide(next);
            }}
          >
            <ToggleButton value="white" data-testid="new-game-side-white">
              {t("playedGames.newGame.white")}
            </ToggleButton>
            <ToggleButton value="black" data-testid="new-game-side-black">
              {t("playedGames.newGame.black")}
            </ToggleButton>
            <ToggleButton value="random" data-testid="new-game-side-random">
              {t("playedGames.newGame.random")}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <EngineSettings
          settings={settings}
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          engineOptions={engineOptions}
          showEvalBar={evalBar}
          onShowEvalBarChange={setEvalBar}
        />
      </Box>

      <Box sx={{ flexShrink: 0, display: "grid", gap: 1 }}>
        <Button
          component={RouterLink}
          to={href}
          variant="contained"
          size="large"
          fullWidth
          startIcon={<PlayArrowRoundedIcon />}
          data-testid="new-game-start"
          sx={{ py: 1.25, fontWeight: 700 }}
        >
          {t("playedGames.newGame.start")}
        </Button>
        <Typography
          variant="caption"
          data-testid="played-games-storage-note"
          sx={{ color: "text.secondary" }}
        >
          {t("playedGames.storage")}
        </Typography>
      </Box>
    </Box>
  );
}

export default NewGameForm;
