import { describe, expect, test } from "vitest"
import {
  HEX_COLOR_PATTERN,
  hexColorSchema,
  READABLE_TEXT_DARK,
  READABLE_TEXT_LIGHT,
  readableTextColor,
} from "../src/color"

describe("hexColorSchema", () => {
  test.each([
    "#1A2B3C",
    "#1a2b3c",
    "#000000",
    "#FfFfFf",
  ])("accepts %s", (value) => {
    expect(hexColorSchema.safeParse(value).success).toBe(true)
  })

  test.each([
    "#1A2B3C4D",
    "#fff",
    "1A2B3C",
    "#GGGGGG",
    "red",
    "",
    "#1A2B3C ",
    "rgb(0,0,0)",
  ])("rejects %j", (value) => {
    expect(hexColorSchema.safeParse(value).success).toBe(false)
  })

  test("nullable().optional() distinguishes omitted from null", () => {
    const schema = hexColorSchema.nullable().optional()
    expect(schema.parse(undefined)).toBeUndefined()
    expect(schema.parse(null)).toBeNull()
    expect(schema.parse("#abcdef")).toBe("#ABCDEF")
  })

  test("normalizes to upper case", () => {
    expect(hexColorSchema.parse("#1a2b3c")).toBe("#1A2B3C")
    expect(hexColorSchema.parse("#1A2B3C")).toBe("#1A2B3C")
  })

  test("pattern is anchored", () => {
    expect(HEX_COLOR_PATTERN.test("x#123456")).toBe(false)
  })
})

describe("readableTextColor", () => {
  test("light text on dark backgrounds", () => {
    expect(readableTextColor("#000000")).toBe(READABLE_TEXT_LIGHT)
    expect(readableTextColor("#1e3a8a")).toBe(READABLE_TEXT_LIGHT)
  })

  test("dark text on light backgrounds", () => {
    expect(readableTextColor("#ffffff")).toBe(READABLE_TEXT_DARK)
    expect(readableTextColor("#FDE68A")).toBe(READABLE_TEXT_DARK)
  })

  test("uses real contrast against the two text colors near the old 0.179 cutoff", () => {
    // Luminance ~0.181: white (4.5:1) beats the slate text (4.0:1) although a
    // plain luminance cutoff of 0.179 would have picked dark.
    expect(readableTextColor("#767676")).toBe(READABLE_TEXT_LIGHT)
    // Luminance ~0.216: the slate text (4.5:1) beats white (4.0:1).
    expect(readableTextColor("#808080")).toBe(READABLE_TEXT_DARK)
  })

  test("falls back to dark text for a non-hex value", () => {
    expect(readableTextColor("nope")).toBe(READABLE_TEXT_DARK)
  })
})
