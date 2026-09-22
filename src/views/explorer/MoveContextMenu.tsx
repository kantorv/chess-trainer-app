import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import VerticalAlignTopRoundedIcon from "@mui/icons-material/VerticalAlignTopRounded";
import { useTranslation } from "react-i18next";
import {
  commentsAt,
  deleteFrom,
  findNode,
  isInSideLine,
  linePgn,
  makeMainline,
  pathTo,
  plyLabel,
  promoteVariation,
  setComments,
  subtreeCounts,
  type GameTree,
} from "../../lib/gameTree";
import { maskNodeSan, type PieceMask } from "../../lib/pieceMask";
import CommentDialog, { type CommentDraft } from "./CommentDialog";
import PlayChanceDialog, { type PlayChanceTarget } from "./PlayChanceDialog";
import type { MenuAnchor } from "../shared/moveContextMenu";

/** The move a menu was opened on, and where. */
export type MoveMenuTarget = { nodeId: string; anchor: MenuAnchor };

/**
 * **The variations explorer's move menu** (CTA-64) — lichess's right-click on
 * a move of the analysis board: promote the variation, make it the main line,
 * delete from here, copy the line's PGN — and, since CTA-69, add a comment to
 * the move (`CommentDialog`; `setComments`, appended after the ones it has),
 * and, on a move with alternatives, set the **play chances** of the branch
 * it belongs to (`PlayChanceDialog`; lichess-tools' `prc:N`,
 * `lib/playChance.ts`).
 *
 * Opened by `TreeMoveList` when its consumer passes `onEditTree`, at the
 * pointer (`anchorReference="anchorPosition"`). Every edit is a pure tree
 * operation from `lib/gameTree.ts` handed back through `onEditTree` — this
 * component never holds a tree of its own, so the edit lands where every other
 * change to the game lands (the core's `replaceTree`). Promote and Make main
 * line are offered only inside a side line, where they mean something.
 * Deleting asks first, saying how much goes; copying needs no confirmation and
 * reports whether the clipboard took it (the write needs a secure context and
 * the permission — `CopyableValue`'s rule).
 *
 * Chrome, so it mirrors under Hebrew like the rest of the panel; the move it
 * names is notation and keeps `dir="ltr"`.
 */
function MoveContextMenu({
  tree,
  target,
  open,
  onClose,
  onEditTree,
  playChances = true,
  mask,
}: {
  tree: GameTree;
  /** The last move a menu was opened on — kept while the menu fades out. */
  target: MoveMenuTarget | null;
  open: boolean;
  onClose: () => void;
  onEditTree: (next: GameTree) => void;
  /**
   * Offer *Play chances…* (on by default). A board nothing plays by chance on
   * — the Analysis Board (CTA-73) — turns it off.
   */
  playChances?: boolean;
  /** A masked board's costume (CTA-79): the move it names prints as coordinates when hidden. */
  mask?: PieceMask;
}) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState<string | null>(null);
  // What the last copy did — kept past the snackbar's close, for its fade.
  const [copied, setCopied] = useState<"copied" | "failed">("copied");
  const [copyNoticeOpen, setCopyNoticeOpen] = useState(false);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [chancesAt, setChancesAt] = useState<PlayChanceTarget | null>(null);

  // A target the tree no longer holds (an edit landed first) opens nothing.
  const node = target === null ? null : findNode(tree, target.nodeId);
  const sideLine = node !== null && isInSideLine(tree, node.id);
  // The branch the move is one of — its parent's continuations, or the start's.
  const branchParent = node === null ? null : (pathTo(tree, node.id).at(-2) ?? null);
  const branchSize =
    node === null ? 0 : branchParent === null ? tree.moves.length : branchParent.children.length;
  const deletingNode = deleting === null ? null : findNode(tree, deleting);
  const counts = deletingNode === null ? null : subtreeCounts(tree, deletingNode.id);

  const moveText = (at: typeof node) => {
    if (at === null) return "";
    const { number, isWhiteMove } = plyLabel(tree.startFen, at.ply);
    return `${number}${isWhiteMove ? "." : "…"} ${maskNodeSan(mask, at)}`;
  };

  // Built on each render, so the save edits the tree as it is then.
  const commentingNode = commenting === null ? null : findNode(tree, commenting);
  const commentDraft: CommentDraft | null =
    commentingNode === null
      ? null
      : {
          label: moveText(commentingNode),
          initial: "",
          onSave: (text) => {
            const next = setComments(tree, commentingNode.id, "comments", [
              ...commentsAt(tree, commentingNode.id, "comments"),
              text,
            ]);
            if (next !== tree) onEditTree(next);
          },
        };

  const edit = (operation: (tree: GameTree, id: string) => GameTree) => {
    if (node === null) return;
    onClose();
    const next = operation(tree, node.id);
    if (next !== tree) onEditTree(next);
  };

  const copy = async () => {
    if (node === null) return;
    const pgn = linePgn(tree, node.id);
    onClose();
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    setCopyNoticeOpen(true);
  };

  return (
    <>
      <Menu
        open={open && node !== null}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={target?.anchor}
        data-testid="move-menu"
        slotProps={{ list: { dense: true } }}
      >
        <ListSubheader sx={{ lineHeight: 2.5 }}>
          <span dir="ltr" data-testid="move-menu-move">
            {moveText(node)}
          </span>
        </ListSubheader>
        {sideLine && (
          <MenuItem data-testid="move-menu-promote" onClick={() => edit(promoteVariation)}>
            <ListItemIcon>
              <ArrowUpwardRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("moveMenu.promote")}</ListItemText>
          </MenuItem>
        )}
        {sideLine && (
          <MenuItem data-testid="move-menu-mainline" onClick={() => edit(makeMainline)}>
            <ListItemIcon>
              <VerticalAlignTopRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("moveMenu.makeMainline")}</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          data-testid="move-menu-delete"
          onClick={() => {
            if (node === null) return;
            setDeleting(node.id);
            onClose();
          }}
        >
          <ListItemIcon>
            <DeleteOutlineRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("moveMenu.deleteFrom")}</ListItemText>
        </MenuItem>
        <MenuItem
          data-testid="move-menu-comment"
          onClick={() => {
            if (node === null) return;
            setCommenting(node.id);
            onClose();
          }}
        >
          <ListItemIcon>
            <AddCommentOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("moveMenu.addComment")}</ListItemText>
        </MenuItem>
        {playChances && branchSize > 1 && (
          <MenuItem
            data-testid="move-menu-chances"
            onClick={() => {
              setChancesAt({ parentId: branchParent?.id ?? null });
              onClose();
            }}
          >
            <ListItemIcon>
              <CasinoOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("moveMenu.playChances")}</ListItemText>
          </MenuItem>
        )}
        <MenuItem data-testid="move-menu-copy" onClick={copy}>
          <ListItemIcon>
            <ContentCopyRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("moveMenu.copyPgn")}</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog
        open={deletingNode !== null}
        onClose={() => setDeleting(null)}
        data-testid="move-menu-delete-dialog"
      >
        <DialogTitle>
          {t("moveMenu.deleteTitle")}{" "}
          <span dir="ltr">{moveText(deletingNode)}</span>
        </DialogTitle>
        <DialogContent>
          <DialogContentText data-testid="move-menu-delete-summary">
            {counts !== null &&
              t("moveMenu.deleteSummary", {
                moves: t("moveMenu.moves", { count: counts.moves }),
                lines: t("moveMenu.lines", { count: counts.lines }),
              })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button data-testid="move-menu-delete-cancel" onClick={() => setDeleting(null)}>
            {t("moveMenu.cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            data-testid="move-menu-delete-confirm"
            onClick={() => {
              if (deletingNode !== null) onEditTree(deleteFrom(tree, deletingNode.id));
              setDeleting(null);
            }}
          >
            {t("moveMenu.delete")}
          </Button>
        </DialogActions>
      </Dialog>

      <CommentDialog draft={commentDraft} onClose={() => setCommenting(null)} />
      <PlayChanceDialog
        tree={tree}
        target={chancesAt}
        onClose={() => setChancesAt(null)}
        onEditTree={onEditTree}
      />

      <Snackbar
        open={copyNoticeOpen}
        autoHideDuration={3000}
        onClose={() => setCopyNoticeOpen(false)}
        message={t(`moveMenu.${copied}`)}
        data-testid="move-menu-copied"
      />
    </>
  );
}

export default MoveContextMenu;
