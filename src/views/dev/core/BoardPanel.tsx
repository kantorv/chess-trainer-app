import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { formatScore, type Analysis } from "../../../lib/engineAnalysis";
import type { PieceMask } from "../../../lib/pieceMask";
import BestVariations from "../../shared/BestVariations";
import BoardControls from "../../shared/BoardControls";

/**
 * **The panel skeleton every v2 board shares** — §3.2 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * One component, five consumers. This is the layer that had no owner before
 * CTA-60, and it is the reason the issue exists: the pinned best-variations
 * block lived in `AnalysisPanel` alone, so CTA-55 reached one screen of five
 * and every later change to it would have had to be applied four more times.
 *
 * ```
 * ┌──────────────────────────────────────┐
 * │ header slot                          │  fixed   — opening line, hand-offs, the switch
 * ├──────────────────────────────────────┤
 * │ ▸ pinned BestVariations              │  fixed   — ONE block, all five boards (CTA-55)
 * ├──────────────────────────────────────┤
 * │ tab strip                            │  fixed   — the tabs the screen supplied
 * ├──────────────────────────────────────┤
 * │ status: the score on screen          │  fixed   — only on a board with an engine
 * ├──────────────────────────────────────┤
 * │ the active tab's content             │  SCROLLS — the only scrolling region
 * ├──────────────────────────────────────┤
 * │ footer slot                          │  fixed   — next-moves bar, explorer, save button
 * ├──────────────────────────────────────┤
 * │ |◀ ◀ ▶ ▶|                      flip  │  fixed   — the shared BoardControls
 * └──────────────────────────────────────┘
 * ```
 *
 * ## The two rules it keeps for every consumer
 *
 * **One tab is rendered at a time**, rather than all of them with the inactive
 * ones hidden: a move list scrolls its selection into view, and a hidden copy
 * would be scrolling a zero-height box on every move.
 *
 * **The panel is a non-scrolling flex column and exactly one child scrolls.**
 * The shell's aside does not scroll (`Layout.tsx`) and `RightPanel` portals
 * into a `display: contents` host, so `flex: 1` + `minHeight: 0` +
 * `overflowY: auto` on the tab region is what keeps a long move list off the
 * board square. Every other child is `flexShrink: 0`.
 *
 * ## The variations block, and what makes it clickable
 *
 * The same shared `BestVariations` the two shipped engine screens render as a
 * plain tab. The whole difference is {@link BoardPanelProps.onPlayVariation}:
 * with it, each move is a click that plays the line's prefix up to it (CTA-55,
 * lichess analysis behaviour); without it the moves are plain text. It is
 * capped and scrolls inside itself, because a wide `MultiPV` is ten lines in a
 * narrow panel, and it renders **nothing while the engine is off** — the status
 * row below already says so honestly, and "waiting for the engine" would be a
 * lie about a switch the reader turned off themselves.
 *
 * A board with no engine passes no `analysis` at all, and then neither the
 * block nor the status row exists. Nothing else about the skeleton changes.
 */

export type BoardPanelTab = {
  /** The tab's id — the strip's value, and the test id's suffix. */
  id: string;
  /** Its label, already translated by the screen. */
  label: string;
  /** Its body. Rendered only while this tab is the active one. */
  content: ReactNode;
};

export type BoardPanelProps = {
  /**
   * The panel's root test id, and the root of every id under it —
   * `<testId>-variations`, `<testId>-status`, `<testId>-tab-<id>`,
   * `<testId>-content-<id>`. One per screen, because five panels can share a
   * test run even if they never share a page.
   */
  testId: string;

  /** Above the variations block: the opening line, the hand-offs, the switch. */
  header?: ReactNode;

  /**
   * What the engine is saying about the position on screen. **Absent ⇒ this
   * board has no engine**, so neither the variations block nor the status row
   * is rendered.
   */
  analysis?: Analysis;
  /** How many lines were asked for — the block's gap handling. */
  requestedMultiPv?: number;
  /** The engine's switch. Off: the block renders nothing, the status says so. */
  engineOn?: boolean;
  /** Present ⇒ the lines are clickable (CTA-55). Absent ⇒ plain text. */
  onPlayVariation?: (sans: readonly string[]) => void;
  /** Masked notation inside the block, for a board that hides piece identities. */
  mask?: PieceMask;

  tabs: readonly BoardPanelTab[];
  activeTab: string;
  onTabChange: (id: string) => void;

  /**
   * Below the scrolling region and above the controls — a **sibling** of the
   * tab body, not a child of it, so it stays put while the tab scrolls. The
   * next-moves bar, the opening explorer's list, a save button.
   */
  footer?: ReactNode;

  /** Straight through to the shared `BoardControls`. */
  ply: number;
  lastPly: number;
  onSelectPly: (ply: number) => void;
  onFlip: () => void;
};

function BoardPanel({
  testId,
  header,
  analysis,
  requestedMultiPv = 1,
  engineOn = false,
  onPlayVariation,
  mask,
  tabs,
  activeTab,
  onTabChange,
  footer,
  ply,
  lastPly,
  onSelectPly,
  onFlip,
}: BoardPanelProps) {
  const { t } = useTranslation();

  const hasEngine = analysis !== undefined;
  const topLine = analysis?.lines.find((line) => line !== undefined);

  // A tab id that names nothing falls back to the first tab rather than
  // rendering an empty body: the strip would show a selection with no content.
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <Box
      data-testid={testId}
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {header !== undefined && (
        <Box
          data-testid={`${testId}-header`}
          sx={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 0,
          }}
        >
          {header}
        </Box>
      )}

      {/*
        THE propagation point. One block, five boards — see the header note.
        Nothing at all while the engine is off, and nothing at all on a board
        that has no engine to be off.
      */}
      {hasEngine && engineOn && (
        <Box
          data-testid={`${testId}-variations`}
          sx={{
            flexShrink: 0,
            maxHeight: "40%",
            overflowY: "auto",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            px: 1,
            pt: 0.75,
            pb: 0.5,
          }}
        >
          <BestVariations
            analysis={analysis}
            requested={requestedMultiPv}
            mask={mask}
            onSelectMove={onPlayVariation}
          />
        </Box>
      )}

      <Tabs
        value={active?.id ?? false}
        onChange={(_event, next: string) => onTabChange(next)}
        variant="fullWidth"
        sx={{
          flexShrink: 0,
          minHeight: 36,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": {
            minHeight: 36,
            textTransform: "none",
            minWidth: 0,
            px: 1,
          },
        }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={tab.label}
            data-testid={`${testId}-tab-${tab.id}`}
          />
        ))}
      </Tabs>

      {/*
        The one line of status that belongs above every tab: the evaluation of
        the position on screen. A dash while the engine is off, because that is
        honestly what is known about the position then.
      */}
      {hasEngine && (
        <Box
          data-testid={`${testId}-status`}
          sx={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t(
              engineOn
                ? "analysis.settings.title"
                : "analysis.settings.engineOff",
            )}
          </Typography>
          <Chip
            size="small"
            dir="ltr"
            data-testid={`${testId}-status-score`}
            label={formatScore(topLine?.score ?? null)}
          />
        </Box>
      )}

      <Box
        role="tabpanel"
        data-testid={`${testId}-content-${active?.id ?? "none"}`}
        sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
      >
        {active?.content}
      </Box>

      {footer !== undefined && (
        <Box data-testid={`${testId}-footer`} sx={{ flexShrink: 0 }}>
          {footer}
        </Box>
      )}

      <BoardControls
        ply={ply}
        lastPly={lastPly}
        onSelectPly={onSelectPly}
        onFlip={onFlip}
      />
    </Box>
  );
}

export default BoardPanel;
