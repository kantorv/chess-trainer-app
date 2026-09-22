import { describe, expect, it } from "vitest";

import { newRecordId } from "./recordId";

describe("newRecordId", () => {
  it("is URL-safe, so it can travel in ?saved= and ?game=", () => {
    expect(newRecordId()).toMatch(/^g[0-9a-z]+$/);
  });

  it("does not collide for two records made in the same millisecond", () => {
    const now = new Date("2026-09-07T10:00:00.000Z");

    expect(newRecordId(now, 0.1)).not.toBe(newRecordId(now, 0.9));
  });
});
