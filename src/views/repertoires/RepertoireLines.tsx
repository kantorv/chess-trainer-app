import { memo, useEffect, useRef } from "react";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";

import type { RepertoireChapter } from "../../lib/savedRepertoires";

/**
 * **The Lines tab** — a repertoire's lines under their chapter headings, one
 * click from the board (CTA-61, decision 2: no second navigation level between
 * a repertoire and its board).
 *
 * Presentational. The chapters are read off the tags alone
 * (`repertoireLinesOf`), so the Alapin example's 310 rows cost a text scan,
 * not a parse; a line is parsed only when it is picked, by the screen. The
 * headings stick while their lines scroll under them, so a reader deep in
 * chapter 17 still knows it is chapter 17. The selected row scrolls itself
 * into view when the tab is opened, as the move list's current move does.
 */
type RepertoireLinesProps = {
  chapters: readonly RepertoireChapter[];
  /** The line on the board — its `index` in the file. */
  selected: number;
  onSelect: (index: number) => void;
};

/*
  Memoised: the board re-renders on every step and every engine message, and
  310 list rows re-rendering with it cost more than the board did (CTA-61).
  The screen hands a stable `onSelect`, so only a new pick re-renders this.
*/
const RepertoireLines = memo(function RepertoireLines({
  chapters,
  selected,
  onSelect,
}: RepertoireLinesProps) {
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // jsdom has no layout, and no `scrollIntoView` either.
    selectedRef.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  return (
    <List dense disablePadding data-testid="repertoire-lines">
      {chapters.map((chapter, chapterIndex) => (
        <li key={chapter.label ?? `untitled-${chapterIndex}`}>
          <ul style={{ padding: 0 }}>
            {chapter.label !== undefined && (
              <ListSubheader
                disableGutters
                data-testid={`repertoire-chapter-${chapterIndex}`}
                sx={{ lineHeight: 2, px: 1, fontWeight: 600 }}
              >
                {chapter.label}
              </ListSubheader>
            )}
            {chapter.lines.map((line) => (
              <ListItemButton
                key={line.index}
                ref={line.index === selected ? selectedRef : undefined}
                selected={line.index === selected}
                onClick={() => onSelect(line.index)}
                data-testid={`repertoire-line-${line.index}`}
                sx={{ py: 0.25, px: 1 }}
              >
                <ListItemText
                  primary={line.name}
                  slotProps={{ primary: { dir: "auto", variant: "body2" } }}
                />
              </ListItemButton>
            ))}
          </ul>
        </li>
      ))}
    </List>
  );
});

export default RepertoireLines;
