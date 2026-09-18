import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import {
  MAX_REPERTOIRE_DESCRIPTION_CHARS,
  type RepertoireColor,
  type RepertoireSettings,
} from "../../lib/repertoireSettings";

/**
 * **The sections of a repertoire's settings screen** — one component per group
 * of options, each editing the screen's one draft through `onChange`.
 *
 * The screen (`RepertoireSettingsScreen.tsx`) renders a list of these and owns
 * nothing about any option, so an option lands in exactly one place here: a
 * control in the section it belongs to, or a new section beside these two
 * (then one entry in the screen's `SECTIONS`). See
 * `lib/repertoireSettings.ts`, "Adding an option", for the other half.
 */

/** What the screen edits: the title (the record's `name`) and the settings. */
export type RepertoireSettingsDraft = {
  name: string;
  settings: RepertoireSettings;
};

export type RepertoireSettingsSectionProps = {
  draft: RepertoireSettingsDraft;
  /** Replace the title and/or merge into the settings. */
  onChange: (patch: {
    name?: string;
    settings?: Partial<RepertoireSettings>;
  }) => void;
};

/** Title and description — what the repertoire is called and what it is. */
export function GeneralSection({ draft, onChange }: RepertoireSettingsSectionProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <TextField
        size="small"
        label={t("repertoires.settings.name")}
        helperText={t("repertoires.settings.nameHelp")}
        placeholder={t("repertoires.untitled")}
        value={draft.name}
        onChange={(event) => onChange({ name: event.target.value })}
        slotProps={{ htmlInput: { "data-testid": "repertoire-settings-name" } }}
      />
      <TextField
        multiline
        minRows={3}
        maxRows={10}
        label={t("repertoires.settings.description")}
        helperText={t("repertoires.settings.descriptionHelp")}
        value={draft.settings.description}
        onChange={(event) =>
          onChange({ settings: { description: event.target.value } })
        }
        slotProps={{
          htmlInput: {
            "data-testid": "repertoire-settings-description",
            maxLength: MAX_REPERTOIRE_DESCRIPTION_CHARS,
            dir: "auto",
          },
        }}
      />
    </Box>
  );
}

/** How the board shows it — the side it is played from, and its arrows. */
export function BoardSection({ draft, onChange }: RepertoireSettingsSectionProps) {
  const { t } = useTranslation();
  const colors: readonly RepertoireColor[] = ["white", "black"];
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
          {t("repertoires.settings.color")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={draft.settings.color}
          onChange={(_event, next: RepertoireColor | null) => {
            // MUI reports `null` for a click on the pressed button: a side is
            // always chosen, so that is not a change.
            if (next !== null) onChange({ settings: { color: next } });
          }}
          aria-label={t("repertoires.settings.color")}
        >
          {colors.map((color) => (
            <ToggleButton
              key={color}
              value={color}
              data-testid={`repertoire-settings-color-${color}`}
              sx={{ textTransform: "none", px: 2 }}
            >
              {t(`repertoires.settings.${color}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 0.75 }}
        >
          {t("repertoires.settings.colorHelp")}
        </Typography>
      </Box>
      <Box>
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Switch
              checked={draft.settings.showArrows}
              onChange={(event) =>
                onChange({ settings: { showArrows: event.target.checked } })
              }
              slotProps={{
                input: { "data-testid": "repertoire-settings-show-arrows" } as object,
              }}
            />
          }
          label={t("repertoires.settings.showArrows")}
        />
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {t("repertoires.settings.showArrowsHelp")}
        </Typography>
      </Box>
    </Box>
  );
}
