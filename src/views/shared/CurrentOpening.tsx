import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { createSearchParams, Link as RouterLink } from "react-router";
import {
  getPositionBook,
  loadOpeningBook,
  stickyOpening,
  type LastKnownOpening,
  type OpeningBook,
  type PositionBook,
} from "../../lib/openings";

/**
 * The one-line "current opening" display every game screen carries at the top
 * of its right-hand panel: the opening's name and its ECO code, looked up live
 * from the vendored eco.json book at **the position on screen** — the ply being
 * viewed, not only the live tip, so stepping back through a game changes it
 * with the board.
 *
 * The ECO chip is itself the link into the Openings explorer
 * (`/tools/openings?fen=<the position on screen>`) — the same `?fen=` carrier
 * every other position hand-off uses, so this component replaced the "Open in
 * Openings" buttons those screens used to pin to their panel foot.
 *
 * The label is **sticky**: a position the book has no name for keeps showing
 * the last opening the game passed through, rather than going blank the moment
 * a move leaves the book — which is where most interesting positions live.
 * Stepping *back* past that position (or resetting the game) clears it, so a
 * name is only ever shown for the position it was earned at or one of its
 * descendants. The rule and its memory live in `lib/openings.ts`
 * (`stickyOpening`); a position that was never named and follows no named one
 * still reads as unknown — an unrecognised position is a fact about chess, not
 * an error.
 *
 * The book loads lazily and is shared: `loadOpeningBook` caches its promise, so
 * every screen mounting this component resolves the same ~3MB of JSON at most
 * once per session, and a screen never visited costs nothing. While that load
 * is in flight the line reads as loading rather than unknown — the two are
 * different answers.
 */

type Props = {
  /** The FEN of the position on screen. */
  fen: string;
  /**
   * The root test id — per screen (`engine-current-opening`, `openings-current`,
   * …), because the a11y contract is per screen. The ECO chip is `<testId>-eco`.
   */
  testId: string;
};

type Loaded = { book: OpeningBook; positionBook: PositionBook };

function CurrentOpening({ fen, testId }: Props) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  /*
    Once per mount; `loadOpeningBook` itself caches the promise across mounts,
    so a second screen — or a remount of this one — resolves immediately rather
    than re-fetching the five shards. The position book is rebuilt per mount:
    it derives from that same cached book and the build is a single pass.
  */
  useEffect(() => {
    let cancelled = false;
    loadOpeningBook().then((book) => {
      if (cancelled) return;
      setLoaded({ book, positionBook: getPositionBook(book) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
    The sticky memory, kept as state adjusted during render (the sanctioned
    derived-state pattern — an effect would show one frame of "unknown" before
    catching up). `stickyOpening` returns its `previous` argument by reference
    when nothing changed, so the `!==` guard only ever sets state on a real
    change: a new opening, or a step back past the remembered one.
  */
  const [sticky, setSticky] = useState<LastKnownOpening | null>(null);
  if (loaded !== null) {
    const next = stickyOpening(loaded.book, loaded.positionBook, fen, sticky);
    if (next !== sticky) setSticky(next);
  }

  const opening = sticky?.opening;

  return (
    <Box
      data-testid={testId}
      sx={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 1,
        minWidth: 0,
      }}
    >
      {opening ? (
        <>
          <Typography
            variant="subtitle2"
            dir="ltr"
            sx={{
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {opening.name}
          </Typography>
          <RouterLink
            to={{
              pathname: "/tools/openings",
              search: createSearchParams({ fen }).toString(),
            }}
            data-testid={`${testId}-eco`}
            aria-label={t("openings.current.open", { eco: opening.eco })}
            style={{ flexShrink: 0, textDecoration: "none" }}
          >
            <Chip size="small" dir="ltr" label={opening.eco} clickable />
          </RouterLink>
        </>
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t(
            loaded === null
              ? "openings.current.loading"
              : "openings.current.unknown",
          )}
        </Typography>
      )}
    </Box>
  );
}

export default CurrentOpening;
