import { styled } from "@mui/material/styles";
import { isMoveMark, nagGlyph, nagsInPrintOrder, nagTone } from "../../lib/moveAnnotations";
import { nagToneStyles } from "./nagToneSx";

/*
  Two styled elements rather than an `sx` each, for the reason
  `VariationLine.tsx` gives: a glyph can sit on thousands of tokens, and a
  styled element's class is computed once and shared.
*/
const Glyphs = styled("span")({ whiteSpace: "nowrap" });

const Glyph = styled("span")(({ theme }) => ({
  fontWeight: 700,
  // An evaluation or a feature stands a little apart; a move mark is part of the move.
  '&[data-mark="false"]': { marginInlineStart: "0.2em" },
  ...nagToneStyles(theme, "color", "&"),
  // On the current move the highlight repaints the text; a mark's colour on
  // the primary fill would not read, so it takes the highlight's (the class
  // doubled to outrank the tone rules).
  '[aria-current="true"] &&[data-tone]': { color: "inherit" },
}));

/**
 * **A move's annotation glyphs** (CTA-97), as the move list's cells and the
 * side lines print them after the SAN: the move marks first, coloured the
 * lichess way, then the evaluation and the features, plain. Nothing for a
 * move without any.
 *
 * It sits **inside** the token's `dir="ltr"` — notation never mirrors — and
 * reads nothing but the NAGs the token's own move already carries.
 */
function NagGlyphs({ nags, testId }: { nags: readonly number[] | undefined; testId: string }) {
  if (nags === undefined || nags.length === 0) return null;
  return (
    <Glyphs data-testid={testId}>
      {nagsInPrintOrder(nags).map((nag) => (
        <Glyph
          key={nag}
          data-nag={nag}
          data-mark={isMoveMark(nag) ? "true" : "false"}
          data-tone={nagTone(nag)}
        >
          {nagGlyph(nag)}
        </Glyph>
      ))}
    </Glyphs>
  );
}

export default NagGlyphs;
