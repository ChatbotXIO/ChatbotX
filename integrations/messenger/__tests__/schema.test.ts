import { describe, expect, test } from "vitest"
import {
  facebookMessageAttachmentPayloadSchema,
  facebookSendMessageRequestSchema,
  messengerMessageSchema,
} from "../src/schema"

describe("facebookMessageAttachmentPayloadSchema", () => {
  test("rejects template_type 'utility' — utility messages use message.template not attachment", () => {
    const result = facebookMessageAttachmentPayloadSchema.safeParse({
      template_type: "utility",
    })
    expect(result.success).toBe(false)
  })

  test("accepts template_type 'generic'", () => {
    const result = facebookMessageAttachmentPayloadSchema.safeParse({
      template_type: "generic",
    })
    expect(result.success).toBe(true)
  })
})

describe("facebookSendMessageRequestSchema", () => {
  test("accepts HUMAN_AGENT message tag", () => {
    const result = facebookSendMessageRequestSchema.safeParse({
      recipient: { id: "psid-1" },
      message: { text: "hello" },
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
    })

    expect(result.success).toBe(true)
  })
})

describe("messengerMessageSchema", () => {
  test.each(["app-123", 123])("accepts app_id value %s", (appId) => {
    expect(
      messengerMessageSchema.safeParse({ mid: "mid-1", app_id: appId }).success,
    ).toBe(true)
  })

  test("keeps a modelled reply_to object", () => {
    const replyTo = { mid: "mid-original" }
    const result = messengerMessageSchema.parse({
      mid: "mid-1",
      reply_to: replyTo,
    })

    expect(result.reply_to).toEqual(replyTo)
  })

  test("keeps an unmodelled reply_to object", () => {
    const replyTo = { future_reply_kind: { id: "future-1" } }
    const result = messengerMessageSchema.parse({
      mid: "mid-1",
      reply_to: replyTo,
    })

    expect(result.reply_to).toEqual(replyTo)
  })

  test("keeps reply_to absent", () => {
    const result = messengerMessageSchema.parse({ mid: "mid-1" })

    expect(result.reply_to).toBeUndefined()
  })

  test.each([
    "mid-original",
    123,
    null,
    ["mid-original"],
  ])("ignores non-object reply_to value %# without rejecting the message", (replyTo) => {
    const result = messengerMessageSchema.parse({
      mid: "mid-1",
      reply_to: replyTo,
    })

    expect(result.reply_to).toBeUndefined()
  })

  test("accepts a story reply_to object without modelling its fields", () => {
    const replyTo = {
      story: { id: "story-1", url: "https://cdn.test/story.jpg" },
    }
    const result = messengerMessageSchema.parse({
      mid: "mid-1",
      reply_to: replyTo,
    })

    expect(result.reply_to).toEqual(replyTo)
  })

  test("keeps app_id and reply_to optional and tolerates unknown fields", () => {
    const result = messengerMessageSchema.safeParse({
      mid: "mid-1",
      future_meta_field: { nested: true },
    })

    expect(result.success).toBe(true)
  })
})
