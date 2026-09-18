import Box from "@mui/material/Box";

import RepertoirePlay from "./RepertoirePlay";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`).
 */
const Main = () => (
  <Box data-testid="repertoire-play-wrapper" sx={{ height: "100%" }}>
    <RepertoirePlay />
  </Box>
);

export default Main;
