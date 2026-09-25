import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import {
  COLLECTION_FILTER_PARAMS,
  type CollectionFacets,
  type CollectionFilterValues,
  type PlayerColor,
} from "../../lib/libraryCollections";
import type { OpeningTreeNode } from "../../lib/openingTree";
import OpeningFilterBoard from "./OpeningFilterBoard";

/**
 * **A collection table's filters** (CTA-75) — the right-hand panel of
 * `/library/<collection>`: players (several names at once, CTA-95) and the
 * side any of them had, opening, event, a date range and the result.
 * Presentational: the values are the table's URL state, and every change
 * goes back through `onChange`.
 *
 * **A filter is shown only where the collection has its field**
 * (`collectionFacetsOf`): a PGN carries what its source wrote, so an upload
 * with no dates gets no date range, one event gets no event picker. The lists
 * offer **everything** the games hold — every player, every event, every
 * opening (labelled with its ECO code first, in ECO order) — and the player
 * and opening boxes also take any text: part of a name, committed as a chip
 * (`freeSolo`, `multiple`, CTA-95), or an ECO code's start.
 *
 * **The order**: the players and their side at the top, then **the opening
 * moves** (CTA-76) — a small board over the opening tree of the games the
 * other filters leave (`OpeningFilterBoard.tsx`), shown once some game has a
 * `line` in the index (an index from before the column has none) — and under
 * the board the rest: opening, event, dates, result.
 *
 * The dates are the browser's own date inputs (`type="date"`). A PGN date is
 * often partial — `1848`, `1858.10` — so a game counts as in range when any
 * day it could have been played is (`dateBounds`).
 */

type CollectionFiltersProps = {
  facets: CollectionFacets;
  values: CollectionFilterValues;
  onChange: (patch: Partial<CollectionFilterValues>) => void;
  onClear: () => void;
  /**
   * The whole collection's opening tree — the board shows once it has games —
   * then the node `line` reaches in the tree of the games the other filters
   * leave, and the moves played.
   */
  openingTree: OpeningTreeNode;
  openingNode: OpeningTreeNode;
  line: readonly string[];
  onLine: (line: string[]) => void;
  /** The collection's name, for the opening board's saved tree. */
  collectionName: string;
};

function CollectionFilters({
  facets,
  values,
  onChange,
  onClear,
  openingTree,
  openingNode,
  line,
  onLine,
  collectionName,
}: CollectionFiltersProps) {
  const { t } = useTranslation();
  // Any filter on: the player filter holds its names as an array, the rest are strings.
  const active = COLLECTION_FILTER_PARAMS.some((key) => {
    const value = values[key];
    return typeof value === "string" ? value !== "" : value.length > 0;
  });

  return (
    <Box data-testid="library-filters" sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle2" component="h2" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {t("library.filters.title")}
        </Typography>
        <Button size="small" disabled={!active} onClick={onClear} data-testid="library-filter-clear">
          {t("library.filters.clear")}
        </Button>
      </Box>

      {facets.players.length > 0 && (
        <Box sx={{ display: "grid", gap: 1 }}>
          {/*
            Several names at once (CTA-95): `multiple` renders the names as
            chips, `freeSolo` lets part of a name — not a whole facet value —
            join them (Enter commits the typed text; MUI discards it on blur),
            and `limitTags` truncates the chips in this narrow panel until the
            box is focused. `disableCloseOnSelect` keeps the list open for the
            next name. The names are the URL's repeated `?player=` params.
          */}
          <Autocomplete
            multiple
            freeSolo
            size="small"
            limitTags={1}
            disableCloseOnSelect
            options={facets.players}
            value={values.player}
            onChange={(_event, value) => onChange({ player: value })}
            data-testid="library-filter-player"
            renderInput={(params) => <TextField {...params} label={t("library.filters.player")} />}
          />
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={values.color}
            disabled={values.player.length === 0}
            onChange={(_event, value: PlayerColor | "" | null) => onChange({ color: value ?? "" })}
            aria-label={t("library.filters.color")}
            data-testid="library-filter-color"
          >
            <ToggleButton value="">{t("library.filters.anyColor")}</ToggleButton>
            <ToggleButton value="white" data-testid="library-filter-color-white">
              {t("library.filters.asWhite")}
            </ToggleButton>
            <ToggleButton value="black" data-testid="library-filter-color-black">
              {t("library.filters.asBlack")}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {openingTree.count > 0 && (
        <OpeningFilterBoard node={openingNode} line={line} onLine={onLine} collectionName={collectionName} />
      )}

      {facets.openings.length > 0 && (
        <Autocomplete
          freeSolo
          size="small"
          options={facets.openings}
          value={values.opening}
          inputValue={values.opening}
          onChange={(_event, value) => onChange({ opening: value ?? "" })}
          onInputChange={(_event, value, reason) => {
            if (reason === "input" || reason === "clear") onChange({ opening: value });
          }}
          data-testid="library-filter-opening"
          renderInput={(params) => (
            <TextField
              {...params}
              label={t("library.filters.opening")}
              helperText={t("library.filters.openingHelp")}
            />
          )}
        />
      )}

      {facets.events.length > 1 && (
        <Autocomplete
          size="small"
          options={facets.events}
          value={values.event === "" ? null : values.event}
          onChange={(_event, value) => onChange({ event: value ?? "" })}
          data-testid="library-filter-event"
          renderInput={(params) => <TextField {...params} label={t("library.filters.event")} />}
        />
      )}

      {facets.dates !== undefined && (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <TextField
            type="date"
            size="small"
            label={t("library.filters.from")}
            value={values.from}
            onChange={(event) => onChange({ from: event.target.value })}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: {
                min: facets.dates.min,
                max: values.to || facets.dates.max,
                "data-testid": "library-filter-from",
              },
            }}
          />
          <TextField
            type="date"
            size="small"
            label={t("library.filters.to")}
            value={values.to}
            onChange={(event) => onChange({ to: event.target.value })}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: {
                min: values.from || facets.dates.min,
                max: facets.dates.max,
                "data-testid": "library-filter-to",
              },
            }}
          />
        </Box>
      )}

      {facets.results.length > 1 && (
        <TextField
          select
          size="small"
          label={t("library.table.result")}
          value={values.result}
          onChange={(event) => onChange({ result: event.target.value })}
          slotProps={{ htmlInput: { "data-testid": "library-table-result" } }}
        >
          <MenuItem value="">{t("library.table.anyResult")}</MenuItem>
          {facets.results.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
      )}

    </Box>
  );
}

export default CollectionFilters;
