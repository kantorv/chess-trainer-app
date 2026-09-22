import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { findNode, plyLabel, type GameTree, type VariationNode } from "../../lib/gameTree";
import {
  formatPercent,
  linesWithin,
  playChanceOf,
  playChances,
  setPlayChances,
} from "../../lib/playChance";

/** Which branch the dialog is open on: the position the moves are played from. */
export type PlayChanceTarget = { parentId: string | null };

/**
 * **Set the play chances at a branch** (CTA-69) — every move the tree has at
 * one position, each with a percentage field (empty: automatic), its line
 * count, and the chance the trainer will play it, worked out live by the
 * same rules the trainer uses (`playChances`, `lib/playChance.ts`). Opened
 * from the move menu's *Play chances…* on any move of a branch.
 *
 * It is set **per position**, not per move, on purpose: lichess-tools reads
 * a `prc` only on the branch's own moves, and its users' classic mistake is
 * writing one on the move before the branch. A dialog over the branch
 * cannot put it anywhere else. Saving writes `prc:N` into each move's
 * comment (`setPlayChances`) and hands the tree back through `onEditTree` —
 * a session change like any other. The comment textarea still takes a typed
 * `prc:40`: it is the same text.
 */
function PlayChanceDialog({
  tree,
  target,
  onClose,
  onEditTree,
}: {
  tree: GameTree;
  target: PlayChanceTarget | null;
  onClose: () => void;
  onEditTree: (next: GameTree) => void;
}) {
  if (target === null) return null;
  const parent = target.parentId === null ? null : findNode(tree, target.parentId);
  const moves = target.parentId === null ? tree.moves : (parent?.children ?? []);
  if (moves.length === 0) return null;
  return (
    <OpenPlayChanceDialog
      tree={tree}
      parent={parent}
      moves={moves}
      onClose={onClose}
      onEditTree={onEditTree}
    />
  );
}

/** A field's text as a mark: empty is none, anything else a 0–100 number. */
const markOfText = (text: string): number | null | "invalid" => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : "invalid";
};

function OpenPlayChanceDialog({
  tree,
  parent,
  moves,
  onClose,
  onEditTree,
}: {
  tree: GameTree;
  /** The move the branch follows; `null` is the start position. */
  parent: VariationNode | null;
  moves: readonly VariationNode[];
  onClose: () => void;
  onEditTree: (next: GameTree) => void;
}) {
  const { t } = useTranslation();
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(
    () =>
      new Map(
        moves.map((node) => {
          const mark = playChanceOf(node);
          return [node.id, mark === undefined ? "" : formatPercent(mark)];
        }),
      ),
  );

  const marks = useMemo(
    () => new Map(moves.map((node) => [node.id, markOfText(texts.get(node.id) ?? "")])),
    [moves, texts],
  );
  const invalid = [...marks.values()].some((mark) => mark === "invalid");
  const chances = useMemo(
    () =>
      invalid
        ? undefined
        : playChances(moves, (node) => {
            const mark = marks.get(node.id);
            return typeof mark === "number" ? mark : undefined;
          }),
    [moves, marks, invalid],
  );
  const markedTotal = [...marks.values()].reduce<number>(
    (sum, mark) => sum + (typeof mark === "number" ? mark : 0),
    0,
  );

  const label = (node: VariationNode) => {
    const { number, isWhiteMove } = plyLabel(tree.startFen, node.ply);
    return `${number}${isWhiteMove ? "." : "…"} ${node.san}`;
  };

  const save = () => {
    if (invalid) return;
    const values = new Map(
      moves.map((node) => {
        const mark = marks.get(node.id);
        return [node.id, typeof mark === "number" ? mark : null] as const;
      }),
    );
    const next = setPlayChances(tree, values);
    if (next !== tree) onEditTree(next);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid="play-chance-dialog">
      <DialogTitle>
        {parent === null ? (
          t("playChance.titleStart")
        ) : (
          <>
            {t("playChance.title")}{" "}
            <span dir="ltr" data-testid="play-chance-after">
              {label(parent)}
            </span>
          </>
        )}
      </DialogTitle>
      <DialogContent>
        <DialogContentText variant="body2" sx={{ mb: 1.5 }}>
          {t("playChance.help")}
        </DialogContentText>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 7rem auto auto",
            alignItems: "center",
            columnGap: 1.5,
            rowGap: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("playChance.move")}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("playChance.mark")}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("playChance.lines")}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "end" }}>
            {t("playChance.chance")}
          </Typography>
          {moves.map((node, index) => {
            const mark = marks.get(node.id);
            return (
              <Box key={node.id} sx={{ display: "contents" }}>
                <Typography
                  variant="body2"
                  dir="ltr"
                  sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", unicodeBidi: "isolate" }}
                >
                  {node.san}
                </Typography>
                <TextField
                  size="small"
                  value={texts.get(node.id) ?? ""}
                  onChange={(event) =>
                    setTexts((current) => new Map(current).set(node.id, event.target.value))
                  }
                  placeholder={t("playChance.auto")}
                  error={mark === "invalid"}
                  slotProps={{
                    htmlInput: {
                      inputMode: "decimal",
                      "data-testid": `play-chance-input-${node.san}`,
                      "aria-label": `${t("playChance.mark")} ${node.san}`,
                    },
                    input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                  }}
                />
                <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
                  {linesWithin(node)}
                </Typography>
                <Typography
                  variant="body2"
                  data-testid={`play-chance-result-${node.san}`}
                  sx={{ textAlign: "end", fontWeight: 600 }}
                >
                  {chances === undefined ? "—" : `${Math.round((chances[index] ?? 0) * 100)}%`}
                </Typography>
              </Box>
            );
          })}
        </Box>
        <Typography
          variant="caption"
          data-testid="play-chance-total"
          sx={{ display: "block", mt: 1.5, color: invalid ? "error.main" : "text.secondary" }}
        >
          {invalid
            ? t("playChance.invalid")
            : t("playChance.total", { total: formatPercent(markedTotal) })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button data-testid="play-chance-cancel" onClick={onClose}>
          {t("playChance.cancel")}
        </Button>
        <Button variant="contained" data-testid="play-chance-save" disabled={invalid} onClick={save}>
          {t("playChance.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default PlayChanceDialog;
