import { describe, expect, test } from "vitest"
import { generateShareToken } from "../src/template/share-token"

const URL_SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

describe("generateShareToken", () => {
  test("produces a URL-safe, sufficiently long token", () => {
    const token = generateShareToken()
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(token).toMatch(URL_SAFE_TOKEN_PATTERN)
  })

  test("produces distinct tokens across calls", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateShareToken()),
    )
    expect(tokens.size).toBe(50)
  })
})
