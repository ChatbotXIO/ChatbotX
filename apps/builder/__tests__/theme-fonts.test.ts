// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const APP_DIRECTORY = join(import.meta.dirname, "../src/app")
const DEFAULT_CSS = join(
  import.meta.dirname,
  "../../../packages/ui/src/styles/default.css",
)
const LAYOUT = join(APP_DIRECTORY, "layout.tsx")
const FONTS = join(APP_DIRECTORY, "fonts.ts")
const FONT_TOKEN_DECLARATION = /^\s*(--font-[\w-]+):\s*([^;]+);/gm
const FONT_VARIABLE = /var\((--font-[\w-]+)/g
const DECLARED_FONT_VARIABLE = /variable:\s*["'](--font-[\w-]+)["']/g
const ROOT_FONT_VARIABLES = /<html\s+className=\{fontSans\.variable\}/
const GENERIC_SYSTEM_FAMILIES: Record<string, true> = {
  "ui-sans-serif": true,
  "ui-monospace": true,
  "ui-serif": true,
  "system-ui": true,
  "SFMono-Regular": true,
  Menlo: true,
  Consolas: true,
  "Liberation Mono": true,
  Georgia: true,
  Cambria: true,
  "Times New Roman": true,
  "sans-serif": true,
  monospace: true,
  serif: true,
}

const readFontTokens = (): ReadonlyArray<readonly [string, string]> => {
  const tokens: Array<readonly [string, string]> = []
  const stylesheet = readFileSync(DEFAULT_CSS, "utf8")

  for (const match of stylesheet.matchAll(FONT_TOKEN_DECLARATION)) {
    const token = match[1]
    const fontStack = match[2]

    if (token && fontStack) {
      tokens.push([token, fontStack])
    }
  }

  return tokens
}

const fontFamiliesOutsideVariables = (fontStack: string): string[] =>
  fontStack
    .replaceAll(/var\([^)]*\),?\s*/g, "")
    .split(",")
    .map((fontFamily) => fontFamily.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)

describe("theme fonts", () => {
  test("backs custom font tokens with declared variables and system fallbacks", () => {
    const fontsSource = readFileSync(FONTS, "utf8")
    const declaredVariables = Array.from(
      fontsSource.matchAll(DECLARED_FONT_VARIABLE),
      (match) => match[1],
    ).filter((variable): variable is string => Boolean(variable))

    for (const [, fontStack] of readFontTokens()) {
      const referencedVariables = Array.from(
        fontStack.matchAll(FONT_VARIABLE),
        (match) => match[1],
      ).filter((variable): variable is string => Boolean(variable))
      const fallbackFamilies = fontFamiliesOutsideVariables(fontStack)

      expect(declaredVariables).toEqual(
        expect.arrayContaining(referencedVariables),
      )
      expect(fallbackFamilies.length).toBeGreaterThan(0)

      for (const fallbackFamily of fallbackFamilies) {
        expect(GENERIC_SYSTEM_FAMILIES[fallbackFamily]).toBe(true)
      }
    }
  })

  test("applies the sans font variable at the document root", () => {
    const layoutSource = readFileSync(LAYOUT, "utf8")

    expect(layoutSource).toMatch(ROOT_FONT_VARIABLES)
  })
})
