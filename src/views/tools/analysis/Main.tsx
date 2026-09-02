import Box from "@mui/material/Box";

import { default as AnalysisBoard } from "./AnalysisBoard";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="analysis-board-wrapper" sx={{ height: "100%" }}>
    <AnalysisBoard />
  </Box>
);

export default Main;
