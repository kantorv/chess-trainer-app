import { useState, type ComponentType } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import type { RepertoireFolder } from "../../lib/savedRepertoireFolders";
import type { SavedRepertoire } from "../../lib/savedRepertoires";
import { fileRepertoire, updateRepertoireSettings } from "../../lib/savedRepertoireStore";
import { RightPanel } from "../main/rightPanel";
import {
  BoardSection,
  FolderSection,
  GeneralSection,
  type RepertoireSettingsDraft,
  type RepertoireSettingsSectionProps,
} from "./RepertoireSettingsSections";
import { ReadingRepertoires } from "./RepertoireBoard";
import { useRepertoireFolders } from "./useRepertoireFolders";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **A repertoire's settings** (`/repertoires/<id>/settings`) — its title,
 * description and main color, the folder it is filed under (CTA-68 — the one
 * place a repertoire moves between folders), and whatever option comes next.
 *
 * The screen is a **list of sections** over **one draft**: each section
 * (`RepertoireSettingsSections.tsx`) edits the draft through a patch, and
 * nothing is written until Save, which writes the whole draft at once through
 * `updateRepertoireSettings` (and the folder through `fileRepertoire`) — in
 * place, so the repertoire keeps its place in the list. Cancel drops the draft. Both go back where the reader came from
 * (the router state a link here passes), or to the repertoire's board.
 *
 * Adding an option never touches this file unless it needs a new *section*;
 * then it is one entry in {@link SECTIONS}.
 */

/** The sections, top to bottom. A new group of options is one entry here. */
const SECTIONS: readonly {
  id: string;
  labelKey: string;
  Body: ComponentType<RepertoireSettingsSectionProps>;
}[] = [
  { id: "general", labelKey: "repertoires.settings.sections.general", Body: GeneralSection },
  { id: "board", labelKey: "repertoires.settings.sections.board", Body: BoardSection },
  { id: "folder", labelKey: "repertoires.settings.sections.folder", Body: FolderSection },
];

function RepertoireSettingsScreen() {
  const { id } = useParams();
  const repertoires = useSavedRepertoires();
  // The draft is seeded from the folders too, so both reads must have landed.
  const folders = useRepertoireFolders();
  const { t } = useTranslation();
  if (repertoires === undefined || folders === undefined) return <ReadingRepertoires />;
  const saved = repertoires.find((row) => row.id === id);

  if (saved === undefined) {
    return (
      <Box data-testid="repertoire-settings-missing" sx={{ py: 4, textAlign: "center" }}>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {t("repertoires.detail.missing")}
        </Typography>
        <Button component={RouterLink} to="/repertoires" variant="outlined" size="small">
          {t("repertoires.detail.back")}
        </Button>
      </Box>
    );
  }
  // Keyed, so the draft is seeded from this record and no other.
  return <SettingsForm key={saved.id} saved={saved} folders={folders} />;
}

function SettingsForm({
  saved,
  folders,
}: {
  saved: SavedRepertoire;
  folders: readonly RepertoireFolder[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Where Save and Cancel go: the screen that linked here, else the board.
  const from = (location.state as { from?: unknown } | null)?.from;
  const back =
    typeof from === "string" ? from : `/repertoires/${encodeURIComponent(saved.id)}`;

  // A `folderId` naming a folder that is gone reads as Unfiled, as the list
  // reads it, so the tree preselects what the reader actually sees.
  const [draft, setDraft] = useState<RepertoireSettingsDraft>(() => ({
    name: saved.name,
    settings: saved.settings,
    folderId:
      saved.folderId !== null && folders.some((folder) => folder.id === saved.folderId)
        ? saved.folderId
        : null,
  }));
  const [failed, setFailed] = useState(false);

  const onChange: RepertoireSettingsSectionProps["onChange"] = (patch) =>
    setDraft((current) => ({
      name: patch.name ?? current.name,
      settings: { ...current.settings, ...patch.settings },
      // `null` is a real choice (Unfiled), so absence is told by `undefined`.
      folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
    }));

  const save = async () => {
    const problem =
      (await updateRepertoireSettings(saved.id, draft.name.trim(), {
        ...draft.settings,
        description: draft.settings.description.trim(),
      })) ?? (await fileRepertoire(saved.id, draft.folderId));
    if (problem !== undefined) {
      setFailed(true);
      return;
    }
    navigate(back);
  };

  return (
    <>
      <Box
        data-testid="repertoire-settings-screen"
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
            {t("repertoires.settings.title")}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }} noWrap>
            {saved.name || t("repertoires.untitled")}
          </Typography>
        </Box>

        {SECTIONS.map(({ id, labelKey, Body }, index) => (
          <Box key={id} data-testid={`repertoire-settings-section-${id}`}>
            {index > 0 && <Divider sx={{ mb: 2 }} />}
            <Typography
              variant="overline"
              sx={{ display: "block", color: "text.secondary", mb: 1 }}
            >
              {t(labelKey)}
            </Typography>
            <Body draft={draft} onChange={onChange} />
          </Box>
        ))}

        {failed && (
          <Alert severity="error" data-testid="repertoire-settings-problem">
            {t("repertoires.settings.problem")}
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 1, pb: 1 }}>
          <Button variant="contained" onClick={() => void save()} data-testid="repertoire-settings-save">
            {t("repertoires.settings.save")}
          </Button>
          <Button
            component={RouterLink}
            to={back}
            data-testid="repertoire-settings-cancel"
          >
            {t("repertoires.settings.cancel")}
          </Button>
        </Box>
      </Box>

      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("repertoires.storage")}
        </Typography>
      </RightPanel>
    </>
  );
}

export default RepertoireSettingsScreen;
