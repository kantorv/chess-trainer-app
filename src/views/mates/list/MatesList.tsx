import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { asAppLanguage } from "../../../i18n";
import {
  findMateCategory,
  localizedText,
  positionsInCategory,
  sideToMoveOf,
  type MatePosition,
} from "../../../lib/matesCatalog";
import { RightPanel } from "../../main/rightPanel";

/**
 * One category's positions, as cards.
 *
 * **One component, three routes.** `/mates/basic`, `/mates/advanced` and
 * `/mates/complex` all render this; the category is a route parameter, so
 * adding a fourth category is a data entry plus a folder/screen registration
 * and no work here at all. The screen knows nothing about JSON — everything it
 * reads comes through `lib/matesCatalog.ts`.
 *
 * A card deep-links to `/mates/<category>/<id>`. The sidebar's active state is
 * an exact path match by design (`"/"` is a prefix of every route), so the
 * category's entry does *not* stay lit while a detail page is open — the detail
 * screen carries its own way back rather than the shared renderer changing its
 * matching rule for this one section.
 */

/**
 * A card's preview board. Read-only: the position is a thing to look at here,
 * and it becomes a thing to play on the two screens the detail page hands it
 * to. Each board takes the position's own id, since `options.id` has to be
 * unique across the page and a category shows several at once.
 */
const previewOptions = (position: MatePosition): ChessboardOptions => ({
  id: `mate-preview-${position.id}`,
  position: position.fen,
  allowDragging: false,
  allowDrawingArrows: false,
  showNotation: false,
});

function MatesList() {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);
  const { category } = useParams<{ category: string }>();

  const found = findMateCategory(category);
  const positions = positionsInCategory(category);

  // An unknown category in the URL is a miss, not a crash: no board is
  // rendered, and the reader is pointed back at a category that exists.
  if (found === undefined) {
    return (
      <Box
        data-testid="mates-list-unknown-category"
        sx={{ height: "100%", display: "grid", placeItems: "center", p: 2 }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            {t("mates.notFound.category")}
          </Typography>
          <Typography
            component={RouterLink}
            to="/mates/basic"
            variant="body2"
            sx={{ color: "primary.main" }}
          >
            {t("mates.notFound.back")}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <>
      <Box
        data-testid="mates-list"
        sx={{
          height: "100%",
          // The shell hands this screen a square and nothing scrolls it, so the
          // grid scrolls itself — a category can hold more cards than fit.
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 2,
          alignContent: "start",
        }}
      >
        {positions.map((position) => (
          <Card key={position.id} variant="outlined">
            <CardActionArea
              component={RouterLink}
              to={`/mates/${position.category}/${position.id}`}
              data-testid={`mate-card-${position.id}`}
            >
              <Box sx={{ p: 1 }}>
                <Box sx={{ width: "100%", aspectRatio: "1 / 1" }}>
                  <Chessboard options={previewOptions(position)} />
                </Box>
              </Box>
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {localizedText(position.name, language)}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {t(`mates.sideToMove.${sideToMoveOf(position)}`)}
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      <RightPanel>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t(found.labelKey)}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          {positions.length === 0
            ? t("mates.list.empty")
            : t("mates.list.count", { count: positions.length })}
        </Typography>
        {positions.length > 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 2 }}>
            {t("mates.list.hint")}
          </Typography>
        )}
      </RightPanel>
    </>
  );
}

export default MatesList;
