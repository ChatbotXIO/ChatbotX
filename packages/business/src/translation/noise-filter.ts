const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/giu
const LETTER_PATTERN = /\p{L}/u

/** Acknowledgements with nothing to translate and no language to read from them. */
const FILLER_WORDS = new Set(["ok", "okay", "okie", "oki", "k", "kk"])

/**
 * Text that is not worth a provider call: empty, or only emoji, punctuation,
 * numbers, URLs, or a bare acknowledgement ("ok"). The filter runs on the
 * server at request time, so a noise message never creates a job or a row.
 * It deliberately keeps short real words ("hola", "gracias"): they are cheap,
 * and a greeting is often the first thing an agent needs read.
 */
export function isNoiseText(text: string | null | undefined): boolean {
  const withoutUrls = (text ?? "").replace(URL_PATTERN, " ").trim()
  if (!LETTER_PATTERN.test(withoutUrls)) {
    return true
  }
  const normalized = withoutUrls.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
  return FILLER_WORDS.has(normalized)
}
