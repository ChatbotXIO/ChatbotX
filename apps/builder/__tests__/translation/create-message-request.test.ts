// @vitest-environment node
import { describe, expect, test } from "vitest"
import { createMessageRequest } from "@/features/messages/schema/mutation"

const parse = (body: Record<string, unknown>) =>
  createMessageRequest.safeParse(body)

describe("createMessageRequest translate fields", () => {
  test("a plain text message may ask for translation", () => {
    const result = parse({ text: "hola", translate: true })
    expect(result.success).toBe(true)
  })

  test("an edited translation travels with its target language", () => {
    const result = parse({
      text: "hola",
      translate: true,
      editedTranslation: { text: "Xin chào", targetLanguage: "vi" },
    })
    expect(result.success).toBe(true)
  })

  test("a reviewed translation longer than the 1000-character text still sends", () => {
    const result = parse({
      text: "a".repeat(900),
      translate: true,
      editedTranslation: { text: "b".repeat(1100), targetLanguage: "vi" },
    })
    expect(result.success).toBe(true)
  })

  test("without translate the request is unchanged", () => {
    expect(parse({ text: "hola" }).success).toBe(true)
    expect(parse({ text: "hola", translate: false }).success).toBe(true)
  })

  test.each([
    ["a flow", { flowId: "9", translate: true }],
    ["a reply", { text: "hi", replyToMessageId: "9", translate: true }],
    ["a private reply", { text: "hi", isPrivateReply: true, translate: true }],
    ["a media file id", { text: "hi", mediaFileId: "9", translate: true }],
    ["media file ids", { text: "hi", mediaFileIds: ["9"], translate: true }],
  ])("translate is refused with %s", (_name, body) => {
    const result = parse(body)
    expect(result.success).toBe(false)
  })

  test("an edited translation without translate is refused", () => {
    const result = parse({
      text: "hola",
      editedTranslation: { text: "Xin chào", targetLanguage: "vi" },
    })
    expect(result.success).toBe(false)
  })

  test("an empty edited translation is refused", () => {
    expect(
      parse({
        text: "hola",
        translate: true,
        editedTranslation: { text: "  ", targetLanguage: "vi" },
      }).success,
    ).toBe(false)
  })
})
