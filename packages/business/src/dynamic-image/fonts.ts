import type { DynamicImageFontFamily } from "@chatbotx.io/database/partials"
import { GlobalFonts } from "@napi-rs/canvas"
import {
  GREAT_VIBES_LATIN_400_NORMAL,
  GREAT_VIBES_VIETNAMESE_400_NORMAL,
  NOTO_SERIF_LATIN_400_ITALIC,
  NOTO_SERIF_LATIN_400_NORMAL,
  NOTO_SERIF_LATIN_700_NORMAL,
  NOTO_SERIF_VIETNAMESE_400_ITALIC,
  NOTO_SERIF_VIETNAMESE_400_NORMAL,
  NOTO_SERIF_VIETNAMESE_700_NORMAL,
  ROBOTO_LATIN_400_ITALIC,
  ROBOTO_LATIN_400_NORMAL,
  ROBOTO_LATIN_700_NORMAL,
  ROBOTO_VIETNAMESE_400_ITALIC,
  ROBOTO_VIETNAMESE_400_NORMAL,
  ROBOTO_VIETNAMESE_700_NORMAL,
} from "./font-data"

const SANS_ALIAS = "ChatbotXSans"
const SERIF_ALIAS = "ChatbotXSerif"
const SCRIPT_ALIAS = "ChatbotXScript"

/**
 * Skia has no fonts of its own — a bare server container ships none either,
 * so `ctx.fillText` silently draws nothing unless a font is registered here.
 * Both `latin` and `vietnamese` subsets are registered under the same alias
 * — Skia picks whichever face covers the glyph being drawn — since ChatbotX
 * serves Vietnamese contacts.
 *
 * The bytes come from `font-data.ts` (base64 string constants), not a
 * filesystem read: every path-based way to locate the vendored `.woff2`
 * files (`require.resolve`, an `import.meta.url`-relative `URL`,
 * `import.meta.dirname`) got mangled by the Next.js/Turbopack dev bundler in
 * a different way each time — a plain string constant has no module path or
 * `URL` for a bundler to statically analyze or rewrite.
 */
const FONT_FILES: ReadonlyArray<{ alias: string; base64: string }> = [
  { alias: SANS_ALIAS, base64: ROBOTO_LATIN_400_NORMAL },
  { alias: SANS_ALIAS, base64: ROBOTO_VIETNAMESE_400_NORMAL },
  { alias: SANS_ALIAS, base64: ROBOTO_LATIN_700_NORMAL },
  { alias: SANS_ALIAS, base64: ROBOTO_VIETNAMESE_700_NORMAL },
  { alias: SANS_ALIAS, base64: ROBOTO_LATIN_400_ITALIC },
  { alias: SANS_ALIAS, base64: ROBOTO_VIETNAMESE_400_ITALIC },
  { alias: SERIF_ALIAS, base64: NOTO_SERIF_LATIN_400_NORMAL },
  { alias: SERIF_ALIAS, base64: NOTO_SERIF_VIETNAMESE_400_NORMAL },
  { alias: SERIF_ALIAS, base64: NOTO_SERIF_LATIN_700_NORMAL },
  { alias: SERIF_ALIAS, base64: NOTO_SERIF_VIETNAMESE_700_NORMAL },
  { alias: SERIF_ALIAS, base64: NOTO_SERIF_LATIN_400_ITALIC },
  { alias: SERIF_ALIAS, base64: NOTO_SERIF_VIETNAMESE_400_ITALIC },
  { alias: SCRIPT_ALIAS, base64: GREAT_VIBES_LATIN_400_NORMAL },
  { alias: SCRIPT_ALIAS, base64: GREAT_VIBES_VIETNAMESE_400_NORMAL },
]

const FONT_FAMILY_ALIASES: Record<DynamicImageFontFamily, string> = {
  arial: SANS_ALIAS,
  serif: SERIF_ALIAS,
  roboto: SANS_ALIAS,
  greatVibes: SCRIPT_ALIAS,
}

let registered = false

export function ensureDynamicImageFontsRegistered(): void {
  if (registered) {
    return
  }
  for (const font of FONT_FILES) {
    GlobalFonts.register(Buffer.from(font.base64, "base64"), font.alias)
  }
  registered = true
}

export function resolveDynamicImageFontFamily(
  family: DynamicImageFontFamily,
): string {
  return FONT_FAMILY_ALIASES[family]
}
