import createCache from "@emotion/cache";
import rtlPlugin from "@mui/stylis-plugin-rtl";

/**
 * Two emotion caches, one per direction. `AppThemeWithLang` swaps between them
 * when the language changes; the distinct `key` per cache is what keeps the
 * flipped and unflipped rules from colliding in the document head.
 */
export const rtlCache = createCache({
  key: "muirtl",
  stylisPlugins: [rtlPlugin],
});

export const ltrCache = createCache({
  key: "muiltr",
  stylisPlugins: [],
});
