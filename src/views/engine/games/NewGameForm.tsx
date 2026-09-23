import { useCallback, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
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
import { parseFen } from "../../../lib/fen";
import { newGameParams, type NewGameSide } from "../../../lib/newGameLink";
import { START_POSITION } from "../../../lib/positionEditor";
import { useEngineModule } from "../../board/core/useEngineModule";
import PositionEditor from "../../shared/positionEditor/PositionEditor";
import { usePositionEditor } from "../../shared/positionEditor/usePositionEditor";
import EngineSettings from "../play/EngineSettings";

/**
 * **The Lobby's new-game form** (CTA-82) — the right-hand panel of
 * `/engine/games`: the reader's side (White or Black) over the in-game
 * Engine tab itself (`EngineSettings`, not a copy of its controls), a
 * **Variations** checkbox under its eval bar (CTA-90: the same choice as the
 * pinned block's own header checkbox — what the new game starts with, the
 * engine's lines shown or hidden), and a full-width **Start** that opens
 * `/engine/play` with the choice as query parameters (`lib/newGameLink.ts`),
 * which `arrivalOf` reads once.
 *
 * The form starts from `DEFAULT_ENGINE_SETTINGS` on every visit — nothing is
 * remembered. **An engine is handshaken but never searches**
 * (`useEngineModule` with `enabled: false`): what it declares is what the
 * tab renders — a pinned knob as pinned, an absent one as absent — and the
 * defaults are clamped into its bounds, exactly as on the play screen. Until
 * the handshake lands every control is adjustable within its fallback
 * bounds, which are the bounds the link is clamped into on arrival.
 *
 * **Two tabs** (CTA-83): **Game** — the side, the Variations checkbox and
 * the Engine tab — and **Board editor** — the shared `PositionEditor`, whose
 * state (`usePositionEditor`) is the form's, so it survives a switch of tab.
 * Start and the storage note sit below the tabs, on both. Whenever the
 * editor holds a position other than the standard start, Start carries it as
 * `?fen=` (from either tab — the Game tab says so, with a way back to the
 * standard start), and Start is off while that position cannot be played
 * from. The editor's board faces the side chosen on the Game tab. A `side`
 * on the link still beats the position's side to move (`arrivalOf`).
 */

const FORM_TABS = ["game", "editor"] as const;
type FormTab = (typeof FORM_TABS)[number];

/** The widest the editor's board grows in the panel — a small board, beside the list. */
const EDITOR_BOARD_MAX_PX = 360;

function NewGameForm() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<EngineSettingsValues>(DEFAULT_ENGINE_SETTINGS);
  const [side, setSide] = useState<NewGameSide>("white");
  const [evalBar, setEvalBar] = useState(true);
  // What the new game's pinned lines start as (CTA-90) — the block's own
  // header checkbox is the live control once the game is under way.
  const [variations, setVariations] = useState(true);
  const [tab, setTab] = useState<FormTab>("game");
  // The editor faces the side the reader will play.
  const editor = usePositionEditor(undefined, { orientation: side });

  /*
    The position Start carries: none for the standard start, so an ordinary
    game's link is what it always was. `parseFen` is the arrival's gate, and a
    `?fen=` it refused would be dropped silently on `/engine/play` — so it is
    asked here too, a safety net under `positionProblems` for anything the two
    ever disagree on.
  */
  const customFen = editor.fen === START_POSITION ? undefined : editor.fen;
  const playable = useMemo(() => {
    if (!editor.isValid) return false;
    if (customFen === undefined) return true;
    try {
      parseFen(customFen);
      return true;
    } catch {
      return false;
    }
  }, [editor.isValid, customFen]);

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

  const href = `/engine/play?${newGameParams(settings, side, evalBar, variations, customFen)}`;

  return (
    <Box
      data-testid="new-game-form"
      sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 1.5 }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}>
        {t("playedGames.newGame.title")}
      </Typography>

      <Tabs
        value={tab}
        onChange={(_event, next: FormTab) => setTab(next)}
        variant="fullWidth"
        sx={{
          flexShrink: 0,
          minHeight: 36,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 36, textTransform: "none", minWidth: 0, px: 1 },
        }}
      >
        {FORM_TABS.map((id) => (
          <Tab
            key={id}
            value={id}
            label={t(`playedGames.newGame.tabs.${id}`)}
            data-testid={`new-game-tab-${id}`}
          />
        ))}
      </Tabs>

      {/* The panel's one scrolling region: the aside scrolls nothing itself. */}
      <Box
        role="tabpanel"
        data-testid={`new-game-tab-content-${tab}`}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", pr: 0.5 }}
      >
        {tab === "editor" && (
          <PositionEditor
            editor={editor}
            testId="new-game-editor"
            boardMaxWidth={EDITOR_BOARD_MAX_PX}
          />
        )}
        {tab === "game" && (
          <>
            {customFen !== undefined && (
              <Alert
                severity="info"
                data-testid="new-game-custom-position"
                sx={{ mb: 2, "& .MuiAlert-message": { minWidth: 0 } }}
              >
                <Typography variant="body2">{t("playedGames.newGame.customPosition")}</Typography>
                <Typography
                  variant="caption"
                  component="div"
                  dir="ltr"
                  sx={{ fontFamily: "monospace", wordBreak: "break-all", my: 0.5 }}
                >
                  {customFen}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  <Button
                    size="small"
                    data-testid="new-game-custom-position-edit"
                    onClick={() => setTab("editor")}
                  >
                    {t("playedGames.newGame.customPositionEdit")}
                  </Button>
                  <Button
                    size="small"
                    data-testid="new-game-custom-position-reset"
                    onClick={editor.setStartingPosition}
                  >
                    {t("playedGames.newGame.customPositionReset")}
                  </Button>
                </Box>
              </Alert>
            )}
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
              </ToggleButtonGroup>
            </Box>

            <EngineSettings
              settings={settings}
              onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
              engineOptions={engineOptions}
              showEvalBar={evalBar}
              onShowEvalBarChange={setEvalBar}
            />

            {/*
              The Variations choice (CTA-90), directly under the eval bar:
              what the new game starts with the pinned engine lines at. The
              same choice as the block's own header checkbox on the game view,
              which remains the live control there.
            */}
            <FormControlLabel
              sx={{ mt: 2 }}
              control={
                <Checkbox
                  checked={variations}
                  data-testid="new-game-variations"
                  onChange={(event) => setVariations(event.target.checked)}
                />
              }
              label={t("playedGames.newGame.variations")}
            />
          </>
        )}
      </Box>

      <Box sx={{ flexShrink: 0, display: "grid", gap: 1 }}>
        {!playable && (
          <Alert severity="warning" data-testid="new-game-illegal" sx={{ py: 0.5 }}>
            {t("playedGames.newGame.illegal")}
            {editor.problems.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {editor.problems.map((problem) => (
                  <li key={problem}>{t(`positionEditor.problems.${problem}`)}</li>
                ))}
              </Box>
            )}
          </Alert>
        )}
        {/* Off, it is a plain button rather than a link: nothing to follow. */}
        <Button
          {...(playable ? { component: RouterLink, to: href } : { disabled: true })}
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
