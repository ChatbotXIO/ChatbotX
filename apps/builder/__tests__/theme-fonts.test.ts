// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const DEFAULT_CSS = join(
  import.meta.dirname,
  "../../../packages/ui/src/styles/default.css",
)
const LAYOUT = join(import.meta.dirname, "../src/app/layout.tsx")
const FONT_TOKEN_DECLARATION = /^\s*(--font-[\w-]+):\s*([^;]+);/gm
const NEXT_FONT_IMPORT = /from\s+["']next\/font/
const CSS_VARIABLE_REFERENCE = /var\(/
const BODY_ANTIALIASED = /body\s*\{[^}]*@apply[^;]*\bantialiased\b/

// The UI ships no web font: every script (Latin, Vietnamese, CJK, Arabic,
// Hebrew, …) renders with the OS's native UI font, so only system families
// may appear in a font token.
const SYSTEM_FONT_FAMILIES: Record<string, true> = {
  "-apple-system": true,
  BlinkMacSystemFont: true,
  "Segoe UI": true,
  Roboto: true,
  "Helvetica Neue": true,
  "Noto Sans": true,
  Arial: true,
  "Apple Color Emoji": true,
  "Segoe UI Emoji": true,
  "Noto Color Emoji": true,
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
  const stylesheet = readFileSync(DEFAULT_CSS, "utf8")

  return Array.from(stylesheet.matchAll(FONT_TOKEN_DECLARATION))
    .map((match) => [match[1], match[2]] as const)
    .filter((token): token is readonly [string, string] =>
      Boolean(token[0] && token[1]),
    )
}

const fontFamilies = (fontStack: string): string[] =>
  fontStack
    .split(",")
    .map((fontFamily) => fontFamily.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)

describe("theme fonts", () => {
  test("font tokens use only system font families", () => {
    const tokens = readFontTokens()

    expect(tokens.map(([token]) => token)).toContain("--font-sans")

    for (const [, fontStack] of tokens) {
      expect(fontStack).not.toMatch(CSS_VARIABLE_REFERENCE)

      for (const fontFamily of fontFamilies(fontStack)) {
        expect(SYSTEM_FONT_FAMILIES[fontFamily]).toBe(true)
      }
    }
  })

  // Without grayscale smoothing macOS renders the system font heavy and blurry.
  test("the body uses grayscale font smoothing", () => {
    const stylesheet = readFileSync(DEFAULT_CSS, "utf8")

    expect(stylesheet).toMatch(BODY_ANTIALIASED)
  })

  test("the root layout loads no web font", () => {
    const layoutSource = readFileSync(LAYOUT, "utf8")

    expect(layoutSource).not.toMatch(NEXT_FONT_IMPORT)
  })
})
