import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createSearchParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { asAppLanguage } from "../../i18n";
import {
  localizedText,
  sideToMoveOf,
  type LibraryCategory,
  type LibraryPosition,
} from "../../lib/libraryCatalog";
import CopyableValue from "../shared/CopyableValue";
import { RightPanel } from "../main/rightPanel";
import BackToCategory from "./BackToCategory";
import type { LibrarySection } from "./section";

/**
 * One **position** from a library, on a board, with the three hand-offs — the
 * body `LibraryDetail` renders for an item of that kind.
 *
 * The board is read-only: this page is where a position is *looked at*; it is
 * played on `/engine/play`, analysed on `/tools/analysis` and taken apart on
 * `/tools/editor`, and all three are one click away. The hand-off is the
 * existing mechanism verbatim: the FEN crosses as a **query parameter**, which
 * is the only carrier that survives being bookmarked, shared and reloaded, and
 * every destination validates it with `parseFen` and takes it as *initial*
 * state. Nothing new was built for it — a third destination is a third argument
 * to `handOffTo`, and nothing else.
 *
 * **The board faces the side to move.** A position is something you are about
 * to answer, so you look at it from the side that has to move — the same rule
 * the three board screens follow when a position arrives. Here it also lines up
 * with what `/engine/play` will do with the very same FEN a click later, so the
 * board does not turn under the reader on the way over. For a defensive endgame
 * that means opening on the *defending* side, which is exactly right: the
 * defence is what those positions are about.
 */

type Props = {
  section: LibrarySection;
  category: LibraryCategory;
  position: LibraryPosition;
};

function LibraryPositionDetail({ section, category, position }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);
  const navigate = useNavigate();

  const side = sideToMoveOf(position);
  const name = localizedText(position.name, language);
  const description = localizedText(position.description, language);

  const boardOptions: ChessboardOptions = {
    id: `${section.itemTestId}-detail-${position.id}`,
    position: position.fen,
    boardOrientation: side === "b" ? "black" : "white",
    allowDragging: false,
  };

  /** Every hand-off, and the only interface between this screen and those three. */
  const handOffTo = (pathname: string) => () =>
    navigate({
      pathname,
      search: createSearchParams({ fen: position.fen }).toString(),
    });

  return (
    <>
      <Box data-testid={`${section.itemTestId}-detail-board`} sx={{ height: "100%" }}>
        <Chessboard options={boardOptions} />
      </Box>

      <RightPanel>
        <BackToCategory section={section} category={category} />

        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {name}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
          {t(`${section.chromeKey}.sideToMove.${side}`)}
        </Typography>

        {description !== "" && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            {description}
          </Typography>
        )}

        <Box sx={{ mt: 2 }}>
          <CopyableValue
            label={t(`${section.chromeKey}.detail.fen`)}
            value={position.fen}
            testId={`${section.itemTestId}-fen`}
          />
        </Box>

        <Stack spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={handOffTo("/tools/analysis")}
            data-testid={`${section.itemTestId}-open-analysis`}
          >
            {t(`${section.chromeKey}.detail.openInAnalysis`)}
          </Button>
          <Button
            variant="outlined"
            onClick={handOffTo("/engine/play")}
            data-testid={`${section.itemTestId}-play-engine`}
          >
            {t(`${section.chromeKey}.detail.playWithEngine`)}
          </Button>
          <Button
            variant="outlined"
            onClick={handOffTo("/tools/editor")}
            data-testid={`${section.itemTestId}-open-editor`}
          >
            {t(`${section.chromeKey}.detail.openInEditor`)}
          </Button>
        </Stack>
      </RightPanel>
    </>
  );
}

export default LibraryPositionDetail;
