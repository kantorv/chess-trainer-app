import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { EXPORT_CATEGORIES, type ExportCategory } from "../../lib/dataExport";
import {
  CONFLICT_CHOICES,
  defaultImportChoices,
  importPlanOf,
  importWritesOf,
  type CategoryChoices,
  type ConflictChoice,
  type FolderConflict,
  type ImportChoices,
  type ImportCurrent,
  type ImportDump,
} from "../../lib/dataImport";
import { IMPORT_CAPS } from "../../lib/dataImportTarget";

/**
 * **What to import, and what a clash does** (CTA-89) — the dialog a readable
 * zip opens on. One row per category (the ones the zip does not hold are
 * off), each with its count; under a ticked one that clashes, Merge /
 * Override / Skip for the whole category and the clashing folders, each of
 * which opens to a choice of its own. Every change re-plans
 * (`importWritesOf`), so what the import will do — and a cap it would pass —
 * is said before anything is written. Nothing here writes: `onImport` hands
 * the choices back.
 */

type Props = {
  fileName: string;
  dump: ImportDump;
  current: ImportCurrent;
  onCancel: () => void;
  onImport: (choices: ImportChoices) => void;
};

const choiceRadios = (t: (key: string) => string) =>
  CONFLICT_CHOICES.map((choice) => (
    <FormControlLabel
      key={choice}
      value={choice}
      control={<Radio size="small" />}
      label={<Typography variant="body2">{t(`settings.import.choices.${choice}`)}</Typography>}
    />
  ));

/** One clashing folder: its name and counts, the choice it gets, and — opened — its own. */
function ConflictRow({
  category,
  index,
  conflict,
  choice,
  own,
  onChoose,
}: {
  category: ExportCategory;
  index: number;
  conflict: FolderConflict;
  choice: ConflictChoice;
  own: ConflictChoice | undefined;
  onChoose: (choice: ConflictChoice) => void;
}) {
  const { t } = useTranslation();
  const rtl = useTheme().direction === "rtl";
  const [open, setOpen] = useState(false);
  const testId = `settings-import-${category}-conflict-${index}`;
  const effective = own ?? choice;
  return (
    <Box component="li" data-testid={testId} sx={{ listStyle: "none" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          size="small"
          aria-expanded={open}
          aria-label={t("settings.import.dialog.toggle")}
          onClick={() => setOpen((was) => !was)}
          data-testid={`${testId}-toggle`}
        >
          <KeyboardArrowRightRoundedIcon
            fontSize="small"
            // Closed, it points the way the text runs — inline, so the RTL
            // stylis plugin leaves it alone (the Library's tree table's rule).
            style={{ transform: open ? "rotate(90deg)" : rtl ? "scaleX(-1)" : "none", transition: "transform 120ms" }}
          />
        </IconButton>
        <Typography variant="body2" dir="auto" sx={{ fontWeight: 600 }}>
          {conflict.path.length === 0 ? t(`settings.import.top.${category}`) : conflict.path.join(" / ")}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {t("settings.import.dialog.counts", { incoming: conflict.incoming, existing: conflict.existing })}
        </Typography>
        <Chip
          size="small"
          variant={own === undefined ? "outlined" : "filled"}
          label={t(`settings.import.choices.${effective}`)}
          data-testid={`${testId}-effective`}
        />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ paddingInlineStart: 5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("settings.import.dialog.folderChoice")}
          </Typography>
          <RadioGroup
            row
            value={effective}
            onChange={(_event, value) => onChoose(value as ConflictChoice)}
            data-testid={`${testId}-choice`}
          >
            {choiceRadios(t)}
          </RadioGroup>
        </Box>
      </Collapse>
    </Box>
  );
}

function ImportDialog({ fileName, dump, current, onCancel, onImport }: Props) {
  const { t, i18n } = useTranslation();
  const plan = useMemo(() => importPlanOf(dump, current), [dump, current]);
  const [choices, setChoices] = useState<ImportChoices>(() => defaultImportChoices(plan));
  const writes = useMemo(
    () => importWritesOf(dump, current, choices, { caps: IMPORT_CAPS }),
    [dump, current, choices],
  );

  const change = (category: ExportCategory, next: Partial<CategoryChoices>) =>
    setChoices((was) => ({ ...was, [category]: { ...was[category], ...next } }));

  const exported = new Date(dump.exportedAt);
  const writable = EXPORT_CATEGORIES.some((category) => {
    const planned = writes[category];
    return planned !== undefined && planned.refused === undefined;
  });

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="sm" data-testid="settings-import-dialog">
      <DialogTitle>{t("settings.import.dialog.title", { fileName })}</DialogTitle>
      <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {!Number.isNaN(exported.getTime()) && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("settings.import.dialog.from", {
              date: exported.toLocaleDateString(i18n.language),
              version: dump.appVersion,
            })}
          </Typography>
        )}

        {EXPORT_CATEGORIES.map((category, at) => {
          const planned = plan.categories[category];
          const chosen = choices[category];
          const ticked = planned !== undefined && chosen.ticked;
          const outcome = ticked ? writes[category] : undefined;
          const conflicts = planned?.conflicts ?? [];
          return (
            <Box key={category} data-testid={`settings-import-${category}`}>
              {at > 0 && <Divider sx={{ mb: 1 }} />}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={ticked}
                    disabled={planned === undefined}
                    onChange={(_event, checked) => change(category, { ticked: checked })}
                    data-testid={`settings-import-${category}-tick`}
                  />
                }
                label={
                  <>
                    {t(`settings.export.categories.${category}`)}{" "}
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                      data-testid={`settings-import-${category}-count`}
                    >
                      ({planned?.count ?? 0})
                    </Typography>
                  </>
                }
              />
              <Box sx={{ paddingInlineStart: 4, display: "flex", flexDirection: "column", gap: 0.5 }}>
                {category === "collections" && plan.shippedCollections > 0 && (
                  <Typography variant="body2" sx={{ color: "text.secondary" }} data-testid="settings-import-shipped">
                    {t("settings.import.dialog.shipped", { count: plan.shippedCollections })}
                  </Typography>
                )}
                {ticked && conflicts.length > 0 && (
                  <>
                    <Typography variant="body2">
                      {t("settings.import.dialog.conflicts", { count: conflicts.length })}
                    </Typography>
                    <RadioGroup
                      row
                      value={chosen.choice}
                      onChange={(_event, value) => change(category, { choice: value as ConflictChoice })}
                      data-testid={`settings-import-${category}-choice`}
                    >
                      {choiceRadios(t)}
                    </RadioGroup>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {t(`settings.import.choiceHelp.${chosen.choice}`)}
                    </Typography>
                    <Box component="ul" sx={{ m: 0, p: 0 }}>
                      {conflicts.map((conflict, index) => (
                        <ConflictRow
                          key={conflict.key}
                          category={category}
                          index={index}
                          conflict={conflict}
                          choice={chosen.choice}
                          own={chosen.folders[conflict.key]}
                          onChoose={(choice) =>
                            change(category, { folders: { ...chosen.folders, [conflict.key]: choice } })
                          }
                        />
                      ))}
                    </Box>
                  </>
                )}
                {outcome !== undefined && outcome.refused === undefined && (
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                    data-testid={`settings-import-${category}-preview`}
                  >
                    {t("settings.import.dialog.preview", outcome.report)}
                  </Typography>
                )}
                {outcome?.refused !== undefined && (
                  <Alert severity="error" data-testid={`settings-import-${category}-refused`}>
                    {t(
                      outcome.refused.kind === "records"
                        ? "settings.import.dialog.refusedRecords"
                        : "settings.import.dialog.refusedFolders",
                      outcome.refused,
                    )}
                  </Alert>
                )}
                {outcome?.dropsOldest !== undefined && (
                  <Alert severity="warning" data-testid="settings-import-games-drops">
                    {t("settings.import.dialog.dropsOldest", {
                      count: outcome.dropsOldest,
                      max: IMPORT_CAPS.playedGames,
                    })}
                  </Alert>
                )}
              </Box>
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} data-testid="settings-import-cancel">
          {t("settings.import.dialog.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={!writable}
          onClick={() => onImport(choices)}
          data-testid="settings-import-run"
        >
          {t("settings.import.dialog.run")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ImportDialog;
