import type { Theme } from "@mui/material/styles";
import type { NagTone } from "../../lib/moveAnnotations";

/**
 * **The move marks' colours** (CTA-97), lichess's families — `!` and `!!`
 * green, `?` orange, `??` red, `!?` magenta, `?!` blue — in one shade for
 * each scheme: the light one dark enough to read on white paper, the dark
 * one light enough to read on the dark theme's.
 *
 * Pure data in a file of its own, beside the components that draw with it
 * (`NagGlyphs.tsx`, the map's labels), for the fast-refresh rule
 * `moveTokenSx.ts` explains.
 */
const NAG_TONE_COLORS: Readonly<Record<NagTone, { light: string; dark: string }>> = {
  good: { light: "#1e9e38", dark: "#5ad672" },
  brilliant: { light: "#0f7a2a", dark: "#2ee6a6" },
  interesting: { light: "#c2279f", dark: "#f06ee0" },
  dubious: { light: "#2b88c2", dark: "#6cc4f2" },
  mistake: { light: "#c47a00", dark: "#f0ad2a" },
  blunder: { light: "#d03b3b", dark: "#f06a6a" },
};

/**
 * The style rules that colour a glyph by its `data-tone` attribute — `prop`
 * is `color` for HTML text and `fill` for the map's SVG. `scope` is the
 * selector each rule hangs off (`&` for the glyph itself, `& .map-nag` for
 * the ones inside a drawing).
 */
export const nagToneStyles = (theme: Theme, prop: "color" | "fill", scope: string) =>
  Object.fromEntries(
    Object.entries(NAG_TONE_COLORS).map(([tone, { light, dark }]) => [
      `${scope}[data-tone="${tone}"]`,
      { [prop]: light, ...theme.applyStyles("dark", { [prop]: dark }) },
    ]),
  );
