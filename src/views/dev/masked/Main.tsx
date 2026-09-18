import Box from "@mui/material/Box";

import { default as MaskedV2 } from "./MaskedV2";

/** Layout-only wrapper, as on every other board screen (`Layout.tsx`). */
const Main = () => (
  <Box data-testid="dev-masked-wrapper" sx={{ height: "100%" }}>
    <MaskedV2 />
  </Box>
);

export default Main;
