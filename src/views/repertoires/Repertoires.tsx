import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Checkbox from "@mui/material/Checkbox";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { downloadPgn } from "../../lib/pgnExport";
import {
  savedRepertoireSummary,
  type SavedRepertoire,
} from "../../lib/savedRepertoires";
import { removeSavedRepertoire } from "../../lib/savedRepertoireStore";
import { RightPanel } from "../main/rightPanel";
import SavedListExportBar from "../shared/SavedListExportBar";
import SavedListRemoveButton from "../shared/SavedListRemoveButton";
import SavedListViewToggle from "../shared/SavedListViewToggle";
import {
  SAVED_LIST_DEFAULT_VIEW,
  savedListDate,
  savedListGridSx,
  savedListLine,
  type SavedListView,
} from "../shared/savedList";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **Repertoires** (`/repertoires`) — the reader's own repertoires, newest
 * first, as rows or as preview boards at the library's two card sizes (CTA-61).
 *
 * It is `views/tools/analysis/saved/SavedAnalyses.tsx` again, over the same
 * saved-list machinery (`views/shared/savedList.ts` and the three
 * `SavedList*.tsx` beside it): the same toggle, the same export bar in the list
 * view only, the same delete control, the same scrolling region. What that
 * screen's header says holds here and is not repeated; the two differences:
 *
 * - **One destination.** A repertoire opens on its own board
 *   (`/repertoires/<id>`), and nowhere else — there is no single position to
 *   hand Play with Engine and no single game to hand Load PGN, since a
 *   repertoire is many lines.
 * - **A card previews where the repertoire branches.** Not the start, which
 *   every 1.e4 repertoire shares, and not any one line's end: the position the
 *   record's check found every line still agreeing on
 *   (`SavedRepertoire.previewFen`), so no card parses a move to draw itself.
 */

const previewOptions = (saved: SavedRepertoire): ChessboardOptions => ({
  id: `repertoires-preview-${saved.id}`,
  position: saved.previewFen,
  allowDragging: false,
  allowDrawingArrows: false,
  showNotation: false,
});

const boardPath = (saved: SavedRepertoire) =>
  `/repertoires/${encodeURIComponent(saved.id)}`;

/** The two caption lines both views print: the name, then its size and date. */
const useCaption = (saved: SavedRepertoire) => {
  const { t, i18n } = useTranslation();
  // A tag scan over the whole file — cheap, but an 800 KB file is worth not
  // rescanning on every checkbox toggle.
  const summary = useMemo(() => savedRepertoireSummary(saved), [saved]);
  return {
    primary: saved.name || t("repertoires.untitled"),
    secondary: savedListLine([
      t("repertoires.lines", { count: summary.lines }),
      summary.chapters > 0
        ? t("repertoires.chapters", { count: summary.chapters })
        : "",
      savedListDate(saved.updatedAt, i18n.language),
    ]),
  };
};

const ellipsis = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

function RepertoireRow({
  saved,
  checked,
  onToggle,
}: {
  saved: SavedRepertoire;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption(saved);

  return (
    <ListItem
      disableGutters
      data-testid={`repertoires-item-${saved.id}`}
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1.5,
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 12rem" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {primary}
        </Typography>
        <Typography variant="caption" sx={{ ...ellipsis, color: "text.secondary" }}>
          {secondary}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        <Button
          component={RouterLink}
          to={boardPath(saved)}
          size="small"
          variant="contained"
          data-testid={`repertoires-open-${saved.id}`}
        >
          {t("repertoires.open")}
        </Button>
        <SavedListRemoveButton
          id={saved.id}
          onRemove={removeSavedRepertoire}
          labelKey="repertoires"
          testIdPrefix="repertoires"
        />
        <Checkbox
          size="small"
          checked={checked}
          onChange={onToggle}
          slotProps={{ input: { "aria-label": t("repertoires.select") } }}
          data-testid={`repertoires-select-${saved.id}`}
        />
      </Box>
    </ListItem>
  );
}

function RepertoireCard({ saved }: { saved: SavedRepertoire }) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption(saved);

  return (
    <Card variant="outlined" data-testid={`repertoires-item-${saved.id}`}>
      {/* The board *is* the open button — the one thing on the card big
          enough to be worth clicking. */}
      <CardActionArea
        component={RouterLink}
        to={boardPath(saved)}
        data-testid={`repertoires-open-${saved.id}`}
        aria-label={t("repertoires.open")}
      >
        <Box sx={{ p: 1 }}>
          <Box sx={{ width: "100%", aspectRatio: "1 / 1" }}>
            <Chessboard options={previewOptions(saved)} />
          </Box>
        </Box>
      </CardActionArea>

      <Box sx={{ px: 1, pb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ ...ellipsis, fontWeight: 600, lineHeight: 1.3 }}>
            {primary}
          </Typography>
          <Typography variant="caption" sx={{ ...ellipsis, color: "text.secondary" }}>
            {secondary}
          </Typography>
        </Box>
        <SavedListRemoveButton
          id={saved.id}
          onRemove={removeSavedRepertoire}
          labelKey="repertoires"
          testIdPrefix="repertoires"
        />
      </Box>
    </Card>
  );
}

function Repertoires() {
  const { t } = useTranslation();
  const [view, setView] = useState<SavedListView>(SAVED_LIST_DEFAULT_VIEW);
  const repertoires = useSavedRepertoires();

  /*
    The picks, held as ids and read *through* the list, so one deleted — here
    or in another tab — falls out of the count rather than haunting it.
  */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = repertoires.filter((saved) => picked.has(saved.id));

  const togglePicked = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAll = () =>
    setPicked(
      selected.length === repertoires.length
        ? new Set()
        : new Set(repertoires.map((saved) => saved.id)),
    );

  return (
    <>
      <Box
        data-testid="repertoires-screen"
        sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box
          data-testid="repertoires-top-bar"
          sx={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            pb: 1.5,
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ minWidth: 0, marginInlineEnd: "auto" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {t("repertoires.title")}
            </Typography>
            <Typography
              data-testid="repertoires-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t("repertoires.count", { count: repertoires.length })}
            </Typography>
          </Box>

          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to="/repertoires/new"
            startIcon={<AddRoundedIcon fontSize="small" />}
            data-testid="repertoires-add"
          >
            {t("repertoires.add")}
          </Button>

          {view === "list" && repertoires.length > 0 && (
            <SavedListExportBar
              testIdPrefix="repertoires"
              labelKey="repertoires"
              checked={selected.length === repertoires.length}
              indeterminate={selected.length > 0 && selected.length < repertoires.length}
              onToggleAll={toggleAll}
              selectedCount={selected.length}
              onClearSelected={() => setPicked(new Set())}
              onDownload={() =>
                downloadPgn(
                  "chess-trainer-repertoires",
                  selected.map((saved) => saved.pgn),
                )
              }
            />
          )}

          <SavedListViewToggle
            value={view}
            onChange={(next) => {
              setView(next);
              setPicked(new Set());
            }}
            labelKey="repertoires"
            testIdPrefix="repertoires"
          />
        </Box>

        {repertoires.length === 0 ? (
          <Box data-testid="repertoires-body" sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <Typography
              data-testid="repertoires-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("repertoires.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="repertoires-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {repertoires.map((saved) => (
                <RepertoireRow
                  key={saved.id}
                  saved={saved}
                  checked={picked.has(saved.id)}
                  onToggle={() => togglePicked(saved.id)}
                />
              ))}
            </List>
          </Box>
        ) : (
          <Box data-testid="repertoires-grid" sx={savedListGridSx(view)}>
            {repertoires.map((saved) => (
              <RepertoireCard key={saved.id} saved={saved} />
            ))}
          </Box>
        )}
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("repertoires.hint")}
          </Typography>
          <Typography variant="body2" data-testid="repertoires-storage-note">
            {t("repertoires.storage")}
          </Typography>
        </Box>
      </RightPanel>
    </>
  );
}

export default Repertoires;
