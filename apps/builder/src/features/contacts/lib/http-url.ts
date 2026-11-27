// Guards a referral URL to navigable http(s) so a non-URL / `javascript:`
// value never becomes an anchor href.
const HTTP_URL_RE = /^https?:\/\//i

export const toHttpUrl = (url: string | null | undefined): string | null =>
  url && HTTP_URL_RE.test(url) ? url : null
