import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { gameTag, type Game } from "../../lib/gameModel";

/**
 * The Info tab: a game's PGN tag pairs, as a two-column list.
 *
 * Shared, like `MoveList` and `BoardControls` beside it, because two screens
 * show a loaded game's headers: Load PGN's Info tab and the User PGNs detail
 * page. It takes a `Game` and knows nothing about which one is rendering it,
 * and its keys are the top-level `gamePanel.info.*` the shared board controls
 * already read from.
 *
 * The named tags come first, in the order the PGN spec prints them and with
 * translated labels; anything else the file carried follows under its own raw
 * tag, because a PGN may hold any tag at all and dropping them would lose data
 * the reader can see in the file itself.
 *
 * Values are read through `gameTag`, so the placeholders `chess.js` fills the
 * seven-tag roster with ("?", "????.??.??") are treated as absent rather than
 * printed.
 */

/** The tags worth naming, in display order, paired with their label key. */
const NAMED_TAGS = [
  ["Event", "event"],
  ["Site", "site"],
  ["Date", "date"],
  ["Round", "round"],
  ["White", "white"],
  ["Black", "black"],
  ["Result", "result"],
  ["ECO", "eco"],
  ["Opening", "opening"],
  ["TimeControl", "timeControl"],
  ["Termination", "termination"],
] as const;

const NAMED_TAG_KEYS = new Set<string>(NAMED_TAGS.map(([tag]) => tag));

function GameInfo({ game }: { game: Game | undefined }) {
  const { t } = useTranslation();

  if (game === undefined) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {t("gamePanel.info.empty")}
      </Typography>
    );
  }

  const named = NAMED_TAGS.map(([tag, labelKey]) => ({
    key: tag,
    label: t(`gamePanel.info.${labelKey}`),
    value: gameTag(game.headers, tag),
  })).filter((row) => row.value !== undefined);

  const extra = Object.keys(game.headers)
    .filter((tag) => !NAMED_TAG_KEYS.has(tag))
    .map((tag) => ({ key: tag, label: tag, value: gameTag(game.headers, tag) }))
    .filter((row) => row.value !== undefined);

  const rows = [...named, ...extra];

  if (rows.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {t("gamePanel.info.empty")}
      </Typography>
    );
  }

  return (
    <Box
      component="dl"
      data-testid="game-info"
      sx={{
        m: 0,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 1.5,
        rowGap: 0.5,
        alignItems: "baseline",
      }}
    >
      {rows.map((row) => (
        <Box key={row.key} sx={{ display: "contents" }}>
          <Typography
            component="dt"
            variant="body2"
            sx={{ color: "text.secondary", whiteSpace: "nowrap" }}
          >
            {row.label}
          </Typography>
          <Typography
            component="dd"
            variant="body2"
            data-testid={`game-info-${row.key}`}
            // Tag values are names, dates and results — Latin text that must not
            // be reordered by an RTL paragraph around it. Same reasoning as the
            // move list's SAN cells: a `dir` attribute, not a CSS declaration,
            // because the RTL emotion cache would flip the declaration.
            dir="ltr"
            sx={{ m: 0, unicodeBidi: "isolate", overflowWrap: "anywhere" }}
          >
            {row.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default GameInfo;
