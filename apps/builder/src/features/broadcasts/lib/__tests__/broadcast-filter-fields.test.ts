import {
  broadcastSubactions,
  channelTypes,
  contactFilterFields,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { getBroadcastExcludedFilterFields } from "../broadcast-filter-fields"

describe("getBroadcastExcludedFilterFields", () => {
  test("excludes current channel and inbox for WhatsApp template messages", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.whatsapp,
        subaction: broadcastSubactions.enum.whatsappTemplateMessage,
      }),
    ).toEqual([
      contactFilterFields.enum.currentChannel,
      contactFilterFields.enum.inbox,
    ])
  })

  test("excludes current channel and inbox for Messenger template messages", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.messenger,
        subaction: broadcastSubactions.enum.messengerTemplateMessage,
      }),
    ).toEqual([
      contactFilterFields.enum.currentChannel,
      contactFilterFields.enum.inbox,
    ])
  })

  test("excludes current channel and interacted-in-last-24h for WhatsApp within-24-hours broadcasts", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.whatsapp,
        subaction: broadcastSubactions.enum.whatsappWithin24Hours,
      }),
    ).toEqual([
      contactFilterFields.enum.currentChannel,
      contactFilterFields.enum.interactedInLast24h,
    ])
  })

  test("excludes current channel and interacted-in-last-24h for Messenger active-contact broadcasts", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.messenger,
        subaction: broadcastSubactions.enum.messengerActiveContacts,
      }),
    ).toEqual([
      contactFilterFields.enum.currentChannel,
      contactFilterFields.enum.interactedInLast24h,
    ])
  })

  test("excludes current channel and interacted-in-last-24h for Instagram active-contact broadcasts", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.instagram,
        subaction: broadcastSubactions.enum.instagramActiveContacts,
      }),
    ).toEqual([
      contactFilterFields.enum.currentChannel,
      contactFilterFields.enum.interactedInLast24h,
    ])
  })

  test("excludes current channel and interacted-in-last-24h for TikTok active-contact broadcasts", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.tiktok,
        subaction: broadcastSubactions.enum.tiktokActiveContacts,
      }),
    ).toEqual([
      contactFilterFields.enum.currentChannel,
      contactFilterFields.enum.interactedInLast24h,
    ])
  })

  test("keeps inbox for Telegram all-contact broadcasts", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.telegram,
        subaction: broadcastSubactions.enum.telegramAllContacts,
      }),
    ).toEqual([contactFilterFields.enum.currentChannel])
  })

  test("keeps inbox for all-contact broadcasts", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.zalo,
        subaction: broadcastSubactions.enum.allContacts,
      }),
    ).toEqual([contactFilterFields.enum.currentChannel])
  })

  test("keeps current channel and inbox for omnichannel broadcasts", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: channelTypes.enum.omnichannel,
        subaction: broadcastSubactions.enum.allContacts,
      }),
    ).toEqual([])
  })

  test("keeps current channel and inbox when channel is unset", () => {
    expect(getBroadcastExcludedFilterFields()).toEqual([])
  })

  test("keeps current channel and inbox when channel is null", () => {
    expect(
      getBroadcastExcludedFilterFields({
        channel: null,
        subaction: null,
      }),
    ).toEqual([])
  })
})
