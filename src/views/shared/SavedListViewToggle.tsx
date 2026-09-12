import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import ViewComfyRounded from "@mui/icons-material/ViewComfyRounded";
import ViewListRounded from "@mui/icons-material/ViewListRounded";
import ViewModuleRounded from "@mui/icons-material/ViewModuleRounded";
import { useTranslation } from "react-i18next";

import { type SavedListView } from "./savedList";

/**
 * The three-way view toggle — the list, or one of the two board sizes — the
 * one in the top bar of all three saved screens.
 *
 * Presentational: `onChange` is called on a **real** change only. MUI reports
 * `null` when the pressed button is the one already selected; the screen has
 * to be showing *something*, so that is a no-op here, and a caller never sees
 * it. What a real change drops is the caller's: the selection lives beside the
 * checkboxes only the list view has, so each screen's handler drops it —
 * a count for rows nobody can see is a trap. (The Saved openings screen's
 * handler is the same call; its picks persist across *folder* navigation, not
 * across a view switch.)
 *
 * The labels are each screen's own: `labelKey` names the screen's catalog
 * block (`"savedGames"` and its siblings), and the four keys under
 * `${labelKey}.view.*` resolve from it — so a screen keeps naming its own
 * controls in its own block, and what is shared here is the structure, the id
 * pattern and the behavior, not the words.
 */
type SavedListViewToggleProps = {
  value: SavedListView;
  /** Called on a real change — never with the view already showing. */
  onChange: (next: SavedListView) => void;
  /** The screen's catalog block, holding the `view.*` keys. */
  labelKey: string;
  /** The screen's test-id prefix — `${prefix}-view-list` and its siblings. */
  testIdPrefix: string;
};

function SavedListViewToggle({
  value,
  onChange,
  labelKey,
  testIdPrefix,
}: SavedListViewToggleProps) {
  const { t } = useTranslation();

  const options = [
    {
      value: "list" as const,
      label: t(`${labelKey}.view.list`),
      icon: <ViewListRounded fontSize="small" />,
    },
    {
      value: "compact" as const,
      label: t(`${labelKey}.view.compact`),
      icon: <ViewComfyRounded fontSize="small" />,
    },
    {
      value: "comfortable" as const,
      label: t(`${labelKey}.view.comfortable`),
      icon: <ViewModuleRounded fontSize="small" />,
    },
  ];

  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_event, next: SavedListView | null) => {
        if (next === null) return;
        onChange(next);
      }}
      aria-label={t(`${labelKey}.view.label`)}
      sx={{ flexShrink: 0 }}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          value={option.value}
          data-testid={`${testIdPrefix}-view-${option.value}`}
          aria-label={option.label}
        >
          <Tooltip title={option.label}>{option.icon}</Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default SavedListViewToggle;
