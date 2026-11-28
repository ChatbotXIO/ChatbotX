import { describe, expect, test } from "vitest"
import {
  HEX_COLOR_PATTERN,
  hexColorSchema,
  READABLE_TEXT_DARK,
  READABLE_TEXT_LIGHT,
  readableTextColor,
  TAG_GRID_NEUTRAL_COLOR,
  TAG_PRESET_COLORS,
  tagGridCellStyle,
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

describe("tagGridCellStyle", () => {
  test("an applied tag is the full color with white text", () => {
    expect(tagGridCellStyle("#16A34A", true)).toEqual({
      backgroundColor: "#16A34A",
      color: "#ffffff",
      dotColor: "#ffffff",
      needsOutline: false,
    })
  })

  test("an unapplied tag is the color at 40% alpha with white text", () => {
    expect(tagGridCellStyle("#16A34A", false)).toEqual({
      backgroundColor: "rgba(22, 163, 74, 0.4)",
      color: "#ffffff",
      dotColor: "#ffffff",
      needsOutline: false,
    })
  })

  test.each([
    null,
    undefined,
    "",
    "nope",
  ])("an uncolored or invalid color %j uses the neutral gray", (color) => {
    expect(tagGridCellStyle(color, true).backgroundColor).toBe(
      TAG_GRID_NEUTRAL_COLOR,
    )
    expect(tagGridCellStyle(color, false).backgroundColor).toBe(
      "rgba(140, 140, 140, 0.4)",
    )
  })

  test("a nearly white tag gets muted text and dot, and an opaque faded fill when not applied", () => {
    expect(tagGridCellStyle("#FFFFFF", true)).toEqual({
      backgroundColor: "#FFFFFF",
      color: "#667085",
      dotColor: "#667085",
      needsOutline: true,
    })
    expect(tagGridCellStyle("#FFFFFF", false)).toEqual({
      backgroundColor: "#EAECF0",
      color: "#667085",
      dotColor: "#667085",
      needsOutline: true,
    })
  })

  test.each([
    null,
    "nope",
  ])("needsOutline follows the normalized color: %j is the neutral gray, no outline", (color) => {
    expect(tagGridCellStyle(color, true).needsOutline).toBe(false)
  })

  test("every other fill has white text and a white dot", () => {
    expect(tagGridCellStyle("#FFC53D", false).dotColor).toBe("#ffffff")
    expect(tagGridCellStyle("#FFC53D", true).color).toBe("#ffffff")
    expect(tagGridCellStyle("#000000", true).color).toBe("#ffffff")
  })
})

describe("TAG_PRESET_COLORS", () => {
  test("holds nine distinct colors that already pass hexColorSchema unchanged", () => {
    expect(TAG_PRESET_COLORS).toHaveLength(9)
    expect(new Set(TAG_PRESET_COLORS).size).toBe(9)
    for (const color of TAG_PRESET_COLORS) {
      expect(hexColorSchema.parse(color)).toBe(color)
    }
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
