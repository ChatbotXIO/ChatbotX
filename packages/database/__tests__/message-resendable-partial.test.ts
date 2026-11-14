import { describe, expect, test } from "vitest"
import {
  isResendableMessage,
  type ResendableMessageFields,
} from "../src/partials/message"

const failed: ResendableMessageFields = {
  messageType: "outgoing",
  senderType: "user",
  type: "message",
  contentAttributes: null,
  sendError: "(#10) permission denied",
  sourceId: null,
  contactInboxId: "ci-1",
}

describe("isResendableMessage", () => {
  test("a failed outgoing message from a person is resendable", () => {
    expect(isResendableMessage(failed)).toBe(true)
  })

  test("a row only the browser knows (no contact inbox) is not: nothing exists to resend", () => {
    expect(isResendableMessage({ ...failed, contactInboxId: "" })).toBe(false)
    expect(isResendableMessage({ ...failed, contactInboxId: null })).toBe(false)
  })

  test.each([
    ["no error", { sendError: null }],
    ["already delivered", { sourceId: "wamid.1" }],
    ["sent by a bot", { senderType: "bot" }],
    ["incoming", { messageType: "incoming" }],
    ["a public comment reply", { type: "comment" }],
  ])("%s is not resendable", (_name, override) => {
    expect(isResendableMessage({ ...failed, ...override })).toBe(false)
  })

  test("a private reply (a comment delivered as a DM) is resendable", () => {
    expect(
      isResendableMessage({
        ...failed,
        type: "comment",
        contentAttributes: { isPrivateReply: true },
      }),
    ).toBe(true)
  })

  test("a reply to a comment is resendable only when the comment's createdAt was kept", () => {
    const reply = {
      ...failed,
      type: "comment",
      parentId: "comment-1",
    }
    expect(
      isResendableMessage({
        ...reply,
        contentAttributes: { isPrivateReply: true },
      }),
    ).toBe(false)
    expect(
      isResendableMessage({
        ...reply,
        contentAttributes: {
          isPrivateReply: true,
          replyToMessageCreatedAt: "2026-11-01T00:00:00.000Z",
        },
      }),
    ).toBe(true)
  })
})
