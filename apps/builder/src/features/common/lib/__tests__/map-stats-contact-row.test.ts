import type { ContactEventData } from "@chatbotx.io/analytics/schemas"
import type { ContactInboxWithAnalytics } from "@chatbotx.io/business"
import { describe, expect, test } from "vitest"
import { mapStatsContactRow } from "../map-stats-contact-row"

const eventData: ContactEventData = {
  contactId: "contact-1",
  contactInboxId: "contact-inbox-1",
  errorContent: null,
  occurredAt: "2026-01-01T00:00:00.000Z",
}

const contactInbox = {
  id: "contact-inbox-1",
  sourceId: "source-1",
  channel: "whatsapp",
  contact: {
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    avatar: null,
  },
} as unknown as ContactInboxWithAnalytics

describe("mapStatsContactRow", () => {
  test("returns null when the event data is missing", () => {
    expect(
      mapStatsContactRow("contact-inbox-1", undefined, contactInbox),
    ).toBeNull()
  })

  test("returns null when the contact inbox is missing", () => {
    expect(
      mapStatsContactRow("contact-inbox-1", eventData, undefined),
    ).toBeNull()
  })

  // The regression this guards: `contactId` must be the real Contact id
  // (`eventData.contactId`), never the ContactInbox id
  // (`contactInbox.id`/the `contactInboxId` param) — every caller feeds this
  // row into `addContactTagAction`/`bulkTagStatsContactsAction`, which tags
  // by Contact id. Broadcasts got this right first; sequences was fixed to
  // match by switching to this shared mapper.
  test("sources contactId from the event data, not the ContactInbox id", () => {
    const row = mapStatsContactRow("contact-inbox-1", eventData, contactInbox)
    expect(row?.contactId).toBe("contact-1")
    expect(row?.contactId).not.toBe(contactInbox.id)
    expect(row?.contactInboxId).toBe("contact-inbox-1")
  })

  test("maps contact display fields from the contact inbox", () => {
    const row = mapStatsContactRow("contact-inbox-1", eventData, contactInbox)
    expect(row).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
      sourceId: "source-1",
      channel: "whatsapp",
      avatar: null,
      errorContent: null,
      occurredAt: "2026-01-01T00:00:00.000Z",
    })
  })
})
