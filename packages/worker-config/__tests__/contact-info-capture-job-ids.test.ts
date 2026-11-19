import { describe, expect, test } from "vitest"
import {
  buildContactInfoCaptureJob,
  contactInfoCaptureJobId,
} from "../src/queues/contact-info-capture"

const data = {
  workspaceId: "ws-1",
  contactId: "c-1",
  contactInboxId: "ci-1",
  inboxId: "i-1",
  conversationId: "conv-1",
  messageId: "msg-1",
  messageCreatedAt: "2026-11-18T10:00:00.123Z",
  infoTypes: ["phone" as const],
}

describe("contact info capture jobs", () => {
  test("ids are deterministic per message and step and never contain a colon", () => {
    expect(contactInfoCaptureJobId("msg-1", "s0")).toBe(
      "contact-info-capture-msg-1-s0",
    )
    expect(contactInfoCaptureJobId("msg-1", "w2")).not.toContain(":")
    expect(contactInfoCaptureJobId("msg-1", "s0")).not.toBe(
      contactInfoCaptureJobId("msg-1", "s1"),
    )
  })

  test("a built job carries the id and only sets a delay when asked", () => {
    expect(buildContactInfoCaptureJob(data, "s0").opts).toEqual({
      jobId: "contact-info-capture-msg-1-s0",
    })
    expect(buildContactInfoCaptureJob(data, "w1", 30_000).opts).toEqual({
      jobId: "contact-info-capture-msg-1-w1",
      delay: 30_000,
    })
  })
})
