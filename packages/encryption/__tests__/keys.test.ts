import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { keys } from "../src/keys"

const VALID_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

describe("keys env validation", () => {
  const previous = process.env.ENCRYPTION_KEY

  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY
  })

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.ENCRYPTION_KEY
    } else {
      process.env.ENCRYPTION_KEY = previous
    }
  })

  test("accepts a valid 32-byte hex key", () => {
    process.env.ENCRYPTION_KEY = VALID_KEY
    expect(() => keys()).not.toThrow()
  })

  test("rejects a missing key", () => {
    expect(() => keys()).toThrow()
  })

  test("rejects a too-short key", () => {
    process.env.ENCRYPTION_KEY = "0123abcd"
    expect(() => keys()).toThrow()
  })

  test("rejects a non-hex key of the right length", () => {
    process.env.ENCRYPTION_KEY = "z".repeat(64)
    expect(() => keys()).toThrow()
  })
})
