import { describe, expect, test } from "vitest"
import { HEAVY_WORKSPACE_TABLES } from "../src/repositories/workspace-purge"

const position = (table: string): number =>
  (HEAVY_WORKSPACE_TABLES as readonly string[]).indexOf(table)

describe("target part purge order", () => {
  test("parts drain before their target, its media and the post", () => {
    const parts = position("SocialPostTargetPart")

    expect(parts).toBeGreaterThanOrEqual(0)
    for (const later of ["SocialPostTarget", "SocialPostMedia", "SocialPost"]) {
      expect(position(later)).toBeGreaterThan(parts)
    }
  })
})
