import { describe, expect, test } from "vitest"
import {
  facebookMessageAttachmentPayloadSchema,
  facebookSendMessageRequestSchema,
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
