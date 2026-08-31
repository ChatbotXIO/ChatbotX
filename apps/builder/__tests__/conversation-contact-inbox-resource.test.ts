import { describe, expect, test } from "vitest"
import { conversationContactInboxResource } from "@/features/conversations/schema/resource"

// conversationContactInboxResource extends the shared contactInboxResource
// with fields that must stay conversation-only (not leak into the public
// workspace-token contact APIs that nest contactInboxResource directly).
// lastMessageAt lives here — not on the shared resource — because it's only
// needed by useAutoRefreshContactProfile's "newest capable inbox" selection.
describe("conversationContactInboxResource", () => {
  test("parses lastMessageAt as a Date", () => {
    const parsed = conversationContactInboxResource.parse({
      id: "contact-inbox-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
      channel: "messenger",
      source: "inboundMessage",
      sourceId: "psid-1",
      language: "vi",
      lastMessageAt: new Date("2026-06-10T00:00:00Z"),
      lastIncomingMessageAt: null,
      contactLastReadAt: null,
      inbox: { name: "Messenger Inbox" },
      adReferral: null,
    })

    expect(parsed.lastMessageAt).toEqual(new Date("2026-06-10T00:00:00Z"))
  })

  test("parses a null lastMessageAt", () => {
    const parsed = conversationContactInboxResource.parse({
      id: "contact-inbox-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
      channel: "messenger",
      source: "inboundMessage",
      sourceId: "psid-1",
      language: "vi",
      lastMessageAt: null,
      lastIncomingMessageAt: null,
      contactLastReadAt: null,
      inbox: { name: "Messenger Inbox" },
      adReferral: null,
    })

    expect(parsed.lastMessageAt).toBeNull()
  })
})
