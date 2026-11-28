// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  createMessageRequest,
  createMessageWithRoutingBypassRequest,
} from "@/features/messages/schema/mutation"
import { TRANSLATE_NON_TEXT_FIELDS } from "@/features/translation/schema/action"
import { STRUCTURED_ERROR_CODES } from "@/lib/orpc/orpc-error-helper"

describe("createMessageRequest — channelPost branch", () => {
  test("accepts a post id and keeps it", () => {
    const parsed = createMessageRequest.parse({
      channelPost: { channelPostId: "123" },
    })

    expect(parsed).toMatchObject({ channelPost: { channelPostId: "123" } })
  })

  test("a valid channelPost wins over text sent beside it, like products", () => {
    const parsed = createMessageRequest.parse({
      channelPost: { channelPostId: "123" },
      text: "ignored",
    })

    expect(parsed).toHaveProperty("channelPost")
    expect(parsed).not.toHaveProperty("text")
  })

  test.each([
    ["an empty id", { channelPostId: "" }],
    ["a non-numeric id", { channelPostId: "abc" }],
    ["no id", {}],
  ])("rejects %s", (_name, channelPost) => {
    expect(createMessageRequest.safeParse({ channelPost }).success).toBe(false)
  })

  test("is additive: the existing branches parse as before", () => {
    expect(createMessageRequest.safeParse({ text: "hi" }).success).toBe(true)
    expect(
      createMessageRequest.safeParse({
        products: { display: "carousel", sections: [{ productIds: ["1"] }] },
      }).success,
    ).toBe(true)
    expect(createMessageRequest.safeParse({ flowId: "9" }).success).toBe(true)
  })

  test("the inbox composer's request carries it too, with the inbox and client id", () => {
    const parsed = createMessageWithRoutingBypassRequest.parse({
      channelPost: { channelPostId: "123" },
      clientId: "55",
      inboxId: "7",
    })

    expect(parsed).toMatchObject({
      channelPost: { channelPostId: "123" },
      clientId: "55",
      inboxId: "7",
    })
  })

  test("is not translated like plain text", () => {
    expect(TRANSLATE_NON_TEXT_FIELDS).toContain("channelPost")
  })
})

describe("the refusal is a structured API error", () => {
  test("channelPostShareRefused carries its reason to the caller", () => {
    expect(STRUCTURED_ERROR_CODES.has("channelPostShareRefused")).toBe(true)
  })
})
