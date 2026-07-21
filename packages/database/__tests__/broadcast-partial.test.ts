import { describe, expect, test } from "vitest"
import {
  broadcastChannelCapabilities,
  broadcastSubactionAudienceRules,
  broadcastSubactions,
  findBroadcastChannelCapability,
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
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.instagramActiveContacts,
      ),
    ).toBe(true)
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.tiktokActiveContacts,
      ),
    ).toBe(true)
  })

  test("does not require the 24h messaging window for templates, all contacts, Telegram, or unset subactions", () => {
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
    expect(
      requiresRecentInteractionWindow(
        broadcastSubactions.enum.telegramAllContacts,
      ),
    ).toBe(false)
    expect(requiresRecentInteractionWindow(null)).toBe(false)
    expect(requiresRecentInteractionWindow(undefined)).toBe(false)
  })

  test("declares an audience rule for every broadcast subaction", () => {
    expect(Object.keys(broadcastSubactionAudienceRules).sort()).toEqual(
      broadcastSubactions.options.toSorted(),
    )
  })
})

describe("broadcastChannelCapabilities", () => {
  test("declares default subactions that belong to each channel capability", () => {
    for (const capability of broadcastChannelCapabilities) {
      expect(capability.subactions).toContain(capability.defaultSubaction)
    }
  })

  test("finds Instagram, Telegram, and TikTok capabilities and excludes non-broadcast channels", () => {
    expect(findBroadcastChannelCapability("instagram")).toMatchObject({
      channel: "instagram",
      defaultSubaction: broadcastSubactions.enum.instagramActiveContacts,
    })
    expect(findBroadcastChannelCapability("telegram")).toMatchObject({
      channel: "telegram",
      defaultSubaction: broadcastSubactions.enum.telegramAllContacts,
    })
    expect(findBroadcastChannelCapability("tiktok")).toMatchObject({
      channel: "tiktok",
      defaultSubaction: broadcastSubactions.enum.tiktokActiveContacts,
    })
    expect(findBroadcastChannelCapability("webchat")).toBeUndefined()
  })

  test("marks only Messenger and WhatsApp as supporting template broadcasts", () => {
    const templateChannels = broadcastChannelCapabilities
      .filter((capability) => capability.supportsTemplateBroadcast)
      .map((capability) => capability.channel)
      .toSorted()

    expect(templateChannels).toEqual(["messenger", "whatsapp"])
    expect(
      findBroadcastChannelCapability("instagram")?.supportsTemplateBroadcast,
    ).toBe(false)
    expect(
      findBroadcastChannelCapability("telegram")?.supportsTemplateBroadcast,
    ).toBe(false)
    expect(
      findBroadcastChannelCapability("tiktok")?.supportsTemplateBroadcast,
    ).toBe(false)
  })
})
