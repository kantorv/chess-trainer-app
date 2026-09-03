import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import {
  Link as RouterLink,
  createSearchParams,
  useNavigate,
  useParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { asAppLanguage } from "../../../i18n";
import {
  findMateCategory,
  findMatePosition,
  localizedText,
  sideToMoveOf,
} from "../../../lib/matesCatalog";
import CopyableValue from "../../shared/CopyableValue";
import { RightPanel } from "../../main/rightPanel";

/**
 * One position from the library, on a board, with the three hand-offs.
 *
 * The board is read-only — this page is where a position is *looked at*; it is
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
 * board does not turn under the reader on the way over.
 */

function MateDetail() {
  const { t, i18n } = useTranslation();
  const { direction } = useTheme();
  const language = asAppLanguage(i18n.language);
  const navigate = useNavigate();
  const { category, id } = useParams<{ category: string; id: string }>();

  const found = findMateCategory(category);
  const position = findMatePosition(category, id);

  // An unknown category or id — and equally a real id asked for under the wrong
  // category — renders a message rather than a broken board.
  if (found === undefined || position === undefined) {
    return (
      <Box
        data-testid="mate-detail-not-found"
        sx={{ height: "100%", display: "grid", placeItems: "center", p: 2 }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            {t(
              found === undefined
                ? "mates.notFound.category"
                : "mates.notFound.position",
            )}
          </Typography>
          <Typography
            component={RouterLink}
            to={found === undefined ? "/mates/basic" : `/mates/${found.id}`}
            variant="body2"
            sx={{ color: "primary.main" }}
          >
            {found === undefined
              ? t("mates.notFound.back")
              : t("mates.detail.back", { category: t(found.labelKey) })}
          </Typography>
        </Box>
      </Box>
    );
  }

  const side = sideToMoveOf(position);
  const name = localizedText(position.name, language);
  const description = localizedText(position.description, language);

  const boardOptions: ChessboardOptions = {
    id: `mate-detail-${position.id}`,
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
      <Box data-testid="mate-detail-board" sx={{ height: "100%" }}>
        <Chessboard options={boardOptions} />
      </Box>

      <RightPanel>
        <Box
          component={RouterLink}
          to={`/mates/${found.id}`}
          data-testid="mate-detail-back"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            mb: 1.5,
            color: "text.secondary",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          {/*
            "Back" points at the start of the line, which is the right edge
            under Hebrew — so the glyph is mirrored with the direction. Read off
            `theme.direction` rather than written as a CSS declaration: the RTL
            emotion cache's stylis plugin flips paddings and `direction`, but it
            has nothing to say about a `transform`, so a declaration here would
            be a one-way flip that stayed wrong in the other language.
          */}
          <ArrowBackRoundedIcon
            fontSize="small"
            sx={{ transform: direction === "rtl" ? "scaleX(-1)" : "none" }}
          />
          {t("mates.detail.back", { category: t(found.labelKey) })}
        </Box>

        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {name}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
          {t(`mates.sideToMove.${side}`)}
        </Typography>

        {description !== "" && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            {description}
          </Typography>
        )}

        <Box sx={{ mt: 2 }}>
          <CopyableValue
            label={t("mates.detail.fen")}
            value={position.fen}
            testId="mate-fen"
          />
        </Box>

        <Stack spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={handOffTo("/tools/analysis")}
            data-testid="mate-open-analysis"
          >
            {t("mates.detail.openInAnalysis")}
          </Button>
          <Button
            variant="outlined"
            onClick={handOffTo("/engine/play")}
            data-testid="mate-play-engine"
          >
            {t("mates.detail.playWithEngine")}
          </Button>
          <Button
            variant="outlined"
            onClick={handOffTo("/tools/editor")}
            data-testid="mate-open-editor"
          >
            {t("mates.detail.openInEditor")}
          </Button>
        </Stack>
      </RightPanel>
    </>
  );
}

export default MateDetail;
