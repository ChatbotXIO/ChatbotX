import { describe, expect, it } from "vitest"
import { htmlToPlainTextWithBlocks } from "@/components/tiptap/html-to-plain-text"

describe("htmlToPlainTextWithBlocks", () => {
  it("dedupes a lone <br> used as an ordinary block separator", () => {
    expect(htmlToPlainTextWithBlocks("<p>Hello</p><br><p>World</p>")).toBe(
      "Hello\nWorld",
    )
  })

  it("preserves a deliberate blank line from a doubled <br><br>", () => {
    expect(htmlToPlainTextWithBlocks("<p>Hello</p><br><br><p>World</p>")).toBe(
      "Hello\n\nWorld",
    )
  })

  it("preserves a blank line from a genuinely empty paragraph", () => {
    expect(htmlToPlainTextWithBlocks("<p>Hello</p><p></p><p>World</p>")).toBe(
      "Hello\n\nWorld",
    )
  })

  it("preserves the exact count of consecutive blank paragraphs", () => {
    expect(
      htmlToPlainTextWithBlocks("<p>Hello</p><p></p><p></p><p>World</p>"),
    ).toBe("Hello\n\n\nWorld")
  })

  it("preserves the exact count of consecutive doubled <br> blank lines", () => {
    expect(
      htmlToPlainTextWithBlocks("<p>Hello</p><br><br><br><p>World</p>"),
    ).toBe("Hello\n\n\nWorld")
  })

  it("preserves multiple blank lines embedded as raw newlines in a text node", () => {
    expect(htmlToPlainTextWithBlocks("<p>1\n\n\n2</p>")).toBe("1\n\n\n2")
  })
})
