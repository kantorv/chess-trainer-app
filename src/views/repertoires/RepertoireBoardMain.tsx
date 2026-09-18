import Box from "@mui/material/Box";

import RepertoireBoard from "./RepertoireBoard";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`).
 */
const Main = () => (
  <Box data-testid="repertoire-board-wrapper" sx={{ height: "100%" }}>
    <RepertoireBoard />
  </Box>
);

export default Main;
