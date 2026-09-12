import IconButton from "@mui/material/IconButton";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { useTranslation } from "react-i18next";

/**
 * The delete control, identical in both views of all three saved screens and
 * the one whose whole behavior is a call out: `onRemove` is each screen's own
 * store operation (`removeSavedGame` and its siblings), so the machinery here
 * is the button and nothing else.
 *
 * The label is the screen's own: `labelKey` names the screen's catalog block
 * and `${labelKey}.remove` resolves under it; the id pattern follows the
 * screen's `testIdPrefix` — `${prefix}-remove-${id}` — because the screens'
 * tests are the contract.
 */
type SavedListRemoveButtonProps = {
  id: string;
  onRemove: (id: string) => void;
  /** The screen's catalog block, holding `remove`. */
  labelKey: string;
  /** The screen's test-id prefix. */
  testIdPrefix: string;
};

function SavedListRemoveButton({
  id,
  onRemove,
  labelKey,
  testIdPrefix,
}: SavedListRemoveButtonProps) {
  const { t } = useTranslation();

  return (
    <IconButton
      size="small"
      aria-label={t(`${labelKey}.remove`)}
      data-testid={`${testIdPrefix}-remove-${id}`}
      onClick={() => onRemove(id)}
    >
      <DeleteOutlineRoundedIcon fontSize="small" />
    </IconButton>
  );
}

export default SavedListRemoveButton;
