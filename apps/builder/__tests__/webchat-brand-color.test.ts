import { describe, expect, test } from "vitest"
import {
  getRelativeLuminance,
  readableForeground,
} from "@/features/integration-webchat/lib/brand-color"

describe("getRelativeLuminance", () => {
  test("returns 0 for black", () => {
    expect(getRelativeLuminance("#000000")).toBe(0)
  })

  test("returns 1 for white", () => {
    expect(getRelativeLuminance("#ffffff")).toBeCloseTo(1, 5)
  })

  test("accepts uppercase and lowercase hex digits", () => {
    expect(getRelativeLuminance("#FFFFFF")).toBeCloseTo(
      getRelativeLuminance("#ffffff") as number,
      10,
    )
  })

  test("returns undefined for a malformed value", () => {
    expect(getRelativeLuminance("not-a-color")).toBeUndefined()
    expect(getRelativeLuminance("#fff")).toBeUndefined()
    expect(getRelativeLuminance("#gggggg")).toBeUndefined()
  })
})

describe("readableForeground", () => {
  test("picks near-black text on a light brand color", () => {
    // This is the exact failure mode this helper exists to fix: without it,
    // --primary-foreground stays the theme's near-white default and a light
    // brandColor like this yellow produces unreadable white-on-yellow text.
    expect(readableForeground("#ffe600")).toBe("#0a0a0a")
  })

  test("picks near-white text on a dark brand color", () => {
    expect(readableForeground("#007bff")).toBe("#ffffff")
  })

  test("falls back to white when the color can't be parsed", () => {
    expect(readableForeground("not-a-color")).toBe("#ffffff")
  })
})
