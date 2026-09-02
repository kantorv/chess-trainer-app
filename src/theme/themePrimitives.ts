import type { ThemeOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface TypeBackground {
    /** Header fill — translucent so the body shows through the blur. */
    translucent: string;
    /** Inset surface: the sidebar rail and the right-hand analysis panel. */
    sunken: string;
  }
}

/**
 * Both color schemes in one place. `cssVariables` (wired in
 * `AppThemeWithLang`) emits every token below as a CSS custom property, so a
 * scheme change is a variable swap rather than a re-render of every styled
 * node — which is what lets the toggle stay instant.
 */
export const colorSchemes: ThemeOptions["colorSchemes"] = {
  light: {
    palette: {
      primary: { main: "#2563eb" },
      background: {
        default: "#eef2f7",
        paper: "#ffffff",
        translucent: "rgba(238, 242, 247, 0.85)",
        sunken: "#f8fafc",
      },
      text: { primary: "#1f2937", secondary: "#667085" },
      divider: "#dfe5ee",
    },
  },
  dark: {
    palette: {
      primary: { main: "#60a5fa" },
      background: {
        default: "#0b0f16",
        paper: "#131a24",
        translucent: "rgba(11, 15, 22, 0.85)",
        sunken: "#0f1621",
      },
      text: { primary: "#e6ebf3", secondary: "#9aa6b7" },
      divider: "#26313f",
    },
  },
};

export const typography: ThemeOptions["typography"] = {
  fontFamily: [
    "Roboto",
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI"',
    "sans-serif",
  ].join(", "),
  h1: {
    fontSize: "clamp(28px, 4vw, 42px)",
    lineHeight: 1.05,
    letterSpacing: "-0.03em",
    fontWeight: 800,
  },
  h2: { fontSize: 24, letterSpacing: "-0.02em", fontWeight: 800 },
  h3: { fontSize: 19, letterSpacing: "-0.02em", fontWeight: 800 },
  button: { fontWeight: 700, textTransform: "none" },
};

export const shape: ThemeOptions["shape"] = { borderRadius: 10 };

export const components: ThemeOptions["components"] = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: { borderRadius: 10 },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: { backgroundImage: "none" },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 10,
        "&.Mui-selected": {
          // `selected` here means "this is the route you are on", so it wants
          // the same weight as an active nav button rather than the faint
          // default tint, which is nearly invisible against `background.sunken`.
          backgroundColor: theme.vars
            ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.16)`
            : undefined,
          "&:hover": {
            backgroundColor: theme.vars
              ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.24)`
              : undefined,
          },
        },
      }),
    },
  },
};
