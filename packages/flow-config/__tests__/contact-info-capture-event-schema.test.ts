import { describe, expect, test } from "vitest"
import {
  contactInfoCapturePayloadSchema,
  receivedPayloadSchema,
} from "../src/event/schema"

const base = { infoTypes: ["phone" as const], conversationId: "c1" }

describe("contactInfoCapturePayloadSchema conversationCreatedAt", () => {
  test("is optional, so events already on the stream still parse", () => {
    expect(contactInfoCapturePayloadSchema.safeParse(base).success).toBe(true)
  })

  test("accepts an ISO timestamp", () => {
    const parsed = contactInfoCapturePayloadSchema.safeParse({
      ...base,
      conversationCreatedAt: "2026-11-18T09:00:00.123Z",
    })
    expect(parsed.success).toBe(true)
  })

  test.each([
    "yesterday",
    "2026-11-18",
    "",
    "2026-13-40T00:00:00Z",
  ])("rejects %j", (value) => {
    expect(
      contactInfoCapturePayloadSchema.safeParse({
        ...base,
        conversationCreatedAt: value,
      }).success,
    ).toBe(false)
  })

  test("is carried through the message:received payload schema", () => {
    const parsed = receivedPayloadSchema.parse({
      workspaceId: "w",
      contactId: "c",
      contactInboxId: "ci",
      channel: "webchat",
      inboxId: "i",
      occurredAt: new Date(),
      contactInfoCapture: {
        ...base,
        conversationCreatedAt: "2026-11-18T09:00:00.123Z",
      },
    })
    expect(parsed.contactInfoCapture?.conversationCreatedAt).toBe(
      "2026-11-18T09:00:00.123Z",
    )
  })
})
