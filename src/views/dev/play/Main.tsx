import Box from "@mui/material/Box";

import { default as PlayV2 } from "./PlayV2";

/** Layout-only wrapper, as on every other board screen (`Layout.tsx`). */
const Main = () => (
  <Box data-testid="dev-play-wrapper" sx={{ height: "100%" }}>
    <PlayV2 />
  </Box>
);

export default Main;
