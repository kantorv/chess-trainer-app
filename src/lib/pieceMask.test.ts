import { describe, expect, it } from "vitest";
import { defaultPieces } from "react-chessboard";
import {
  IDENTITY_MASK,
  MASK_PIECE_TYPES,
  MASK_PRESETS,
  isAnyMasked,
  isMasked,
  maskPresetOf,
  maskSan,
  maskSanLine,
  maskedPieces,
  withMaskEntry,
  type PieceMask,
} from "./pieceMask";

/** A move as `maskSan` wants one. */
const move = (san: string, from: string, to: string, color: "w" | "b" = "w") => ({
  san,
  from,
  to,
  color,
});

describe("the mask itself", () => {
  it("covers all twelve types, so each colour is masked independently", () => {
    expect(MASK_PIECE_TYPES).toHaveLength(12);
    expect(Object.keys(IDENTITY_MASK).sort()).toEqual(
      [...MASK_PIECE_TYPES].sort(),
    );
  });

  it("hides nothing under the identity mask", () => {
    expect(isAnyMasked(IDENTITY_MASK)).toBe(false);
    for (const type of MASK_PIECE_TYPES) {
      expect(isMasked(IDENTITY_MASK, type)).toBe(false);
    }
  });

  it("draws the non-pawns as pawns, and leaves the kings alone", () => {
    const mask = MASK_PRESETS.nonPawns;

    expect(mask.wQ).toBe("wP");
    expect(mask.wR).toBe("wP");
    expect(mask.bB).toBe("bP");
    expect(mask.bN).toBe("bP");
    expect(mask.wK).toBe("wK");
    expect(mask.bK).toBe("bK");
  });

  it("draws even the kings as pawns under the hardest preset", () => {
    expect(MASK_PRESETS.allIdentical.wK).toBe("wP");
    expect(MASK_PRESETS.allIdentical.bK).toBe("bP");
  });

  it("counts a pawn that shares its graphic as hidden, disguised or not", () => {
    /*
      The pawn is drawn as a pawn under both presets and is nonetheless hidden
      under both: everything else is a pawn to look at too, so its own graphic
      no longer means only itself.
    */
    expect(MASK_PRESETS.nonPawns.wP).toBe("wP");
    expect(isMasked(MASK_PRESETS.nonPawns, "wP")).toBe(true);
    expect(isMasked(MASK_PRESETS.allIdentical, "wP")).toBe(true);

    // The king is the exception under `nonPawns`: nothing else is drawn as one.
    expect(isMasked(MASK_PRESETS.nonPawns, "wK")).toBe(false);
    expect(isMasked(MASK_PRESETS.allIdentical, "wK")).toBe(true);
  });

  it("does not confuse the two colours", () => {
    // Only Black's pieces in disguise: White's are all still readable.
    const blackOnly: PieceMask = {
      ...IDENTITY_MASK,
      bQ: "bP",
      bR: "bP",
      bB: "bP",
      bN: "bP",
    };

    expect(isMasked(blackOnly, "bQ")).toBe(true);
    expect(isMasked(blackOnly, "bP")).toBe(true);
    expect(isMasked(blackOnly, "wQ")).toBe(false);
    // A white pawn and a black pawn share a shape, and never each other's.
    expect(isMasked(blackOnly, "wP")).toBe(false);
  });

  it("replaces one entry without touching the mask it came from", () => {
    const next = withMaskEntry(IDENTITY_MASK, "wR", "wN");

    expect(next.wR).toBe("wN");
    expect(IDENTITY_MASK.wR).toBe("wR");
    expect(next.wQ).toBe("wQ");
  });

  it("names the preset a mask is, and nothing for an arrangement of its own", () => {
    expect(maskPresetOf(IDENTITY_MASK)).toBe("identity");
    expect(maskPresetOf(MASK_PRESETS.nonPawns)).toBe("nonPawns");
    expect(maskPresetOf(MASK_PRESETS.allIdentical)).toBe("allIdentical");
    expect(maskPresetOf(withMaskEntry(IDENTITY_MASK, "wR", "wN"))).toBeNull();
    // Edited back into a preset by hand: still that preset, entry by entry.
    // Putting both kings back is exactly the difference between the two.
    const kingsBack = withMaskEntry(
      withMaskEntry(MASK_PRESETS.allIdentical, "wK", "wK"),
      "bK",
      "bK",
    );
    expect(maskPresetOf(kingsBack)).toBe("nonPawns");
  });
});

describe("maskedPieces — the graphic the board draws", () => {
  it("hands each type the library's own drawing of what it is displayed as", () => {
    const pieces = maskedPieces(MASK_PRESETS.nonPawns);

    // Pixel-identical to a real pawn, not merely similar to one.
    expect(pieces.wQ).toBe(defaultPieces.wP);
    expect(pieces.bN).toBe(defaultPieces.bP);
    expect(pieces.wK).toBe(defaultPieces.wK);
  });

  it("is the untouched default set under the identity mask", () => {
    const pieces = maskedPieces(IDENTITY_MASK);

    for (const type of MASK_PIECE_TYPES) {
      expect(pieces[type]).toBe(defaultPieces[type]);
    }
  });
});

describe("maskSan — one move", () => {
  it("leaves every move alone when nothing is hidden", () => {
    expect(maskSan(IDENTITY_MASK, move("Nf3", "g1", "f3"))).toBe("Nf3");
    expect(maskSan(IDENTITY_MASK, move("e4", "e2", "e4"))).toBe("e4");
    expect(maskSan(IDENTITY_MASK, move("O-O", "e1", "g1"))).toBe("O-O");
  });

  it("writes a masked piece's move as coordinates", () => {
    const mask = MASK_PRESETS.nonPawns;

    expect(maskSan(mask, move("Nf3", "g1", "f3"))).toBe("g1f3");
    expect(maskSan(mask, move("Qxd5", "d1", "d5"))).toBe("d1d5");
    expect(maskSan(mask, move("Rad1", "a1", "d1"))).toBe("a1d1");
  });

  it("writes a pawn's move as coordinates too, since a pawn is what they all look like", () => {
    // "e4" spells no piece letter and still says "a pawn moved", which under
    // this preset is the one thing the board is not showing.
    expect(maskSan(MASK_PRESETS.nonPawns, move("e4", "e2", "e4"))).toBe("e2e4");
  });

  it("leaves the king's move alone while the king is the only king-shaped piece", () => {
    expect(maskSan(MASK_PRESETS.nonPawns, move("Kf1", "e1", "f1"))).toBe("Kf1");
    expect(maskSan(MASK_PRESETS.nonPawns, move("O-O", "e1", "g1"))).toBe("O-O");

    // Under the hardest preset the king is a pawn like everything else.
    expect(maskSan(MASK_PRESETS.allIdentical, move("O-O", "e1", "g1"))).toBe(
      "e1g1",
    );
    expect(maskSan(MASK_PRESETS.allIdentical, move("O-O-O", "e8", "c8", "b"))).toBe(
      "e8c8",
    );
  });

  it("hides what a pawn promoted to, even where the pawn itself is readable", () => {
    // Only the queens are in disguise: the pawn's own graphic still means a
    // pawn, but "e8=Q" would name the piece it just became.
    const queensOnly = withMaskEntry(IDENTITY_MASK, "wQ", "wN");

    expect(maskSan(queensOnly, move("e8=Q", "e7", "e8"))).toBe("e7e8q");
    // The rook is readable under that mask, so an underpromotion to one is not
    // worth hiding.
    expect(maskSan(queensOnly, move("e8=R", "e7", "e8"))).toBe("e8=R");
  });

  it("keeps the check and mate marks, which name no piece", () => {
    const mask = MASK_PRESETS.nonPawns;

    expect(maskSan(mask, move("Qh5+", "d1", "h5"))).toBe("d1h5+");
    expect(maskSan(mask, move("Qxf7#", "h5", "f7"))).toBe("h5f7#");
    expect(maskSan(mask, move("exd8=Q#", "e7", "d8"))).toBe("e7d8q#");
  });
});

describe("maskSanLine — a game or a variation", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("returns the line untouched when nothing is hidden", () => {
    expect(maskSanLine(IDENTITY_MASK, START, ["e4", "e5", "Nf3"])).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("recovers each move's squares by replaying the line from the position", () => {
    expect(
      maskSanLine(MASK_PRESETS.nonPawns, START, ["e4", "e5", "Nf3", "Nc6"]),
    ).toEqual(["e2e4", "e7e5", "g1f3", "b8c6"]);
  });

  it("masks a line starting from an arbitrary position, off either side", () => {
    // Black to move, on move 24 — the shape a variation off a mid-game ply has.
    const fen = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 24";

    expect(maskSanLine(MASK_PRESETS.nonPawns, fen, ["O-O", "d3"])).toEqual([
      "O-O",
      "d2d3",
    ]);
  });

  it("stops following a line that has come apart, and prints the rest as it came", () => {
    /*
      Black's queen cannot reach h5 on move one, so the line stops being a line
      there — which is what a PV left over from the previous search looks like.
      Nothing after the break is replayed: a move that happened to be legal on a
      board that has stopped following would print the wrong squares.
    */
    expect(
      maskSanLine(MASK_PRESETS.nonPawns, START, ["e4", "Qh5", "d4"]),
    ).toEqual(["e2e4", "Qh5", "d4"]);
  });

  it("returns the line as it came when the position will not parse", () => {
    expect(maskSanLine(MASK_PRESETS.nonPawns, "not a fen", ["e4"])).toEqual([
      "e4",
    ]);
  });

  it("draws a promoted pawn's piece from the mask, with no memory of the pawn", () => {
    // White queens on e8; the queen is masked, so the move is coordinates.
    const fen = "7k/4P3/8/8/8/8/8/7K w - - 0 1";

    expect(maskSanLine(MASK_PRESETS.nonPawns, fen, ["e8=Q+"])).toEqual([
      "e7e8q+",
    ]);
  });
});
