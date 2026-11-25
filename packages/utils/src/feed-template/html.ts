/**
 * Linear-time HTML tag handling for untrusted feed text. The regular
 * expressions this replaces (`<[^>]*>`, a lazy `<script>...</script>`) rescan
 * the rest of the input from every `<`, which is quadratic on a long run of
 * `<` characters.
 */

/** Input past this many characters is cut before any tag handling. */
export const MAX_HTML_INPUT_LENGTH = 1_000_000

/** A tag longer than this is not read as an image tag. */
export const MAX_IMG_TAG_LENGTH = 4096

const BLOCK_NAMES = ["script", "style"] as const
const NAME_CHAR = /[a-z0-9_]/i
const BLANK = /\s/

/** Lower-cases ASCII only, so every index keeps pointing at the same place in the original. */
const asciiLower = (text: string): string =>
  text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())

const blockNameAt = (
  lower: string,
  index: number,
): (typeof BLOCK_NAMES)[number] | null => {
  for (const name of BLOCK_NAMES) {
    const end = index + 1 + name.length
    if (
      lower.startsWith(name, index + 1) &&
      !NAME_CHAR.test(lower.charAt(end))
    ) {
      return name
    }
  }
  return null
}

/** The index just past the `</name ...>` that closes a block opened before `from`, or -1. */
const blockEnd = (lower: string, name: string, from: number): number => {
  const closer = `</${name}`
  let at = lower.indexOf(closer, from)
  while (at !== -1) {
    let cursor = at + closer.length
    while (BLANK.test(lower.charAt(cursor))) {
      cursor += 1
    }
    if (lower.charAt(cursor) === ">") {
      return cursor + 1
    }
    at = lower.indexOf(closer, at + 1)
  }
  return -1
}

export type RemoveTagsOptions = {
  /** Tags (the whole `<...>` text) that become a line break instead of a blank. */
  breakTag?: RegExp
}

/**
 * Removes tags: `<script>`/`<style>` blocks and every other `<...>` become a
 * blank; a tag matching `breakTag` becomes a line break. A `<` with no `>`
 * after it is plain text.
 */
export const removeHtmlTags = (
  input: string,
  options: RemoveTagsOptions = {},
): string => {
  const text =
    input.length > MAX_HTML_INPUT_LENGTH
      ? input.slice(0, MAX_HTML_INPUT_LENGTH)
      : input
  const lower = asciiLower(text)
  const out: string[] = []
  // Once a block name has no closer after some point, none exists later either.
  const noCloserFrom = new Map<string, number>()
  let position = 0
  while (position < text.length) {
    const open = text.indexOf("<", position)
    if (open === -1) {
      break
    }
    const close = text.indexOf(">", open + 1)
    if (close === -1) {
      break
    }
    out.push(text.slice(position, open))
    const name = blockNameAt(lower, open)
    const blockedAt = name ? noCloserFrom.get(name) : undefined
    let end = -1
    if (name && (blockedAt === undefined || open < blockedAt)) {
      end = blockEnd(lower, name, close + 1)
      if (end === -1) {
        noCloserFrom.set(name, open)
      }
    }
    if (end === -1) {
      const tag = text.slice(open, close + 1)
      out.push(options.breakTag?.test(tag) ? "\n" : " ")
      position = close + 1
    } else {
      out.push(" ")
      position = end
    }
  }
  out.push(text.slice(position))
  return out.join("")
}

/** Every `<img ...>` tag of an HTML fragment, in order; an over-long tag is skipped. */
export const findImgTags = (html: string): string[] => {
  const text =
    html.length > MAX_HTML_INPUT_LENGTH
      ? html.slice(0, MAX_HTML_INPUT_LENGTH)
      : html
  const lower = asciiLower(text)
  const tags: string[] = []
  let position = 0
  while (position < text.length) {
    const open = lower.indexOf("<img", position)
    if (open === -1) {
      break
    }
    if (NAME_CHAR.test(lower.charAt(open + 4))) {
      position = open + 4
      continue
    }
    const close = text.indexOf(">", open + 4)
    if (close === -1) {
      break
    }
    if (close - open < MAX_IMG_TAG_LENGTH) {
      tags.push(text.slice(open, close + 1))
    }
    position = close + 1
  }
  return tags
}
