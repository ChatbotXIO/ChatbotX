import { describe, expect, test } from "vitest"
import { channelTypes } from "../src/channel"
import {
  CONTACT_LOOKUP_ORDER,
  getInboxIdentifierStrategy,
  INBOUND_WEBHOOK_CHANNEL_SPECS,
  missingCreationIdentityKinds,
  PAYLOAD_RESOLVABLE_CHANNELS,
} from "../src/inbound-webhook-channel"
import { canonicalizeJsonPath } from "../src/json-path"

describe("INBOUND_WEBHOOK_CHANNEL_SPECS", () => {
  test("has an entry for every channel type", () => {
    expect(Object.keys(INBOUND_WEBHOOK_CHANNEL_SPECS).sort()).toEqual(
      [...channelTypes.options].sort(),
    )
  })

  test("lets a contact be created by channelUserId only when the channel has one", () => {
    for (const channel of channelTypes.options) {
      const spec = INBOUND_WEBHOOK_CHANNEL_SPECS[channel]
      if (spec.creationIdentities.includes("channelUserId")) {
        expect(spec.channelUserId).not.toBeNull()
      }
    }
  })

  test("gives every example path in canonical $ form", () => {
    for (const channel of channelTypes.options) {
      const spec = INBOUND_WEBHOOK_CHANNEL_SPECS[channel]
      const paths = [
        ...spec.inboxIdentifiers.map(({ examplePath }) => examplePath),
        ...(spec.channelUserId ? [spec.channelUserId.examplePath] : []),
      ]
      for (const path of paths) {
        expect(canonicalizeJsonPath(path)).toBe(path)
      }
    }
  })

  test("never lists the same inbox identifier kind twice for a channel", () => {
    for (const channel of channelTypes.options) {
      const kinds = INBOUND_WEBHOOK_CHANNEL_SPECS[channel].inboxIdentifiers.map(
        (identifier) => identifier.kind,
      )
      expect(new Set(kinds).size).toBe(kinds.length)
    }
  })

  test("creates a WhatsApp contact from its phone, while wa_id can still find one", () => {
    expect(INBOUND_WEBHOOK_CHANNEL_SPECS.whatsapp).toMatchObject({
      channelUserId: { kind: "whatsappId" },
      creationIdentities: ["phone"],
    })
  })

  test("leaves omnichannel unusable", () => {
    expect(INBOUND_WEBHOOK_CHANNEL_SPECS.omnichannel).toEqual({
      inboxIdentifiers: [],
      channelUserId: null,
      creationIdentities: [],
    })
  })
})

describe("CONTACT_LOOKUP_ORDER", () => {
  test("searches by channel user id, phone, email, then full name", () => {
    expect(CONTACT_LOOKUP_ORDER).toEqual([
      "channelUserId",
      "phone",
      "email",
      "fullName",
    ])
  })
})

describe("PAYLOAD_RESOLVABLE_CHANNELS", () => {
  test("holds the channels with an external inbox id, never the fixed-inbox ones", () => {
    expect(PAYLOAD_RESOLVABLE_CHANNELS).toEqual([
      "messenger",
      "whatsapp",
      "zalo",
      "telegram",
      "instagram",
      "threads",
      "tiktok",
    ])
  })
})

describe("getInboxIdentifierStrategy", () => {
  test("returns the strategy a channel declares for a kind", () => {
    expect(getInboxIdentifierStrategy("whatsapp", "displayPhoneNumber")).toBe(
      "whatsappDisplayPhone",
    )
    expect(getInboxIdentifierStrategy("tiktok", "openId")).toBe(
      "connectionSourceId",
    )
  })

  test("returns undefined for a kind the channel does not declare", () => {
    expect(getInboxIdentifierStrategy("messenger", "igId")).toBeUndefined()
    expect(getInboxIdentifierStrategy("webchat", "pageId")).toBeUndefined()
  })
})

describe("missingCreationIdentityKinds", () => {
  test.each([
    ["messenger", ["channelUserId"], []],
    ["messenger", ["phone", "email", "fullName"], ["channelUserId"]],
    ["whatsapp", ["phone"], []],
    ["whatsapp", ["channelUserId"], ["phone"]],
    ["smtp", ["phone"], ["email"]],
    ["webchat", ["email"], []],
    ["webchat", ["fullName"], ["phone", "email"]],
    ["omnichannel", ["fullName"], []],
  ] as const)("%s with %j is missing %j", (channel, kinds, expected) => {
    expect(missingCreationIdentityKinds(channel, kinds)).toEqual(expected)
  })
})
