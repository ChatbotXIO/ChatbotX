import { describe, expect, test } from "vitest"
import { findContactInboxByChannel } from "@/features/conversations/utils/contact-inbox"

const whatsappInbox = { id: "ci-wa", channel: "whatsapp" }
const messengerInbox = { id: "ci-fb", channel: "messenger" }

describe("findContactInboxByChannel", () => {
  test("returns the contact inbox on the requested channel", () => {
    expect(
      findContactInboxByChannel(
        { contactInboxes: [messengerInbox, whatsappInbox] },
        "whatsapp",
      ),
    ).toBe(whatsappInbox)
  })

  test("returns undefined when the contact is not reachable on that channel", () => {
    expect(
      findContactInboxByChannel(
        { contactInboxes: [messengerInbox] },
        "whatsapp",
      ),
    ).toBeUndefined()
  })

  test.each([
    ["null", null],
    ["undefined", undefined],
  ])("returns undefined for a %s conversation", (_, conversation) => {
    expect(findContactInboxByChannel(conversation, "whatsapp")).toBeUndefined()
  })
})
