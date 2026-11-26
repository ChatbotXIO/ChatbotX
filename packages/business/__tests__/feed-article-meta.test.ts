import { describe, expect, test } from "vitest"
import {
  ARTICLE_HTML_MAX_CHARS,
  findArticleImageUrl,
} from "../src/social-post-feed/article-meta"

const BASE = "https://news.test/2026/a-story"
const page = (head: string, body = "<p>x</p>") =>
  `<!doctype html><html><head><title>T</title>${head}</head><body>${body}</body></html>`

describe("findArticleImageUrl", () => {
  test("reads og:image and resolves a relative address against the final page", () => {
    expect(
      findArticleImageUrl(
        page('<meta property="og:image" content="/img/cover.jpg">'),
        BASE,
      ),
    ).toBe("https://news.test/img/cover.jpg")
  })

  test("prefers secure_url, then og:image, then twitter:image", () => {
    const html = page(
      `<meta name="twitter:image" content="https://t.test/t.jpg">
       <meta property="og:image" content="https://o.test/o.jpg">
       <meta property="og:image:secure_url" content="https://s.test/s.jpg">`,
    )
    expect(findArticleImageUrl(html, BASE)).toBe("https://s.test/s.jpg")
    expect(
      findArticleImageUrl(
        page(
          `<meta name="twitter:image" content="https://t.test/t.jpg"><meta property="og:image" content="https://o.test/o.jpg">`,
        ),
        BASE,
      ),
    ).toBe("https://o.test/o.jpg")
    expect(
      findArticleImageUrl(
        page('<meta name="twitter:image" content="https://t.test/t.jpg">'),
        BASE,
      ),
    ).toBe("https://t.test/t.jpg")
  })

  test("handles single quotes, unquoted values, case, self-closing tags and entities", () => {
    expect(
      findArticleImageUrl(
        page(
          "<META PROPERTY='OG:IMAGE' CONTENT='https://a.test/x.jpg?a=1&amp;b=2' />",
        ),
        BASE,
      ),
    ).toBe("https://a.test/x.jpg?a=1&b=2")
    expect(
      findArticleImageUrl(
        page("<meta content=https://u.test/u.png property=og:image>"),
        BASE,
      ),
    ).toBe("https://u.test/u.png")
  })

  test("ignores a picture named in the body and non-web schemes", () => {
    expect(
      findArticleImageUrl(
        `<html><head></head><body><meta property="og:image" content="https://b.test/b.jpg"></body></html>`,
        BASE,
      ),
    ).toBeNull()
    expect(
      findArticleImageUrl(
        page('<meta property="og:image" content="javascript:alert(1)">'),
        BASE,
      ),
    ).toBeNull()
    expect(
      findArticleImageUrl(
        page('<meta property="og:image" content="data:image/png;base64,AAAA">'),
        BASE,
      ),
    ).toBeNull()
  })

  test("a page with no usable meta gives null", () => {
    expect(findArticleImageUrl(page(""), BASE)).toBeNull()
    expect(
      findArticleImageUrl(page('<meta property="og:image" content="">'), BASE),
    ).toBeNull()
  })

  test("falls to the next key when the first names no usable address", () => {
    expect(
      findArticleImageUrl(
        page(
          `<meta property="og:image" content="ftp://x.test/a.jpg"><meta name="twitter:image" content="https://t.test/t.jpg">`,
        ),
        BASE,
      ),
    ).toBe("https://t.test/t.jpg")
  })

  test("is linear on hostile input (many '<' and unterminated tags)", () => {
    const hostile = `<head>${"<meta ".repeat(200_000)}`
    const started = Date.now()
    expect(findArticleImageUrl(hostile, BASE)).toBeNull()
    expect(findArticleImageUrl(`<head>${"<".repeat(900_000)}`, BASE)).toBeNull()
    expect(
      findArticleImageUrl(`<head><meta content="${"a".repeat(900_000)}`, BASE),
    ).toBeNull()
    expect(Date.now() - started).toBeLessThan(2000)
  })

  test("many unterminated quoted attributes cost no more than their own tags", () => {
    const hostile = `<head>${'<meta content="'.repeat(400)}${"a".repeat(900_000)}`
    const started = Date.now()
    expect(findArticleImageUrl(hostile, BASE)).toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
  })

  test("reads at most the size cap", () => {
    const late = `${"<!-- -->".repeat(ARTICLE_HTML_MAX_CHARS / 8)}<meta property="og:image" content="https://late.test/l.jpg">`
    expect(findArticleImageUrl(late, BASE)).toBeNull()
  })
})
