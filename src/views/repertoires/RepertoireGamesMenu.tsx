import { useState } from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { REPERTOIRE_GAMES, repertoireGamePath } from "../../lib/repertoireGames";

/**
 * **The games a repertoire can be played as** (CTA-63) — one button and a menu
 * of `REPERTOIRE_GAMES`, on the repertoire's own view and on its row and card
 * in the list. Each item is a link, so a game is a URL like any other screen.
 */
function RepertoireGamesMenu({ id, testId }: { id: string; testId: string }) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={t("repertoires.games.open")}>
        <IconButton
          size="small"
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label={t("repertoires.games.open")}
          aria-haspopup="menu"
          data-testid={testId}
          sx={{ flexShrink: 0 }}
        >
          <SportsEsportsRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {REPERTOIRE_GAMES.map((game) => (
          <MenuItem
            key={game}
            component={RouterLink}
            to={repertoireGamePath(id, game)}
            onClick={() => setAnchor(null)}
            data-testid={`${testId}-${game}`}
          >
            {t(`repertoires.games.${game}.title`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export default RepertoireGamesMenu;
