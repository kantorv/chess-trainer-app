import { useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { useTranslation } from "react-i18next";

/**
 * A read-only notation field with a copy button — the way a FEN or a PGN comes
 * back *out* of a screen.
 *
 * Shared between the Analysis Board's Position tab and the Board Editor's FEN
 * tab, so its catalog keys are top-level (`copyable.*`) rather than under either
 * screen's, like the rest of `views/shared/`.
 *
 * The clipboard write is guarded rather than assumed: it needs a secure context
 * and the permission, jsdom has no clipboard at all, and a copy button that
 * throws into the console while looking like it worked is worse than one that
 * says it failed. The text stays selectable either way, which is the fallback
 * the failure message points at.
 */

type CopyableValueProps = {
  label: string;
  value: string;
  /** Prefix for this field's `data-testid`s, so a screen can hold two of them. */
  testId: string;
  /**
   * Gate the copy button. The Board Editor sets this while the position is
   * illegal: the FEN is still shown — you have to see what you are fixing — but
   * handing a broken one to the clipboard is how it ends up pasted elsewhere.
   */
  disabled?: boolean;
  /** Said under the field when `disabled`, in place of the copy state. */
  disabledHint?: string;
};

function CopyableValue({
  label,
  value,
  testId,
  disabled = false,
  disabledHint,
}: CopyableValueProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Tooltip title={t("copyable.copy")}>
          {/* A disabled button takes no pointer events, so the tooltip needs a
              wrapper that still does — otherwise it never opens. */}
          <Box component="span" sx={{ display: "inline-flex" }}>
            <IconButton
              size="small"
              aria-label={`${t("copyable.copy")}: ${label}`}
              data-testid={`${testId}-copy`}
              disabled={disabled}
              onClick={copy}
            >
              <ContentCopyRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
      </Box>

      <TextField
        fullWidth
        multiline
        size="small"
        maxRows={6}
        value={value}
        slotProps={{
          htmlInput: {
            "data-testid": testId,
            readOnly: true,
            "aria-label": label,
            // Notation, in a panel that mirrors under Hebrew — the attribute,
            // never a CSS declaration (see the root `CLAUDE.md`).
            dir: "ltr",
            style: {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
            },
          },
        }}
      />

      {disabled && disabledHint !== undefined ? (
        <Typography
          variant="caption"
          data-testid={`${testId}-copy-disabled`}
          sx={{ display: "block", color: "warning.main" }}
        >
          {disabledHint}
        </Typography>
      ) : (
        state !== "idle" && (
          <Typography
            variant="caption"
            data-testid={`${testId}-copy-state`}
            sx={{
              display: "block",
              color: state === "copied" ? "success.main" : "warning.main",
            }}
          >
            {t(state === "copied" ? "copyable.copied" : "copyable.copyFailed")}
          </Typography>
        )
      )}
    </Box>
  );
}

export default CopyableValue;
