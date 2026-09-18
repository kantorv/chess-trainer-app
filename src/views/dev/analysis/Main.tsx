import Box from "@mui/material/Box";

import { default as AnalysisV2 } from "./AnalysisV2";

/** Layout-only wrapper, as on every other board screen (`Layout.tsx`). */
const Main = () => (
  <Box data-testid="dev-analysis-wrapper" sx={{ height: "100%" }}>
    <AnalysisV2 />
  </Box>
);

export default Main;
