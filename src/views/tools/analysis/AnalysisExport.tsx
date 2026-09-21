import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { useTranslation } from "react-i18next";

import { treeToPgn, type GameTree, type PgnExportOptions } from "../../../lib/gameTree";
import { downloadPgn } from "../../../lib/pgnExport";
import CopyableValue from "../../shared/CopyableValue";

/**
 * **The Export tab** (CTA-73) — the position on screen as FEN, and the tree
 * as PGN to copy or download, with what the PGN keeps chosen here: comments,
 * NAGs, side lines (`treeToPgn`'s `PgnExportOptions`; all on by default, the
 * tree as it is). The options are the tab's own state — an export is a
 * one-off, not a setting of the analysis.
 */
function AnalysisExport({
  fen,
  tree,
  fileStem,
}: {
  fen: string;
  tree: GameTree;
  /** The download's file name, before the date — the analysis' name, slugified. */
  fileStem: string;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Required<PgnExportOptions>>({
    comments: true,
    nags: true,
    variations: true,
  });
  const pgn = useMemo(() => treeToPgn(tree, options), [tree, options]);

  const toggle = (key: keyof PgnExportOptions) => (
    <FormControlLabel
      key={key}
      control={
        <Switch
          size="small"
          checked={options[key]}
          data-testid={`analysis-export-${key}`}
          onChange={(event) =>
            setOptions((current) => ({ ...current, [key]: event.target.checked }))
          }
        />
      }
      label={t(`analysis.export.${key}`)}
    />
  );

  return (
    <Box
      data-testid="analysis-export"
      sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}
    >
      <CopyableValue
        label={t("analysis.position.currentFen")}
        value={fen}
        testId="analysis-export-fen"
      />
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("analysis.export.include")}
        </Typography>
        <FormGroup>
          {toggle("comments")}
          {toggle("nags")}
          {toggle("variations")}
        </FormGroup>
      </Box>
      <CopyableValue
        label={t("analysis.position.currentPgn")}
        value={pgn}
        testId="analysis-export-pgn"
      />
      <Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadRoundedIcon fontSize="small" />}
          onClick={() => downloadPgn(fileStem, [pgn])}
          data-testid="analysis-export-download"
        >
          {t("analysis.export.download")}
        </Button>
      </Box>
    </Box>
  );
}

export default AnalysisExport;
