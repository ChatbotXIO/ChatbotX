import { describe, expect, test } from "vitest"
import {
  broadcastSubactions,
  requiresRecentInteractionWindow,
} from "../src/partials/broadcast"

describe("requiresRecentInteractionWindow", () => {
  test("requires the 24h messaging window for non-template Messenger and WhatsApp broadcast subactions", () => {
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.messengerActiveContacts,
      ),
    ).toBe(true)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.whatsappWithin24Hours,
      ),
    ).toBe(true)
  })

  test("does not require the 24h messaging window for templates, all contacts, or unset subactions", () => {
    expect(
      requiresRecentInteractionWindow(broadcastSubactions.enum.allContacts),
    ).toBe(false)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.messengerTemplateMessage,
      ),
    ).toBe(false)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.whatsappTemplateMessage,
      ),
    ).toBe(false)
    expect(requiresRecentInteractionWindow(null)).toBe(false)
    expect(requiresRecentInteractionWindow(undefined)).toBe(false)
  })
})
