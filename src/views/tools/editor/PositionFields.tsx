import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import {
  enPassantOptions,
  type CastlingFlag,
  type PositionFields as Fields,
} from "../../../lib/positionEditor";

/**
 * The Position tab: FEN fields 2, 3 and 4, one control each.
 *
 * The board answers field 1 and these answer the rest, which is what makes the
 * FEN the screen shows a whole position rather than a diagram. Each control
 * writes straight into `useBoardEditor`'s fields and reads back out of them, so
 * a FEN pasted in shows up here and a box ticked here shows up in the FEN —
 * that round trip is the tab's whole contract.
 *
 * Presentational: no state of its own, so it renders against a fixture.
 *
 * Changing the side to move here does **not** turn the board, though loading a
 * position does (`useBoardEditor`'s `applyFen`). Arranging a position is not the
 * same as being handed one: you may well be setting Black's move up while
 * looking from White, and the flip control is a click away.
 *
 * The en passant target is a picker rather than a text box, over the squares
 * `enPassantOptions` says are possible with this side to move. A target is
 * always on the rank behind the pawn that just double-pushed, so eight squares
 * and "none" is the entire space — and offering exactly that removes the need
 * to validate a typed square at all.
 */

type PositionFieldsProps = {
  fields: Fields;
  onTurnChange: (turn: "w" | "b") => void;
  onCastlingChange: (flag: CastlingFlag, allowed: boolean) => void;
  onEnPassantChange: (square: string) => void;
};

/** The four flags, with the label each one is shown under. */
const CASTLING_CONTROLS = [
  { flag: "K", labelKey: "editor.fields.whiteKingside" },
  { flag: "Q", labelKey: "editor.fields.whiteQueenside" },
  { flag: "k", labelKey: "editor.fields.blackKingside" },
  { flag: "q", labelKey: "editor.fields.blackQueenside" },
] as const;

function PositionFields({
  fields,
  onTurnChange,
  onCastlingChange,
  onEnPassantChange,
}: PositionFieldsProps) {
  const { t } = useTranslation();

  return (
    <Box
      data-testid="editor-position-fields"
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {t("editor.fields.turn")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={fields.turn}
          // `null` when the pressed button is the one already selected; a side
          // has to be to move, so that is a no-op rather than a deselection.
          onChange={(_event, next: "w" | "b" | null) =>
            next !== null && onTurnChange(next)
          }
          aria-label={t("editor.fields.turn")}
        >
          <ToggleButton value="w" data-testid="editor-turn-w">
            {t("editor.fields.white")}
          </ToggleButton>
          <ToggleButton value="b" data-testid="editor-turn-b">
            {t("editor.fields.black")}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <FormControl component="fieldset" variant="standard">
        <FormLabel component="legend" sx={{ typography: "subtitle2", fontWeight: 700 }}>
          {t("editor.fields.castling")}
        </FormLabel>
        <FormGroup>
          {CASTLING_CONTROLS.map(({ flag, labelKey }) => (
            <FormControlLabel
              key={flag}
              control={
                <Checkbox
                  size="small"
                  checked={fields.castling[flag]}
                  // On the control, as the other screens' switches carry theirs
                  // — it lands on the root, and the input is inside it.
                  data-testid={`editor-castling-${flag}`}
                  onChange={(event) =>
                    onCastlingChange(flag, event.target.checked)
                  }
                />
              }
              // The castle itself is notation and runs left to right in every
              // language; the side's name beside it is not.
              label={<span dir="ltr">{t(labelKey)}</span>}
            />
          ))}
        </FormGroup>
      </FormControl>

      <TextField
        select
        size="small"
        label={t("editor.fields.enPassant")}
        value={fields.enPassant}
        onChange={(event) => onEnPassantChange(event.target.value)}
        slotProps={{
          select: {
            // The rendered value, not the input — a `select` TextField has no
            // text input for a testid to land on.
            SelectDisplayProps: {
              "data-testid": "editor-en-passant",
            } as React.HTMLAttributes<HTMLDivElement>,
          },
        }}
      >
        {enPassantOptions(fields.turn).map((square) => (
          <MenuItem key={square} value={square} dir="ltr">
            {square === "-" ? t("editor.fields.enPassantNone") : square}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}

export default PositionFields;
