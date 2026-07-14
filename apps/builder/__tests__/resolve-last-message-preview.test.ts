// @vitest-environment node
import { createTranslator } from "next-intl"
import { describe, expect, test } from "vitest"
import messages from "../messages/en.json"
import { resolveLastMessagePreview } from "../src/features/conversations/queries/resolve-last-message-preview"

const t = createTranslator({ locale: "en", messages })

describe("resolveLastMessagePreview", () => {
  test("uses the message text when present, even if attachments exist", () => {
    const result = resolveLastMessagePreview(
      { text: "Hello", attachmentCount: 3 } as never,
      t,
    )
    expect(result).toBe("Hello")
  })

  test("falls back to a singular attachment label when count is 1", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachmentCount: 1 } as never,
      t,
    )
    expect(result).toBe("Sent 1 attachment")
  })

  test("falls back to a plural attachment label when count is more than 1", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachmentCount: 2 } as never,
      t,
    )
    expect(result).toBe("Sent 2 attachments")
  })

  test("falls back to attachments.length when attachmentCount is absent", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachments: [{}, {}] } as never,
      t,
    )
    expect(result).toBe("Sent 2 attachments")
  })

  test("renders a single space when there is no text and no attachments", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachmentCount: 0 } as never,
      t,
    )
    expect(result).toBe(" ")
  })

  test("renders a single space when message is undefined", () => {
    const result = resolveLastMessagePreview(undefined, t)
    expect(result).toBe(" ")
  })
})
