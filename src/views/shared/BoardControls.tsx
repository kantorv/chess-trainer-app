import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FirstPageRoundedIcon from "@mui/icons-material/FirstPageRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import LastPageRoundedIcon from "@mui/icons-material/LastPageRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import { useTranslation } from "react-i18next";

/**
 * The board's control strip: jump to start, step back, step forward, jump to
 * the end, and flip the board.
 *
 * Presentational — every button is a call back out, so the ply state stays in
 * `useGameNavigation` and this renders against a fixture in tests. It sits at
 * the foot of the panel rather than under the board so that nothing but the
 * board itself competes for the square (see `Layout.tsx`).
 *
 * The row mirrors under Hebrew like the rest of the panel, which is what puts
 * "start" on the reader's leading edge in both directions. The chevrons keep
 * their glyphs: they point along the move list, and the list is what they move
 * through.
 */

type BoardControlsProps = {
  /** The selected half-move; 0 is the starting position. */
  ply: number;
  /** The position after the final move. */
  lastPly: number;
  onSelectPly: (ply: number) => void;
  onFlip: () => void;
};

function BoardControls({
  ply,
  lastPly,
  onSelectPly,
  onFlip,
}: BoardControlsProps) {
  const { t } = useTranslation();

  const atStart = ply <= 0;
  const atEnd = ply >= lastPly;

  const steps = [
    {
      key: "first",
      label: t("gamePanel.controls.first"),
      icon: <FirstPageRoundedIcon fontSize="small" />,
      disabled: atStart,
      onClick: () => onSelectPly(0),
    },
    {
      key: "previous",
      label: t("gamePanel.controls.previous"),
      icon: <ChevronLeftRoundedIcon fontSize="small" />,
      disabled: atStart,
      onClick: () => onSelectPly(ply - 1),
    },
    {
      key: "next",
      label: t("gamePanel.controls.next"),
      icon: <ChevronRightRoundedIcon fontSize="small" />,
      disabled: atEnd,
      onClick: () => onSelectPly(ply + 1),
    },
    {
      key: "last",
      label: t("gamePanel.controls.last"),
      icon: <LastPageRoundedIcon fontSize="small" />,
      disabled: atEnd,
      onClick: () => onSelectPly(lastPly),
    },
  ];

  return (
    <Box
      data-testid="board-controls"
      sx={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        pt: 1,
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      {steps.map((step) => (
        // A disabled button takes no pointer events, so the tooltip needs a
        // wrapper that still does — otherwise it never opens at the ends.
        <Tooltip key={step.key} title={step.label}>
          <Box component="span" sx={{ display: "inline-flex" }}>
            <IconButton
              size="small"
              aria-label={step.label}
              data-testid={`board-control-${step.key}`}
              disabled={step.disabled}
              onClick={step.onClick}
            >
              {step.icon}
            </IconButton>
          </Box>
        </Tooltip>
      ))}

      <Tooltip title={t("gamePanel.controls.flip")}>
        <IconButton
          size="small"
          aria-label={t("gamePanel.controls.flip")}
          data-testid="board-control-flip"
          onClick={onFlip}
          // Pushed to the trailing edge — it acts on the board, not on the
          // game, so it does not belong in the run of step buttons.
          sx={{ marginInlineStart: "auto" }}
        >
          <SwapVertRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default BoardControls;
