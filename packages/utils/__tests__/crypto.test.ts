import { describe, expect, test } from "vitest"
import { hmacSha256Hex, timingSafeStringEqual } from "../src/crypto"

const HEX_SHA256 = /^[0-9a-f]{64}$/

describe("hmacSha256Hex", () => {
  test("produces a stable lowercase hex digest for a given secret + payload", async () => {
    const first = await hmacSha256Hex("secret", "payload")
    const second = await hmacSha256Hex("secret", "payload")

    expect(first).toBe(second)
    expect(first).toMatch(HEX_SHA256)
  })

  test("changes when the secret changes", async () => {
    const a = await hmacSha256Hex("secret-a", "payload")
    const b = await hmacSha256Hex("secret-b", "payload")

    expect(a).not.toBe(b)
  })

  test("changes when the payload changes", async () => {
    const a = await hmacSha256Hex("secret", "payload-a")
    const b = await hmacSha256Hex("secret", "payload-b")

    expect(a).not.toBe(b)
  })
})

describe("timingSafeStringEqual", () => {
  test("returns true for identical strings", () => {
    expect(timingSafeStringEqual("abc123", "abc123")).toBe(true)
  })

  test("returns false for different strings of equal length", () => {
    expect(timingSafeStringEqual("abc123", "abc124")).toBe(false)
  })

  test("returns false for strings of different length", () => {
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false)
  })
})
