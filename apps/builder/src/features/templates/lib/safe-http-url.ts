/**
 * `url` when it is an absolute http(s) URL, otherwise `null`. A publisher sets
 * the template's links and every installer opens them, so a `javascript:` or
 * `data:` link must never reach an `href`.
 */
export const safeHttpUrl = (url: string | null | undefined): string | null => {
  if (!url) {
    return null
  }
  try {
    const { protocol } = new URL(url)
    return protocol === "https:" || protocol === "http:" ? url : null
  } catch {
    return null
  }
}
