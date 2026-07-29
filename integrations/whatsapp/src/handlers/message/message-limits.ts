/**
 * Character limits documented by the WhatsApp Cloud API for outgoing message
 * components.
 *
 * `whatsapp-api-js` validates most of these in its constructors and *throws*
 * when one is exceeded, which aborts the whole flow step rather than degrading
 * a single field — so every string is clamped before it reaches a builder.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
export const messageLimits = {
  bodyText: 1024,
  buttonId: 256,
  buttonTitle: 20,
  carouselCardBody: 160,
  carouselMainBody: 1024,
  /** Not validated by the library, but rejected by Meta. */
  caption: 1024,
  footerText: 60,
  rowId: 200,
  rowTitle: 24,
  text: 4096,
} as const

/**
 * Trims both before and after slicing: Meta rejects button ids that have
 * leading or trailing spaces, and a cut can land mid-word and leave one behind.
 *
 * Reserved for values that have nowhere to overflow to — a button title or a
 * footer cannot be continued in a second message. Anything that can be
 * continued should use {@link splitText} instead of losing content.
 */
export function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength).trim()
}

/** The whitespace run before the last, possibly truncated, word. */
const TRAILING_WORD = /\s+\S*$/

/**
 * Splits text into consecutive chunks that each fit `maxLength`, breaking on
 * whitespace so words stay intact. Callers send one message per chunk, which
 * keeps long content whole where WhatsApp's per-message limit would otherwise
 * force it to be discarded.
 */
export function splitText(value: string, maxLength: number): string[] {
  let rest = value.trim()
  const chunks: string[] = []

  while (rest.length > maxLength) {
    const wordBreak = TRAILING_WORD.exec(rest.slice(0, maxLength))?.index ?? -1
    // A single word longer than the limit has no break to use, so it is cut.
    const cut = wordBreak > 0 ? wordBreak : maxLength

    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }

  if (rest) {
    chunks.push(rest)
  }

  return chunks
}
