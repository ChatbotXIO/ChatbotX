/**
 * Fragments that must reach the customer byte for byte: code, variables, URLs,
 * emails, @mentions, and any `⟦n⟧` the customer typed themselves (so a message
 * cannot forge a placeholder). One alternation, leftmost match wins, so
 * fragments never overlap.
 */
const FRAGMENT_PATTERN = new RegExp(
  [
    "`[^`\\n]+`",
    "\\{\\{[^{}\\n]+\\}\\}",
    "⟦[^⟧\\n]*⟧",
    'https?:\\/\\/[^\\s<>"]*[^\\s<>".,;:!?)\\]]',
    'www\\.[^\\s<>"]*[^\\s<>".,;:!?)\\]]',
    "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+",
    "@[\\w.]+",
  ].join("|"),
  "gu",
)

const TOKEN_PATTERN = /⟦(\d+)⟧/gu

/** The provider returned text whose placeholders do not match the ones sent. */
export class UnsafeTranslationOutputError extends Error {
  readonly code = "unsafeOutput"

  constructor(reason: string) {
    super(`unsafe-translation-output: ${reason}`)
    this.name = "UnsafeTranslationOutputError"
  }
}

export type MaskedText = {
  /** The text with each fragment replaced by `⟦n⟧` (1-based). */
  masked: string
  fragments: string[]
}

export function maskFragments(text: string): MaskedText {
  const fragments: string[] = []
  const masked = text.replace(FRAGMENT_PATTERN, (fragment) => {
    fragments.push(fragment)
    return `⟦${fragments.length}⟧`
  })
  return { masked, fragments }
}

/**
 * Puts the fragments back. Every placeholder sent must come back exactly once
 * and none may be invented; anything else is `unsafeOutput` and the caller
 * keeps the original text rather than send a garbled or tampered translation.
 */
export function restoreFragments(
  translated: string,
  fragments: string[],
): string {
  const seen = new Set<number>()
  const restored = translated.replace(
    TOKEN_PATTERN,
    (_token, digits: string) => {
      const index = Number(digits)
      if (index < 1 || index > fragments.length) {
        throw new UnsafeTranslationOutputError("unknown placeholder")
      }
      if (seen.has(index)) {
        throw new UnsafeTranslationOutputError("duplicated placeholder")
      }
      seen.add(index)
      return fragments[index - 1] ?? ""
    },
  )
  if (seen.size !== fragments.length) {
    throw new UnsafeTranslationOutputError("missing placeholder")
  }
  return restored
}
