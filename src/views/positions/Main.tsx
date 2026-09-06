import Box from "@mui/material/Box";

import { default as PositionsSection } from "./PositionsSection";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="positions-wrapper" sx={{ height: "100%" }}>
    <PositionsSection />
  </Box>
);

export default Main;
