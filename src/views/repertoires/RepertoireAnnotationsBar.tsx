import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import {
  isMoveMark,
  nagGlyph,
  type PositionAnnotations,
  type ReadComment,
} from "../../lib/moveAnnotations";

/**
 * **What the PGN says here** (CTA-69) — the block the player shows above its
 * footer, where the changes strip sits, while the position on screen carries
 * an annotation: the move with its marks, the comment opening its variation,
 * the comments after it, and the attributes read out of them (an engine's
 * eval and depth, a `[%clk]`, …) as `key value` chips.
 *
 * Presentational: `annotationsAt` (`lib/moveAnnotations.ts`) decides what is
 * there and the player passes nothing when there is nothing. The block
 * scrolls itself past a few lines, so a long note does not push the board
 * controls off the panel — the footer is fixed, not the scrolling region.
 *
 * A comment is prose in whatever language it was written in, so each
 * paragraph takes `dir="auto"`; an attribute's value is pinned LTR by the
 * attribute (a signed score in an RTL flow has its sign migrate), never CSS —
 * the root `CLAUDE.md`'s rule.
 */
function RepertoireAnnotationsBar({
  testId,
  label,
  annotations,
}: {
  testId: string;
  /** Where the reader is — the move as the list prints it, or the start. */
  label: string;
  annotations: PositionAnnotations;
}) {
  const { t } = useTranslation();
  const marks = annotations.nags.filter(isMoveMark).map(nagGlyph).join("");
  const assessments = annotations.nags.filter((nag) => !isMoveMark(nag));

  return (
    <Box
      data-testid={testId}
      role="region"
      aria-label={t("repertoires.annotations.title")}
      sx={{
        mb: 1,
        px: 1,
        py: 0.75,
        border: "1px solid",
        borderColor: "info.main",
        borderRadius: 1,
        bgcolor: "background.paper",
        maxHeight: 180,
        overflowY: "auto",
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {t("repertoires.annotations.title")}
        <Typography
          component="span"
          variant="body2"
          dir="ltr"
          data-testid={`${testId}-move`}
          sx={{
            color: "text.secondary",
            fontWeight: 400,
            marginInlineStart: 1,
            unicodeBidi: "isolate",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {`${label}${marks}`}
        </Typography>
        {assessments.map((nag) => (
          <Typography
            key={nag}
            component="span"
            variant="body2"
            data-testid={`${testId}-nag-${nag}`}
            sx={{ marginInlineStart: 0.75 }}
          >
            {nagGlyph(nag)}
          </Typography>
        ))}
      </Typography>

      {annotations.before.length > 0 && (
        <Box data-testid={`${testId}-before`} sx={{ mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("repertoires.annotations.before")}
          </Typography>
          {annotations.before.map((comment, index) => (
            <Comment key={index} comment={comment} testId={`${testId}-before-${index}`} italic />
          ))}
        </Box>
      )}
      {annotations.after.map((comment, index) => (
        <Comment key={index} comment={comment} testId={`${testId}-after-${index}`} />
      ))}
    </Box>
  );
}

/** One comment: its paragraphs, then its attributes as chips. */
function Comment({
  comment,
  testId,
  italic = false,
}: {
  comment: ReadComment;
  testId: string;
  italic?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Box data-testid={testId} sx={{ mt: 0.5 }}>
      {comment.paragraphs.map((paragraph, index) => (
        <Typography
          key={index}
          variant="body2"
          dir="auto"
          sx={{ fontStyle: italic ? "italic" : undefined, "& + &": { mt: 0.5 } }}
        >
          {paragraph}
        </Typography>
      ))}
      {comment.attributes.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
          {comment.attributes.map(({ key, value }, index) => (
            <Chip
              key={index}
              size="small"
              variant="outlined"
              data-testid={`${testId}-attr-${key}`}
              label={
                <>
                  {t(`repertoires.annotations.keys.${key}`, { defaultValue: key })}{" "}
                  <Box component="bdi" dir="ltr" sx={{ fontWeight: 600 }}>
                    {value}
                  </Box>
                </>
              }
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default RepertoireAnnotationsBar;
