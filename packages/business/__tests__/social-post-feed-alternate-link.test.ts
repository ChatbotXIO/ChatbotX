import { describe, expect, test } from "vitest"
import { findAlternateFeedUrl } from "../src/social-post-feed/alternate-link"

const PAGE = "https://example.com/blog/"

describe("findAlternateFeedUrl", () => {
  test("resolves an RSS alternate link against the page address", () => {
    const html = `<head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head>`
    expect(findAlternateFeedUrl(html, PAGE)).toBe(
      "https://example.com/feed.xml",
    )
  })

  test("finds an Atom link whatever the attribute order and quotes", () => {
    const html = `<link href='atom.xml' type='application/atom+xml' rel='alternate'>`
    expect(findAlternateFeedUrl(html, PAGE)).toBe(
      "https://example.com/blog/atom.xml",
    )
  })

  test("accepts a JSON Feed alternate link", () => {
    const html = `<link rel="alternate" type="application/feed+json" href="/feed.json">`
    expect(findAlternateFeedUrl(html, PAGE)).toBe(
      "https://example.com/feed.json",
    )
  })

  test("ignores other links and non-http(s) addresses", () => {
    expect(
      findAlternateFeedUrl(
        `<link rel="stylesheet" href="/a.css"><link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">`,
        PAGE,
      ),
    ).toBeNull()
    expect(findAlternateFeedUrl("<p>no links</p>", PAGE)).toBeNull()
  })
})
