import { describe, expect, test } from "vitest"
import { HEAVY_WORKSPACE_TABLES } from "../src/repositories/workspace-purge"

const position = (table: string): number =>
  (HEAVY_WORKSPACE_TABLES as readonly string[]).indexOf(table)

describe("recurring post purge order", () => {
  test("the ledger drains before its series, and both before the posts", () => {
    const ledger = position("SocialPostRecurrenceOccurrence")
    const series = position("SocialPostRecurrence")

    expect(ledger).toBeGreaterThanOrEqual(0)
    expect(series).toBeGreaterThan(ledger)
    for (const later of [
      "SocialPostTargetMedia",
      "SocialPostTarget",
      "SocialPostMedia",
      "SocialPost",
    ]) {
      expect(position(later)).toBeGreaterThan(series)
    }
  })
})
