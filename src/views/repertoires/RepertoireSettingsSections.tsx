import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import type { ReactNode } from "react";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import FolderOffRoundedIcon from "@mui/icons-material/FolderOffRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { useTranslation } from "react-i18next";

import {
  MAX_REPERTOIRE_DESCRIPTION_CHARS,
  type RepertoireColor,
  type RepertoireSettings,
} from "../../lib/repertoireSettings";
import { sortedRepertoireFolders } from "../../lib/savedRepertoireFolders";
import { useRepertoireFolders } from "./useRepertoireFolders";

/**
 * **The sections of a repertoire's settings screen** — one component per group
 * of options, each editing the screen's one draft through `onChange`.
 *
 * The screen (`RepertoireSettingsScreen.tsx`) renders a list of these and owns
 * nothing about any option, so an option lands in exactly one place here: a
 * control in the section it belongs to, or a new section beside these
 * (then one entry in the screen's `SECTIONS`). See
 * `lib/repertoireSettings.ts`, "Adding an option", for the other half.
 */

/**
 * What the screen edits: the title (the record's `name`), the settings, and
 * the folder it is filed under (`folderId`, `null` for Unfiled) — a record
 * field, not a setting, but chosen here and written on the same Save (CTA-68).
 */
export type RepertoireSettingsDraft = {
  name: string;
  settings: RepertoireSettings;
  folderId: string | null;
};

export type RepertoireSettingsSectionProps = {
  draft: RepertoireSettingsDraft;
  /** Replace the title and/or the folder, and/or merge into the settings. */
  onChange: (patch: {
    name?: string;
    settings?: Partial<RepertoireSettings>;
    folderId?: string | null;
  }) => void;
};

/** One on/off option, with a line on what it does. */
function SwitchOption({
  checked,
  onChange,
  label,
  help,
  testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  help: ReactNode;
  testId: string;
}) {
  return (
    <Box>
      <FormControlLabel
        sx={{ m: 0 }}
        control={
          <Switch
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            slotProps={{ input: { "data-testid": testId } as object }}
          />
        }
        label={label}
      />
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
        {help}
      </Typography>
    </Box>
  );
}

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
      <SwitchOption
        checked={draft.settings.protected}
        onChange={(next) => onChange({ settings: { protected: next } })}
        label={t("repertoires.settings.protected")}
        help={t("repertoires.settings.protectedHelp")}
        testId="repertoire-settings-protected"
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
      <SwitchOption
        checked={draft.settings.showArrows}
        onChange={(next) => onChange({ settings: { showArrows: next } })}
        label={t("repertoires.settings.showArrows")}
        help={t("repertoires.settings.showArrowsHelp")}
        testId="repertoire-settings-show-arrows"
      />
    </Box>
  );
}

/**
 * Where it is filed — a tree select: Unfiled at the root and every folder
 * under it. Folders are one level (`lib/savedRepertoireFolders.ts`), so the
 * tree has two, and a pick is the draft's `folderId`, written on Save.
 */
export function FolderSection({ draft, onChange }: RepertoireSettingsSectionProps) {
  const { t } = useTranslation();
  const folders = sortedRepertoireFolders(useRepertoireFolders());

  const item = (folderId: string | null, label: string, depth: number) => {
    const selected = draft.folderId === folderId;
    return (
      <ListItemButton
        key={folderId ?? ""}
        role="treeitem"
        aria-selected={selected}
        aria-level={depth + 1}
        selected={selected}
        onClick={() => onChange({ folderId })}
        data-testid={`repertoire-settings-folder-${folderId ?? "unfiled"}`}
        sx={{ borderRadius: 0.5, paddingInlineStart: 1 + depth * 3 }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          {folderId === null ? (
            <FolderOffRoundedIcon fontSize="small" />
          ) : (
            <FolderRoundedIcon fontSize="small" />
          )}
        </ListItemIcon>
        <ListItemText primary={label} slotProps={{ primary: { noWrap: true } }} />
      </ListItemButton>
    );
  };

  return (
    <Box>
      <List
        component="div"
        dense
        disablePadding
        role="tree"
        aria-label={t("repertoires.settings.folder")}
        data-testid="repertoire-settings-folder"
      >
        {item(null, t("repertoires.folder.unfiled"), 0)}
        {folders.length > 0 && (
          <List component="div" dense disablePadding role="group">
            {folders.map((folder) =>
              item(folder.id, folder.name || t("repertoires.untitled"), 1),
            )}
          </List>
        )}
      </List>
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
        {t(folders.length === 0 ? "repertoires.settings.folderNone" : "repertoires.settings.folderHelp")}
      </Typography>
    </Box>
  );
}
