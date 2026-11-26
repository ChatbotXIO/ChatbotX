import { describe, expect, test } from "vitest"
import { HEAVY_WORKSPACE_TABLES } from "../src/repositories/workspace-purge"

const position = (table: string): number =>
  (HEAVY_WORKSPACE_TABLES as readonly string[]).indexOf(table)

describe("feed purge order", () => {
  test("the item ledger drains before the posts its rows point at", () => {
    const ledger = position("SocialPostFeedItem")

    expect(ledger).toBeGreaterThanOrEqual(0)
    expect(position("SocialPost")).toBeGreaterThan(ledger)
  })
})
