import { describe, expect, test } from "vitest"
import { firstImageInHtml } from "../src/social-post-feed/images"
import { toPlainText } from "../src/social-post-feed/text"

const FAST_MS = 3000
const TWO_MB = 2_000_000

describe("feed HTML handling stays linear on hostile input", () => {
  test.each([
    ["angle brackets", "<".repeat(TWO_MB)],
    ["open script tags", "<script>".repeat(TWO_MB / 8)],
    ["open img tags", "<img ".repeat(TWO_MB / 5)],
    ["unclosed tag", `<a ${"b".repeat(TWO_MB)}`],
  ])("%s", (_name, input) => {
    const started = Date.now()
    toPlainText(input)
    firstImageInHtml(input, "https://example.com/")
    expect(Date.now() - started).toBeLessThan(FAST_MS)
  })

  test("plain text still drops scripts, tags and decodes entities", () => {
    expect(
      toPlainText("<p>Hi &amp; bye</p><script>x()</script><b>ok</b>"),
    ).toBe("Hi & bye\nok")
  })

  test("the first real image is still found", () => {
    expect(
      firstImageInHtml(
        '<p>x</p><IMG alt="a" src="/a.jpg">',
        "https://example.com/post",
      ),
    ).toBe("https://example.com/a.jpg")
  })
})
