/** Accents NFD splits off a letter ("ặ" → "a" + marks). */
const COMBINING_MARKS = /[\u0300-\u036f]/g
/** "đ" has no NFD decomposition, so it is mapped by hand. */
const D_WITH_STROKE = /đ/g
const UNSAFE_CHARACTERS = /[^a-z0-9._-]+/g
const DASH_RUNS = /-{2,}/g
const EDGE_PUNCTUATION = /^[-._]+|[-._]+$/g
const EXTENSION = /\.[a-z0-9]{1,10}$/
const MAX_FILE_NAME_LENGTH = 80
const FALLBACK_BASE_NAME = "file"

/** Lower-case ASCII: Vietnamese and other Latin accents dropped. */
const toAsciiLowerCase = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(D_WITH_STROKE, "d")
    .trim()

const trimEdgePunctuation = (text: string): string =>
  text.replace(EDGE_PUNCTUATION, "")

/** `[a-z0-9._-]` only, dashes collapsed, no punctuation at either end. */
const toSlug = (text: string, maxLength: number): string => {
  const slug = trimEdgePunctuation(
    text.replace(UNSAFE_CHARACTERS, "-").replace(DASH_RUNS, "-"),
  )
  // Cutting to length can leave a dash or a dot at the end again.
  return trimEdgePunctuation(slug.slice(0, maxLength))
}

/**
 * A URL-safe file name: "CMND mặt trước.JPG" → "cmnd-mat-truoc.jpg". The
 * extension is kept; a name with nothing usable left becomes "file".
 */
export const sanitizeFileName = (name: string): string => {
  const ascii = toAsciiLowerCase(name)
  const extension = EXTENSION.exec(ascii)?.[0] ?? ""
  const baseName = toSlug(
    ascii.slice(0, ascii.length - extension.length),
    MAX_FILE_NAME_LENGTH - extension.length,
  )
  return `${baseName || FALLBACK_BASE_NAME}${extension}`
}
