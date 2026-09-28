import { describe, expect, test } from "vitest"
import { contactInboxResource } from "@/features/contact-inboxes/schema/resource"
import { conversationContactInboxResource } from "@/features/conversations/schema/resource"

const contactInboxPayload = {
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
}

describe("contactInboxResource", () => {
  test("strips internal identity-change history", () => {
    const parsed = contactInboxResource.parse({
      ...contactInboxPayload,
      sourceIdentityHistory: [
        {
          sourceId: "old-psid",
          sourceUserId: null,
          sourceParentUserId: null,
          changedAt: "2026-09-28T05:00:00.000Z",
          reason: "userIdChanged",
        },
      ],
    })

    expect(parsed).not.toHaveProperty("sourceIdentityHistory")
  })
})

// conversationContactInboxResource extends the shared contactInboxResource
// with fields that must stay conversation-only (not leak into the public
// workspace-token contact APIs that nest contactInboxResource directly).
// lastMessageAt lives here — not on the shared resource — because it's only
// needed by useAutoRefreshContactProfile's "newest capable inbox" selection.
describe("conversationContactInboxResource", () => {
  test("parses lastMessageAt as a Date", () => {
    const parsed = conversationContactInboxResource.parse({
      ...contactInboxPayload,
      lastMessageAt: new Date("2026-06-10T00:00:00Z"),
      adReferral: null,
    })

    expect(parsed.lastMessageAt).toEqual(new Date("2026-06-10T00:00:00Z"))
  })

  test("parses a null lastMessageAt", () => {
    const parsed = conversationContactInboxResource.parse({
      ...contactInboxPayload,
      lastMessageAt: null,
      adReferral: null,
    })

    expect(parsed.lastMessageAt).toBeNull()
  })
})
