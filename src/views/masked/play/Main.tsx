import Box from "@mui/material/Box";

import { default as MaskedPlay } from "./MaskedPlay";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="masked-play-wrapper" sx={{ height: "100%" }}>
    <MaskedPlay />
  </Box>
);

export default Main;
