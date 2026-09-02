import * as React from "react";
import { ThemeProvider, createTheme, useTheme } from "@mui/material/styles";
import { CacheProvider } from "@emotion/react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { ltrCache } from "./rtlCache"; // the plain cache (no rtl plugin)

/**
 * Pins a subtree to left-to-right regardless of the active language: the plain
 * emotion cache (so no rule gets flipped), an LTR theme, and an explicit
 * `dir="ltr"` for anything laying itself out from the DOM direction.
 *
 * The chessboard is the reason this exists here. Files run a–h left to right in
 * every language — mirroring the board would move a1 to the bottom-right and
 * silently contradict every coordinate the engine and `chess.js` report.
 */
function ForceLTR({
  children,
  sx,
}: {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}) {
  const outerTheme = useTheme();
  const ltrTheme = React.useMemo(
    () => createTheme({ ...outerTheme, direction: "ltr" }),
    [outerTheme],
  );

  return (
    <CacheProvider value={ltrCache}>
      <ThemeProvider theme={ltrTheme}>
        <Box dir="ltr" sx={sx}>
          {children}
        </Box>
      </ThemeProvider>
    </CacheProvider>
  );
}

export { ForceLTR };
