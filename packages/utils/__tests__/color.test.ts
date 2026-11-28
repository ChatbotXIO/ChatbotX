import { describe, expect, test } from "vitest"
import {
  HEX_COLOR_PATTERN,
  hexColorSchema,
  READABLE_TEXT_DARK,
  READABLE_TEXT_LIGHT,
  readableTextColor,
  tagChipStyle,
  tintedBadgeStyle,
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

describe("tagChipStyle", () => {
  test("pairs the color with readable text", () => {
    expect(tagChipStyle("#000000")).toEqual({
      backgroundColor: "#000000",
      color: "#ffffff",
    })
    expect(tagChipStyle("#FFFFFF")).toEqual({
      backgroundColor: "#FFFFFF",
      color: "#0f172a",
    })
  })

  test("an uncolored tag has no style", () => {
    expect(tagChipStyle(null)).toBeUndefined()
    expect(tagChipStyle(undefined)).toBeUndefined()
  })
})

describe("tintedBadgeStyle", () => {
  const luminance = (hex: string): number => {
    const channel = (start: number): number => {
      const unit = Number.parseInt(hex.slice(start, start + 2), 16) / 255
      return unit <= 0.039_28 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  }
  const contrast = (first: string, second: string): number => {
    const [a, b] = [luminance(first), luminance(second)]
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }

  test.each([
    "#FACC15",
    "#FFFF00",
    "#FFFFFF",
    "#22C55E",
    "#3B82F6",
    "#7C3AED",
    "#000000",
    "#1A2B3C",
  ])("%s reaches WCAG AA on its own pastel background", (hex) => {
    const style = tintedBadgeStyle(hex)

    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  test("the background is a light tint and the border sits between tint and color", () => {
    const style = tintedBadgeStyle("#7C3AED")

    expect(style.backgroundColor).toBe("#ebe1fc")
    expect(style.borderColor).toBe("#d1baf9")
    expect(luminance(style.backgroundColor)).toBeGreaterThan(
      luminance(style.borderColor),
    )
  })

  test("a dark color keeps its own hue as text when it already has contrast", () => {
    expect(tintedBadgeStyle("#1A2B3C").color).toBe("#1a2b3c")
  })

  test("a light color is darkened for its text", () => {
    const style = tintedBadgeStyle("#FACC15")

    expect(luminance(style.color)).toBeLessThan(luminance("#FACC15"))
  })

  test("no color or an invalid one gives the neutral gray pastel", () => {
    const neutral = tintedBadgeStyle(null)

    expect(tintedBadgeStyle(undefined)).toEqual(neutral)
    expect(tintedBadgeStyle("blue")).toEqual(neutral)
    expect(neutral).toEqual({
      backgroundColor: "#f3f4f6",
      borderColor: "#e5e7eb",
      color: "#374151",
    })
  })
})
