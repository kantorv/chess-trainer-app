import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { useTranslation } from "react-i18next";

/**
 * The export bar — select-all, the picked count and the download — the one in
 * the top bar of the list view of all three saved screens. The caller decides
 * whether to render it (it belongs beside the view that has the checkboxes it
 * drives, and nothing on the board views does) and hands the tri-state in:
 *
 * - `checked` / `indeterminate` are **the caller's** computation, because the
 *   two screens that keep a flat list compute them over the whole list while
 *   the Saved openings screen computes them over the rows on screen — its
 *   select-all works on the folder the reader is standing in, while its chip
 *   counts the whole picked set wherever they are. Both read `selectedCount`
 *   for the chip, so the count is one prop and the tri-state is two.
 * - `onClearSelected` is the chip's clear. `onDownload` is the download; it is
 *   enabled exactly when something is picked, which this derives from
 *   `selectedCount`.
 *
 * The labels are each screen's own: `labelKey` names the screen's catalog
 * block, and `selectAll` / `selected` / `download` resolve under it. The test
 * ids follow the screen's prefix — `${prefix}-export`, `-select-all`,
 * `-selected-count`, `-download` — because the screens' tests are the
 * contract.
 */
type SavedListExportBarProps = {
  /** Whether every row the select-all works on is picked. */
  checked: boolean;
  /** Whether some but not all of them are — the tri-state's middle. */
  indeterminate: boolean;
  onToggleAll: () => void;
  /** How many records are picked, over the whole set the caller keeps. */
  selectedCount: number;
  onClearSelected: () => void;
  onDownload: () => void;
  /** The screen's catalog block, holding `selectAll` / `selected` / `download`. */
  labelKey: string;
  /** The screen's test-id prefix. */
  testIdPrefix: string;
};

function SavedListExportBar({
  checked,
  indeterminate,
  onToggleAll,
  selectedCount,
  onClearSelected,
  onDownload,
  labelKey,
  testIdPrefix,
}: SavedListExportBarProps) {
  const { t } = useTranslation();

  return (
    <Box
      data-testid={`${testIdPrefix}-export`}
      sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}
    >
      <Tooltip title={t(`${labelKey}.selectAll`)}>
        <Checkbox
          size="small"
          checked={checked}
          indeterminate={indeterminate}
          onChange={onToggleAll}
          slotProps={{ input: { "aria-label": t(`${labelKey}.selectAll`) } }}
          data-testid={`${testIdPrefix}-select-all`}
        />
      </Tooltip>
      {selectedCount > 0 && (
        <Chip
          size="small"
          label={t(`${labelKey}.selected`, { count: selectedCount })}
          onDelete={onClearSelected}
          data-testid={`${testIdPrefix}-selected-count`}
        />
      )}
      <Tooltip title={t(`${labelKey}.download`)}>
        {/* A disabled button takes no pointer events, so the tooltip needs a
            wrapper that still does — the same wrapper the board controls use. */}
        <Box component="span" sx={{ display: "inline-flex" }}>
          <IconButton
            size="small"
            disabled={selectedCount === 0}
            onClick={onDownload}
            aria-label={t(`${labelKey}.download`)}
            data-testid={`${testIdPrefix}-download`}
          >
            <DownloadRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Tooltip>
    </Box>
  );
}

export default SavedListExportBar;
