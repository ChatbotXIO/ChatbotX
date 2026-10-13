import { describe, expect, test } from "vitest"
import { createdAtFromId, createId } from "../src/id"

describe("createdAtFromId", () => {
  test("recovers the creation time packed into a createId id", () => {
    const before = Date.now()
    const id = createId()
    const after = Date.now()
    const createdAt = createdAtFromId(id)?.getTime() ?? 0
    expect(createdAt).toBeGreaterThanOrEqual(before)
    expect(createdAt).toBeLessThanOrEqual(after)
    expect(createdAtFromId(id)?.getTime()).toBe(createdAt)
  })

  test("returns null for non-numeric ids", () => {
    expect(createdAtFromId("abc")).toBeNull()
    expect(createdAtFromId("0")).toBeNull()
  })
})
