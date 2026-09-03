import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import {
  MASK_PIECE_LETTERS,
  MASK_PRESETS,
  MASK_PRESET_IDS,
  maskPresetOf,
  withMaskEntry,
  type MaskPieceLetter,
  type MaskPieceType,
  type MaskPresetId,
  type PieceMask,
} from "../../../lib/pieceMask";

/**
 * The Masking tab: which graphic is drawn for which real piece, and whether the
 * notation gives the game away.
 *
 * Twelve controls — six per colour — because the mask is keyed on the piece
 * *type* rather than on the individual piece (`lib/pieceMask.ts` has the whole
 * argument). Setting each colour separately is what makes "mask only Black's
 * pieces" an ordinary mask rather than a feature.
 *
 * **A row only ever offers the six types of its own colour.** Colour is visible
 * information in the specification (§3.1); only the type is hidden (§3.2), so
 * drawing a white rook as a black pawn would be a second lie the exercise never
 * asked for — and one that breaks the position rather than obscuring it.
 *
 * The presets are the doc's variants table (§8), and they are also the way out:
 * "Show real pieces" is the identity mask, so the screen can be played
 * unmasked without leaving it.
 */

type MaskEditorProps = {
  mask: PieceMask;
  onMaskChange: (mask: PieceMask) => void;
  /** Whether the move list and the variations hide masked pieces' letters. */
  maskNotation: boolean;
  onMaskNotationChange: (next: boolean) => void;
};

/** One colour's six rows: the true piece, and the piece drawn for it. */
function ColorColumn({
  color,
  mask,
  onMaskChange,
}: {
  color: "w" | "b";
  mask: PieceMask;
  onMaskChange: (mask: PieceMask) => void;
}) {
  const { t } = useTranslation();

  return (
    <Box data-testid={`mask-column-${color}`} sx={{ display: "grid", gap: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {t(color === "w" ? "masking.white" : "masking.black")}
      </Typography>

      {MASK_PIECE_LETTERS.map((letter) => {
        const type = `${color}${letter}` as MaskPieceType;
        const id = `mask-select-${type}`;
        const label = t(`masking.pieces.${letter.toLowerCase()}`);

        return (
          <Box
            key={type}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <InputLabel
              htmlFor={id}
              sx={{ fontSize: "0.8125rem", color: "text.primary" }}
            >
              {label}
            </InputLabel>
            <Select
              native
              size="small"
              value={mask[type]}
              inputProps={{ id, "data-testid": id, "aria-label": label }}
              onChange={(event) =>
                onMaskChange(
                  withMaskEntry(
                    mask,
                    type,
                    event.target.value as MaskPieceType,
                  ),
                )
              }
            >
              {MASK_PIECE_LETTERS.map((displayed: MaskPieceLetter) => (
                <option key={displayed} value={`${color}${displayed}`}>
                  {t(`masking.pieces.${displayed.toLowerCase()}`)}
                </option>
              ))}
            </Select>
          </Box>
        );
      })}
    </Box>
  );
}

function MaskEditor({
  mask,
  onMaskChange,
  maskNotation,
  onMaskNotationChange,
}: MaskEditorProps) {
  const { t } = useTranslation();

  // `null` when the twelve entries are some arrangement of their own, which is
  // what an edited mask is — the group then simply has nothing selected.
  const preset = maskPresetOf(mask);

  return (
    <Box data-testid="mask-editor" sx={{ display: "grid", gap: 2 }}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {t("masking.presets.title")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          orientation="vertical"
          fullWidth
          value={preset}
          data-testid="mask-presets"
          onChange={(_event, next: MaskPresetId | null) => {
            // A group can deselect its active button; there is no "no mask at
            // all" to fall back to, so a second click on one changes nothing.
            if (next) onMaskChange(MASK_PRESETS[next]);
          }}
        >
          {MASK_PRESET_IDS.map((id) => (
            <ToggleButton key={id} value={id} data-testid={`mask-preset-${id}`}>
              {t(`masking.presets.${id}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {t("masking.drawnAs")}
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 2,
          }}
        >
          <ColorColumn color="w" mask={mask} onMaskChange={onMaskChange} />
          <ColorColumn color="b" mask={mask} onMaskChange={onMaskChange} />
        </Box>
      </Box>

      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={maskNotation}
              data-testid="mask-setting-notation"
              onChange={(event) => onMaskNotationChange(event.target.checked)}
            />
          }
          label={t("masking.notation")}
        />
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block" }}
        >
          {t("masking.notationHint")}
        </Typography>
      </Box>
    </Box>
  );
}

export default MaskEditor;
