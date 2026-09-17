import Box from "@mui/material/Box";

import { default as RepertoireV2 } from "./RepertoireV2";

/** Layout-only wrapper, as on every other board screen (`Layout.tsx`). */
const Main = () => (
  <Box data-testid="dev-repertoire-wrapper" sx={{ height: "100%" }}>
    <RepertoireV2 />
  </Box>
);

export default Main;
