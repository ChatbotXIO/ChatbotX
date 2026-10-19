// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  COLORS,
  getCategoricalColor,
  getSeriesColor,
  resolveColorIndex,
} from "../src/components/charts/constants"

describe("getSeriesColor", () => {
  test("keeps the five theme tokens unchanged", () => {
    expect(COLORS).toHaveLength(5)
    COLORS.forEach((color, index) => {
      expect(getSeriesColor(index)).toBe(color)
    })
  })

  test("generates distinct deterministic colours beyond five", () => {
    const colors = Array.from({ length: 40 }, (_, i) => getSeriesColor(i))
    expect(new Set(colors).size).toBe(40)
    expect(getSeriesColor(12)).toBe(getSeriesColor(12))
    expect(getSeriesColor(5).startsWith("oklch(")).toBe(true)
  })
})

describe("getCategoricalColor", () => {
  test("is deterministic and distinct for many series", () => {
    const colors = Array.from({ length: 30 }, (_, i) => getCategoricalColor(i))
    expect(new Set(colors).size).toBe(30)
    expect(getCategoricalColor(3)).toBe(getCategoricalColor(3))
  })

  test("the first series differ by hue, not just lightness", () => {
    const hues = Array.from({ length: 8 }, (_, i) =>
      Number(getCategoricalColor(i).replace(")", "").split(" ").at(-1)),
    )
    for (let a = 0; a < hues.length; a++) {
      for (let b = a + 1; b < hues.length; b++) {
        const diff = Math.abs(hues[a] - hues[b])
        expect(Math.min(diff, 360 - diff)).toBeGreaterThanOrEqual(30)
      }
    }
  })

  test("does not change the default palette", () => {
    expect(getSeriesColor(0)).toBe("var(--color-chart-1)")
  })
})

describe("resolveColorIndex", () => {
  test("uses the series position without colorKeys", () => {
    expect(resolveColorIndex("B", 1, ["A", "B"])).toBe(1)
  })

  test("a label keeps its colorKeys index even when the chart lacks other series", () => {
    const keys = ["A", "B", "C"]
    expect(resolveColorIndex("C", 0, ["C"], keys)).toBe(2)
    expect(resolveColorIndex("C", 2, ["A", "B", "C"], keys)).toBe(2)
  })

  test("unlisted labels follow the listed ones without clashing", () => {
    const keys = ["A", "B"]
    const labels = ["A", "X", "Y"]
    expect(resolveColorIndex("X", 1, labels, keys)).toBe(2)
    expect(resolveColorIndex("Y", 2, labels, keys)).toBe(3)
  })
})

const LIGHTNESS = /oklch\((\d+(?:\.\d+)?)%/

describe("categorical colour contrast", () => {
  test("lightness keeps at least 3:1 against white (L <= 64%)", () => {
    for (let i = 0; i < 12; i++) {
      const lightness = Number(LIGHTNESS.exec(getCategoricalColor(i))?.[1])
      expect(lightness).toBeLessThanOrEqual(64)
      expect(lightness).toBeGreaterThanOrEqual(55)
    }
  })
})
