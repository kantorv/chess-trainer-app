import Box from "@mui/material/Box";

import RepertoireGame from "./RepertoireGame";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`).
 */
const Main = () => (
  <Box data-testid="repertoire-game-wrapper" sx={{ height: "100%" }}>
    <RepertoireGame />
  </Box>
);

export default Main;
