import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import {
  MAX_ANALYSIS_DESCRIPTION_CHARS,
  type SavedAnalysis,
  type SavedAnalysisSettingsEdit,
} from "../../../../lib/savedAnalyses";
import { updateSavedAnalysisSettings } from "../../../../lib/savedAnalysisStore";
import FolderPicker from "../../../shared/folders/FolderPicker";
import { RightPanel } from "../../../main/rightPanel";
import { useAnalysisFolders } from "./useAnalysisFolders";
import { useSavedAnalyses } from "./useSavedAnalyses";

/**
 * **A saved analysis' settings** (`/tools/analysis/saved/<id>/settings`,
 * CTA-73) — the repertoire settings screen's shape over an analysis: one
 * draft, three sections, written on Save.
 *
 * - **General** — the title (the record's `name`) and a description.
 * - **Board** — the side the board opens facing (`orientation`) and whether
 *   it opens drawing the next-move arrows (`showArrows`). A flip or the
 *   arrows switch on the board is the session's; these are what it opens on.
 * - **Folder** — where it is filed: Unfiled, or any folder of the nested tree.
 *
 * Save writes the whole draft at once (`updateSavedAnalysisSettings`, in
 * place, so the analysis keeps its place in the list); Cancel drops it. Both
 * go back where the reader came from — the router state a link here passes —
 * else to the analysis on its board.
 */
function AnalysisSettingsScreen() {
  const { id } = useParams();
  const saved = useSavedAnalyses().find((row) => row.id === id);
  const { t } = useTranslation();

  if (saved === undefined) {
    return (
      <Box data-testid="analysis-settings-missing" sx={{ py: 4, textAlign: "center" }}>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {t("analysis.settingsScreen.missing")}
        </Typography>
        <Button
          component={RouterLink}
          to="/tools/analysis/saved"
          variant="outlined"
          size="small"
        >
          {t("analysis.settingsScreen.back")}
        </Button>
      </Box>
    );
  }
  // Keyed, so the draft is seeded from this record and no other.
  return <SettingsForm key={saved.id} saved={saved} />;
}

/** One labelled section of the form. */
function Section({
  id,
  label,
  first = false,
  children,
}: {
  id: string;
  label: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <Box data-testid={`analysis-settings-section-${id}`}>
      {!first && <Divider sx={{ mb: 2 }} />}
      <Typography variant="overline" sx={{ display: "block", color: "text.secondary", mb: 1 }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</Box>
    </Box>
  );
}

function SettingsForm({ saved }: { saved: SavedAnalysis }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const folders = useAnalysisFolders();

  // Where Save and Cancel go: the screen that linked here, else the board.
  const from = (location.state as { from?: unknown } | null)?.from;
  const back =
    typeof from === "string"
      ? from
      : `/tools/analysis?analysis=${encodeURIComponent(saved.id)}`;

  // A folder that is gone reads as Unfiled, as the list reads it.
  const [draft, setDraft] = useState<SavedAnalysisSettingsEdit>(() => ({
    name: saved.name,
    description: saved.description,
    orientation: saved.orientation,
    showArrows: saved.showArrows,
    folderId:
      saved.folderId !== null && folders.some((folder) => folder.id === saved.folderId)
        ? saved.folderId
        : null,
  }));
  const [failed, setFailed] = useState(false);
  const change = (patch: Partial<SavedAnalysisSettingsEdit>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    if (updateSavedAnalysisSettings(saved.id, draft) !== undefined) {
      setFailed(true);
      return;
    }
    navigate(back);
  };

  return (
    <>
      <Box
        data-testid="analysis-settings-screen"
        sx={{
          height: "100%",
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t("analysis.settingsScreen.title")}
          </Typography>
          <Typography variant="body2" dir="auto" sx={{ color: "text.secondary" }} noWrap>
            {saved.name || t("savedAnalyses.untitled")}
          </Typography>
        </Box>

        <Section id="general" label={t("analysis.settingsScreen.sections.general")} first>
          <TextField
            size="small"
            label={t("analysis.settingsScreen.name")}
            placeholder={t("savedAnalyses.untitled")}
            value={draft.name}
            onChange={(event) => change({ name: event.target.value })}
            slotProps={{ htmlInput: { "data-testid": "analysis-settings-name", dir: "auto" } }}
          />
          <TextField
            multiline
            minRows={3}
            maxRows={10}
            label={t("analysis.settingsScreen.description")}
            helperText={t("analysis.settingsScreen.descriptionHelp")}
            value={draft.description}
            onChange={(event) => change({ description: event.target.value })}
            slotProps={{
              htmlInput: {
                "data-testid": "analysis-settings-description",
                maxLength: MAX_ANALYSIS_DESCRIPTION_CHARS,
                dir: "auto",
              },
            }}
          />
        </Section>

        <Section id="board" label={t("analysis.settingsScreen.sections.board")}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
              {t("analysis.settingsScreen.color")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={draft.orientation}
              // `null` is a click on the pressed button: a side is always chosen.
              onChange={(_event, next: "white" | "black" | null) => {
                if (next !== null) change({ orientation: next });
              }}
              aria-label={t("analysis.settingsScreen.color")}
            >
              {(["white", "black"] as const).map((color) => (
                <ToggleButton
                  key={color}
                  value={color}
                  data-testid={`analysis-settings-color-${color}`}
                  sx={{ textTransform: "none", px: 2 }}
                >
                  {t(`analysis.settingsScreen.${color}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.75 }}>
              {t("analysis.settingsScreen.colorHelp")}
            </Typography>
          </Box>
          <Box>
            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Switch
                  checked={draft.showArrows}
                  onChange={(event) => change({ showArrows: event.target.checked })}
                  slotProps={{ input: { "data-testid": "analysis-settings-show-arrows" } as object }}
                />
              }
              label={t("analysis.settings.arrows")}
            />
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              {t("analysis.settingsScreen.arrowsHelp")}
            </Typography>
          </Box>
        </Section>

        <Section id="folder" label={t("analysis.settingsScreen.sections.folder")}>
          <FolderPicker
            labelKey="savedAnalyses"
            idPrefix="analysis-settings-folder"
            folders={folders}
            value={draft.folderId}
            onChange={(folderId) => change({ folderId })}
            noneLabel={t("savedAnalyses.folder.unfiled")}
            noneTestId="analysis-settings-folder-unfiled"
          />
        </Section>

        {failed && (
          <Alert severity="error" data-testid="analysis-settings-problem">
            {t("analysis.changes.problem.storage")}
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 1, pb: 1 }}>
          <Button variant="contained" onClick={save} data-testid="analysis-settings-save">
            {t("analysis.settingsScreen.save")}
          </Button>
          <Button component={RouterLink} to={back} data-testid="analysis-settings-cancel">
            {t("analysis.settingsScreen.cancel")}
          </Button>
        </Box>
      </Box>

      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("savedAnalyses.storage")}
        </Typography>
      </RightPanel>
    </>
  );
}

export default AnalysisSettingsScreen;
