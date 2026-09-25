import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import { useTranslation } from "react-i18next";
import { findNode, setNags, type GameTree } from "../../lib/gameTree";
import {
  NAG_SECTIONS,
  isNagChoiceActive,
  toggleNag,
  type NagSection,
} from "../../lib/moveAnnotations";
import NagGlyphs from "../shared/NagGlyphs";

/** The move the dialog is open on, and how the menu prints it. */
export type NagTarget = { nodeId: string; label: string };

/**
 * **Annotate a move** (CTA-97) — the move menu's *Add annotation…*: the NAG
 * glyphs in three tabs, one per section of `lib/moveAnnotations.ts`'s table,
 * each glyph a toggle with its meaning.
 *
 * It holds no draft: **each toggle is an edit**, `setNags` under the section's
 * selection rule (`toggleNag` — lichess's: one move assessment, one
 * evaluation, any number of features), handed straight to `onEditTree` like
 * every other edit, so the list behind the dialog shows the glyph at once and
 * the Save strip offers to keep it. What is selected is read off the tree it
 * is given on each render, which is the tree after the last toggle.
 *
 * The move and its glyphs are notation and keep `dir="ltr"`; the meanings are
 * chrome and mirror.
 */
function NagDialog({
  tree,
  target,
  onClose,
  onEditTree,
}: {
  tree: GameTree;
  target: NagTarget | null;
  onClose: () => void;
  onEditTree: (next: GameTree) => void;
}) {
  if (target === null) return null;
  return (
    <OpenNagDialog tree={tree} target={target} onClose={onClose} onEditTree={onEditTree} />
  );
}

function OpenNagDialog({
  tree,
  target,
  onClose,
  onEditTree,
}: {
  tree: GameTree;
  target: NagTarget;
  onClose: () => void;
  onEditTree: (next: GameTree) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<NagSection>("move");
  // A move the tree no longer holds (an edit landed elsewhere) closes nothing,
  // but offers nothing to toggle either.
  const node = findNode(tree, target.nodeId);
  const nags = node?.nags ?? [];
  const section = NAG_SECTIONS.find((entry) => entry.section === tab) ?? NAG_SECTIONS[0];

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" data-testid="nag-dialog">
      <DialogTitle>
        {t("nagDialog.title")}{" "}
        <span dir="ltr" data-testid="nag-dialog-move" style={{ unicodeBidi: "isolate" }}>
          {target.label}
          <NagGlyphs nags={node?.nags} testId="nag-dialog-glyphs" />
        </span>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, value: NagSection) => setTab(value)}
        variant="fullWidth"
        sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
      >
        {NAG_SECTIONS.map(({ section: id }) => (
          <Tab
            key={id}
            value={id}
            label={t(`nagDialog.tabs.${id}`)}
            data-testid={`nag-dialog-tab-${id}`}
            sx={{ minHeight: 48, px: 1 }}
          />
        ))}
      </Tabs>
      <DialogContent>
        <DialogContentText variant="body2" sx={{ mb: 1.5 }}>
          {t("nagDialog.help")}
        </DialogContentText>
        <Box
          role="group"
          aria-label={t(`nagDialog.tabs.${section.section}`)}
          data-testid={`nag-dialog-panel-${section.section}`}
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 1fr))",
            gap: 1,
          }}
        >
          {section.choices.map((choice) => (
            <ToggleButton
              key={choice.id}
              value={choice.id}
              size="small"
              color="primary"
              disabled={node === null}
              selected={isNagChoiceActive(nags, choice)}
              data-testid={`nag-dialog-choice-${choice.codes[0]}`}
              onChange={() => {
                if (node === null) return;
                const next = setNags(tree, node.id, toggleNag(nags, section.section, choice));
                if (next !== tree) onEditTree(next);
              }}
              sx={{ justifyContent: "flex-start", gap: 1.5, textTransform: "none" }}
            >
              <Box
                component="span"
                dir="ltr"
                sx={{
                  minWidth: "2ch",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontWeight: 700,
                  unicodeBidi: "isolate",
                }}
              >
                {choice.glyph}
              </Box>
              <Box component="span" sx={{ textAlign: "start" }}>
                {t(`nagDialog.meaning.${choice.id}`)}
              </Box>
            </ToggleButton>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button data-testid="nag-dialog-close" onClick={onClose}>
          {t("nagDialog.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default NagDialog;
