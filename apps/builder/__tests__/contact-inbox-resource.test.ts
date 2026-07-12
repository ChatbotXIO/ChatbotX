import { describe, expect, test } from "vitest"
import { contactInboxResource } from "@/features/contact-inboxes/schema/resource"

describe("contactInboxResource", () => {
  test("keeps source for contacts table display", () => {
    const parsed = contactInboxResource.parse({
      id: "contact-inbox-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
      channel: "messenger",
      source: "inboundMessage",
      sourceId: "psid-1",
      language: "vi",
      lastIncomingMessageAt: null,
      contactLastReadAt: null,
      inbox: { name: "Messenger Inbox" },
    })

    expect(parsed.source).toBe("inboundMessage")
    expect(parsed.sourceId).toBe("psid-1")
    expect(parsed.language).toBe("vi")
  })
})
