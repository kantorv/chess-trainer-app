/**
 * UI chrome only — the app shell's brand, navigation labels and the accessible
 * names of its controls. Board screens render chess notation, which is
 * language-independent and deliberately stays out of here.
 */
const en = {
  app: {
    brandMark: "CA",
    brandText: "Chess Analyze",
  },
  nav: {
    ariaLabel: "Main navigation",
    toggleColorMode: "Toggle light and dark mode",
    switchLanguage: "Switch language",
    basicBoard: "Basic board",
    movingPiece: "Moving example",
    engineEvaluation: "Engine evaluation demo",
    playEngine: "Play with engine 1",
    /** Sidebar folders — groupings over the routes, never routes themselves. */
    folders: {
      basicExamples: "Basic Examples",
    },
  },
  language: {
    en: "English",
    he: "עברית",
  },
  panel: {
    /** The right-hand column, a placeholder until it holds an eval bar / move list. */
    analysisTitle: "Analysis",
    analysisPlaceholder: "Evaluation and move list will appear here.",
  },
  footer: {
    /** Label on the link out to the project's source repository. */
    source: "Source",
  },
};

export default en;
