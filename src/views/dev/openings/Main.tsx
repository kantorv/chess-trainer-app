import Box from "@mui/material/Box";

import { default as OpeningsV2 } from "./OpeningsV2";

/** Layout-only wrapper, as on every other board screen (`Layout.tsx`). */
const Main = () => (
  <Box data-testid="dev-openings-wrapper" sx={{ height: "100%" }}>
    <OpeningsV2 />
  </Box>
);

export default Main;
