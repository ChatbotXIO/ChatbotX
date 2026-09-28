import { describe, expect, test } from "vitest"
import en from "../../../../../messages/en.json"
import {
  resolveSourceIdentity,
  sourceIdentityConfigByChannel,
} from "../channel-identity"

const lookup = (key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    )

describe("resolveSourceIdentity", () => {
  test.each([
    ["messenger", "fields.channelIdentity.psid"],
    ["instagram", "fields.channelIdentity.igsid"],
    ["whatsapp", "fields.channelIdentity.whatsappId"],
    ["zalo", "fields.channelIdentity.zaloUserId"],
    ["telegram", "fields.channelIdentity.telegramChatId"],
    ["tiktok", "fields.channelIdentity.tiktokUserId"],
    ["threads", "fields.channelIdentity.threadsUsername"],
    ["webchat", "fields.channelIdentity.webchatGuestId"],
    ["api", "fields.channelIdentity.externalId"],
  ])("labels a %s sourceId with the platform term", (channel, labelKey) => {
    const identity = resolveSourceIdentity({
      channel,
      sourceId: "abc-123",
      sourceUserId: null,
    })

    expect(identity).toEqual({ labelKey, value: "abc-123" })
  })

  test("returns null when the contact inbox has no sourceId", () => {
    expect(
      resolveSourceIdentity({
        channel: "messenger",
        sourceId: "",
        sourceUserId: null,
      }),
    ).toBeNull()
    expect(resolveSourceIdentity(undefined)).toBeNull()
  })

  test("keeps the WhatsApp ID row when the phone and BSUID differ", () => {
    const identity = resolveSourceIdentity({
      channel: "whatsapp",
      sourceId: "84901234567",
      sourceUserId: "VN.1234567890",
    })

    expect(identity).toEqual({
      labelKey: "fields.channelIdentity.whatsappId",
      value: "84901234567",
    })
  })

  test("hides the WhatsApp ID row for a BSUID-keyed contact", () => {
    const identity = resolveSourceIdentity({
      channel: "whatsapp",
      sourceId: "VN.1234567890",
      sourceUserId: "VN.1234567890",
    })

    expect(identity).toBeNull()
  })

  test("does not apply WhatsApp BSUID hiding to another channel", () => {
    const identity = resolveSourceIdentity({
      channel: "messenger",
      sourceId: "same-id",
      sourceUserId: "same-id",
    })

    expect(identity).toEqual({
      labelKey: "fields.channelIdentity.psid",
      value: "same-id",
    })
  })

  test("falls back to the generic label for an unknown channel", () => {
    const identity = resolveSourceIdentity({
      channel: "carrier-pigeon",
      sourceId: "abc-123",
      sourceUserId: null,
    })

    expect(identity?.labelKey).toBe("fields.channelIdentity.channelId")
  })
})

describe("sourceIdentityConfigByChannel", () => {
  test("every label key exists in en.json", () => {
    const missing = Object.values(sourceIdentityConfigByChannel).filter(
      ({ labelKey }) => typeof lookup(labelKey) !== "string",
    )

    expect(missing).toEqual([])
  })

  test("only WhatsApp hides a sourceUserId-keyed primary identity", () => {
    const hiddenChannels = Object.entries(sourceIdentityConfigByChannel)
      .filter(([, config]) => config.hideWhenSourceUserIdKeyed)
      .map(([channel]) => channel)

    expect(hiddenChannels).toEqual(["whatsapp"])
  })
})
