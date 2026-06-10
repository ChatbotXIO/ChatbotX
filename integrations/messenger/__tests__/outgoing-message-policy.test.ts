import { ChannelError } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { resolveMessengerMessagingPolicy } from "../src/handlers/message/outgoing-message"

const now = new Date("2026-06-09T00:00:00.000Z")

const makeContact = (lastIncomingMessageAt?: Date | string | null) => ({
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt,
})

describe("resolveMessengerMessagingPolicy", () => {
  test("uses RESPONSE for non-inbox sends", () => {
    expect(
      resolveMessengerMessagingPolicy({
        contact: makeContact(null),
        now,
      }),
    ).toEqual({ messagingType: "RESPONSE" })
  })

  test("uses RESPONSE for inbox sends inside 24 hours", () => {
    expect(
      resolveMessengerMessagingPolicy({
        contact: makeContact(new Date("2026-06-08T01:00:00.000Z")),
        now,
        sendFrom: "inbox",
      }),
    ).toEqual({ messagingType: "RESPONSE" })
  })

  test("handles serialized timestamps from BullMQ payloads", () => {
    expect(
      resolveMessengerMessagingPolicy({
        contact: makeContact("2026-06-08T01:00:00.000Z"),
        now,
        sendFrom: "inbox",
      }),
    ).toEqual({ messagingType: "RESPONSE" })
  })

  test("uses HUMAN_AGENT between 24 hours and 7 days", () => {
    expect(
      resolveMessengerMessagingPolicy({
        contact: makeContact(new Date("2026-06-07T23:00:00.000Z")),
        now,
        sendFrom: "inbox",
      }),
    ).toEqual({ messagingType: "MESSAGE_TAG", tag: "HUMAN_AGENT" })
  })

  test("uses RESPONSE for inbox sends without a valid last incoming timestamp", () => {
    expect(
      resolveMessengerMessagingPolicy({
        contact: makeContact(null),
        now,
        sendFrom: "inbox",
      }),
    ).toEqual({ messagingType: "RESPONSE" })
  })

  test("uses RESPONSE for inbox sends with an invalid last incoming timestamp", () => {
    expect(
      resolveMessengerMessagingPolicy({
        contact: makeContact("not-a-date"),
        now,
        sendFrom: "inbox",
      }),
    ).toEqual({ messagingType: "RESPONSE" })
  })

  test("throws for inbox sends after the 7-day human-agent window", () => {
    expect(() =>
      resolveMessengerMessagingPolicy({
        contact: makeContact(new Date("2026-06-01T23:59:59.000Z")),
        now,
        sendFrom: "inbox",
      }),
    ).toThrow(ChannelError)
  })
})
