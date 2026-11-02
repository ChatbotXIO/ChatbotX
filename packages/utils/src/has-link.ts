// `http(s)://`/`www.` links match case-insensitively — the scheme itself is
// never meaningfully cased. Bare domains without a scheme (e.g. "example.com",
// common since Facebook comments frequently omit `http(s)://`) are matched
// case-SENSITIVELY on purpose: real domains are written lowercase, while a
// missing space after a sentence-ending period produces a capitalized
// continuation word (e.g. "ban.Shop", "ngay.Info") that would otherwise be
// misdetected as a link. `co` is deliberately excluded from the bare list —
// it's too common as a standalone lowercase word/abbreviation (e.g.
// "picture.co founder") to distinguish from a real ".co" domain; a bare `.co`
// link still needs `www.`/`http(s)://` to be caught.
const SCHEME_LINK_RE = /https?:\/\/|www\./i
const BARE_DOMAIN_RE =
  /\b[a-z0-9-]+\.(?:com|net|org|io|vn|shop|store|info|biz)\b/

export function hasLink(text: string): boolean {
  return SCHEME_LINK_RE.test(text) || BARE_DOMAIN_RE.test(text)
}
