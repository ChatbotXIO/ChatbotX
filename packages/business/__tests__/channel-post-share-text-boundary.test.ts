// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostRepository: { findForInbox: vi.fn() },
}))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ storageUrl: "https://cdn.test/bucket" }),
}))
vi.mock("../src/base.service", () => ({ BaseService: class {} }))

const { buildTextLinkShareText } = await import(
  "../src/channel-post/share.service"
)
const { countMessageCharacters } = await import("@chatbotx.io/flow-config")

/** F2: the Messenger share text at the edges of the text limit and of the caption. */

const SPACE_BEFORE_ELLIPSIS = /\s…$/
const LINK = "https://www.facebook.com/page/posts/123"
const LIMIT = 100
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const graphemes = (value: string) =>
  Array.from(segmenter.segment(value), (part) => part.segment)

const build = (caption: string | null, limit = LIMIT, permalink = LINK) =>
  buildTextLinkShareText({ caption, permalink, limit })

describe("caption line handling", () => {
  test.each([
    ["leading LF blank lines", "\n\n\nHello\nworld", `Hello\n${LINK}`],
    [
      "leading CRLF blank lines",
      "\r\n\r\n  \r\nHello\r\nworld",
      `Hello\n${LINK}`,
    ],
    ["CRLF only after the first line", "Hello\r\nWorld", `Hello\n${LINK}`],
    ["tabs around the line", "\t Hello \t\nx", `Hello\n${LINK}`],
    ["NBSP-only first line is blank", "  \nHello", `Hello\n${LINK}`],
    ["only blank lines", "\n\r\n  \n", LINK],
    ["empty", "", LINK],
    ["null", null, LINK],
    ["spaces only", "     ", LINK],
  ])("%s", (_name, caption, expected) => {
    expect(build(caption)).toBe(expected)
  })

  test("zero-width characters at the ends of the name are trimmed", () => {
    expect(build("\u200B\uFEFF Hello \u200D\u200C")).toBe(`Hello\n${LINK}`)
    expect(build("\u200B\u200C\nHello")).toBe(`Hello\n${LINK}`)
    expect(build("Hel\u200Dlo")).toBe(`Hel\u200Dlo\n${LINK}`)
  })

  test("U+2028 and U+2029 break lines", () => {
    expect(build("Hello\u2028World")).toBe(`Hello\n${LINK}`)
    expect(build("\u2029\u2028Hello\u2029World")).toBe(`Hello\n${LINK}`)
  })

  test("the link is trimmed, the caption's later lines are never sent", () => {
    expect(build("Name\nSecond line\nThird", LIMIT, `  ${LINK}  \n`)).toBe(
      `Name\n${LINK}`,
    )
  })

  test("a lone CR is a line break, so only the first line is the name", () => {
    expect(build("Hello\rWorld")).toBe(`Hello\n${LINK}`)
    expect(build("\r\rHello\rWorld")).toBe(`Hello\n${LINK}`)
  })

  test.each([
    ["zero-width space", "\u200B"],
    ["zero-width non-joiner", "\u200C"],
    ["zero-width joiner", "\u200D"],
    ["BOM", "\uFEFF"],
    ["mixed invisible and spaces", " \u200B\u200D\uFEFF\t "],
  ])("a caption of only %s is blank (the link alone)", (_name, caption) => {
    expect(build(caption)).toBe(LINK)
  })

  test("an invisible-only first line is skipped for the next real line", () => {
    expect(build("\u200B\nHello")).toBe(`Hello\n${LINK}`)
  })

  test("invisible characters inside a real name are kept (ZWJ sequences)", () => {
    expect(build("a\u200Db")).toBe(`a\u200Db\n${LINK}`)
  })
})

describe("caption length at limit-1 / limit / limit+1", () => {
  const room = LIMIT - LINK.length - 1 // characters left for the name

  test.each([
    ["limit-1", room - 1, false],
    ["limit", room, false],
    ["limit+1", room + 1, true],
  ])("name at %s is %s-cut", (_name, nameLength, cut) => {
    const text = build("n".repeat(nameLength))

    expect(countMessageCharacters(text)).toBeLessThanOrEqual(LIMIT)
    if (cut) {
      expect(countMessageCharacters(text)).toBe(LIMIT)
      expect(text).toBe(`${"n".repeat(room - 1)}…\n${LINK}`)
    } else {
      expect(text).toBe(`${"n".repeat(nameLength)}\n${LINK}`)
    }
  })

  test("a one-character name at the smallest budget survives, a two-character one is cut", () => {
    expect(
      buildTextLinkShareText({
        caption: "ab",
        permalink: LINK,
        limit: LINK.length + 3,
      }),
    ).toBe(`ab\n${LINK}`)
    expect(
      buildTextLinkShareText({
        caption: "abc",
        permalink: LINK,
        limit: LINK.length + 3,
      }),
    ).toBe(`a…\n${LINK}`)
  })
})

describe("link length at limit-1 / limit / limit+1", () => {
  const link = (length: number) => `https://x.test/${"p".repeat(length - 15)}`

  test.each([
    ["limit-1", LIMIT - 1],
    ["limit", LIMIT],
  ])("link at %s is sent whole with no name", (_name, length) => {
    expect(build("Name", LIMIT, link(length))).toBe(link(length))
  })

  test("a link one under limit-1 (limit-2) still has no room for any name", () => {
    expect(build("Name", LIMIT, link(LIMIT - 2))).toBe(link(LIMIT - 2))
  })

  test("a link at limit-3 leaves room for a one-character name plus an ellipsis", () => {
    expect(build("Name", LIMIT, link(LIMIT - 3))).toBe(`N…\n${link(LIMIT - 3)}`)
  })

  test("characterization: a link longer than the limit is returned whole (the shareability rule refuses it earlier)", () => {
    const long = link(LIMIT + 1)
    const text = build("Name", LIMIT, long)

    expect(text).toBe(long)
    expect(countMessageCharacters(text)).toBe(LIMIT + 1)
  })
})

describe("truncation never cuts inside a grapheme", () => {
  const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}"
  const THUMBS_TONE = "\u{1F44D}\u{1F3FD}"
  const FLAG = "\u{1F1FB}\u{1F1F3}"
  const COMBINED = "ẹ́"
  const room = LIMIT - LINK.length - 1

  const unit = (cluster: string, count = 120) => cluster.repeat(count)

  test.each([
    ["ZWJ family", FAMILY],
    ["emoji with skin tone", THUMBS_TONE],
    ["flag (regional indicators)", FLAG],
    ["letter with two combining marks", COMBINED],
    ["astral symbol", "\u{1D11E}"],
    ["keycap", "1️⃣"],
  ])("%s: every cut keeps whole graphemes, ends with an ellipsis and fits the limit", (_name, cluster) => {
    // Sweep the prefix so the cut lands at every offset inside a cluster.
    for (let prefix = 0; prefix < 12; prefix++) {
      const caption = `${"a".repeat(prefix)}${unit(cluster)}`
      const text = build(caption)
      const name = text.slice(0, text.indexOf("\n"))

      expect(countMessageCharacters(text)).toBeLessThanOrEqual(LIMIT)
      expect(text.endsWith(`\n${LINK}`)).toBe(true)
      expect(name.endsWith("…")).toBe(true)
      const kept = name.slice(0, -1)
      const original = graphemes(caption)
      const keptClusters = graphemes(kept)
      // The kept text is exactly the first k whole clusters of the caption.
      expect(keptClusters).toEqual(original.slice(0, keptClusters.length))
      expect(caption.startsWith(kept)).toBe(true)
      expect(countMessageCharacters(kept)).toBeLessThanOrEqual(room - 1)
    }
  })

  test("a single oversize cluster larger than the budget leaves the link alone", () => {
    const huge = `x${"́".repeat(200)}`

    expect(build(huge)).toBe(LINK)
  })

  test("trailing spaces before the cut are removed so the name never ends in ' …'", () => {
    const caption = `${"a".repeat(room - 4)}      tail words`
    const text = build(caption)
    const name = text.slice(0, text.indexOf("\n"))

    expect(name).not.toMatch(SPACE_BEFORE_ELLIPSIS)
    expect(name.endsWith("…")).toBe(true)
  })

  test("a name shorter than the limit is untouched even when made of clusters", () => {
    const caption = `${FAMILY}${FLAG}${THUMBS_TONE}${COMBINED}`

    expect(build(caption)).toBe(`${caption}\n${LINK}`)
  })
})
