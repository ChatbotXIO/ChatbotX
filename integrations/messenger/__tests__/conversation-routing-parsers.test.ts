import { describe, expect, it } from "vitest"
import {
  classifyMessagingRoutingItem,
  messengerTimestampToOccurredAt,
  parseAppRolesEvent,
  parseHandoverEvent,
  parseRequestEvent,
  parseRoutingJobBody,
  parseStandbyDelivery,
} from "../src/lib/conversation-routing"

const PSID = "psid-1"
const PAGE = "page-1"
// 2025-08-20T13:00:00.000Z plus 750ms: must floor to the whole second.
const TS_MS = 1_755_694_800_750
const TS_FLOORED = new Date(1_755_694_800_000)
const NOW = new Date("2026-01-01T00:00:00.900Z")

const passItem = (payload: Record<string, unknown> = {}): unknown => ({
  sender: { id: PSID },
  recipient: { id: PAGE },
  timestamp: TS_MS,
  pass_thread_control: { new_owner_app_id: "111", ...payload },
})

describe("messengerTimestampToOccurredAt", () => {
  it("floors milliseconds to whole seconds", () => {
    expect(messengerTimestampToOccurredAt(TS_MS, NOW)).toEqual(TS_FLOORED)
  })

  it("floors a numeric string too", () => {
    expect(messengerTimestampToOccurredAt(String(TS_MS), NOW)).toEqual(
      TS_FLOORED,
    )
  })

  it("falls back to the floored clock when unusable", () => {
    expect(messengerTimestampToOccurredAt(undefined, NOW)).toEqual(
      new Date("2026-01-01T00:00:00.000Z"),
    )
    expect(messengerTimestampToOccurredAt(-5, NOW).getTime() % 1000).toBe(0)
  })
})

describe("classifyMessagingRoutingItem", () => {
  it("classifies routing structures and ignores ordinary items", () => {
    expect(classifyMessagingRoutingItem(passItem())).toBe("handover")
    expect(classifyMessagingRoutingItem({ take_thread_control: {} })).toBe(
      "handover",
    )
    expect(classifyMessagingRoutingItem({ request_thread_control: {} })).toBe(
      "handoverRequest",
    )
    expect(classifyMessagingRoutingItem({ app_roles: {} })).toBe("appRoles")
    expect(classifyMessagingRoutingItem({ message: { mid: "m" } })).toBeNull()
    expect(classifyMessagingRoutingItem("nope")).toBeNull()
  })
})

describe("parseHandoverEvent", () => {
  it("maps pass_thread_control to controlPassed with the owner app id", () => {
    const event = parseHandoverEvent(
      passItem({ previous_owner_app_id: 222 }),
      NOW,
    )
    expect(event).toEqual({
      contact: { sourceId: PSID },
      event: "controlPassed",
      previousOwnerRole: null,
      newOwnerRole: null,
      previousOwnerAppId: "222",
      newOwnerAppId: "111",
      occurredAt: TS_FLOORED,
    })
  })

  it("maps take_thread_control to controlTaken", () => {
    const event = parseHandoverEvent(
      {
        sender: { id: PSID },
        timestamp: TS_MS,
        take_thread_control: { previous_owner_app_id: "222" },
      },
      NOW,
    )
    expect(event?.event).toBe("controlTaken")
    expect(event?.previousOwnerAppId).toBe("222")
    expect(event?.newOwnerAppId).toBeUndefined()
    expect(event?.occurredAt).toEqual(TS_FLOORED)
  })

  it("floors a sub-second millisecond timestamp", () => {
    const event = parseHandoverEvent(passItem(), NOW)
    expect(event?.occurredAt.getTime() % 1000).toBe(0)
    expect(event?.occurredAt.getTime()).toBeLessThan(TS_MS)
  })

  it("reads the nested thread_control_metadata.text as the note", () => {
    const event = parseHandoverEvent(
      passItem({ thread_control_metadata: { text: "AI transfer" } }),
      NOW,
    )
    expect(event?.handoverNote).toBe("AI transfer")
  })

  it("falls back to a flat metadata string", () => {
    expect(
      parseHandoverEvent(passItem({ metadata: "flat note" }), NOW)
        ?.handoverNote,
    ).toBe("flat note")
  })

  it("degrades an unusable metadata shape instead of dropping the event", () => {
    const event = parseHandoverEvent(passItem({ metadata: { a: 1 } }), NOW)
    expect(event?.event).toBe("controlPassed")
    expect(event?.handoverNote).toBeUndefined()
  })

  it("returns null (never throws) for malformed items", () => {
    expect(parseHandoverEvent(null)).toBeNull()
    expect(parseHandoverEvent("x")).toBeNull()
    expect(parseHandoverEvent({ timestamp: TS_MS })).toBeNull()
    expect(parseHandoverEvent({ sender: { id: PSID } })).toBeNull()
  })
})

describe("app_roles and request kinds", () => {
  const appRoles = {
    recipient: { id: PAGE },
    timestamp: TS_MS,
    app_roles: { "111": ["primary_receiver"] },
  }

  it("parses app_roles as its own kind without a contact", () => {
    expect(parseAppRolesEvent(appRoles, NOW)).toEqual({
      accountId: PAGE,
      roles: { "111": ["primary_receiver"] },
      occurredAt: TS_FLOORED,
    })
    expect(parseRoutingJobBody("appRoles", appRoles, NOW)).toEqual({
      kind: "appRoles",
      event: {
        accountId: PAGE,
        roles: { "111": ["primary_receiver"] },
        occurredAt: TS_FLOORED,
      },
    })
    expect(parseAppRolesEvent({ recipient: { id: PAGE } })).toBeNull()
  })

  it("parses request_thread_control as a request kind", () => {
    const item = {
      sender: { id: PSID },
      timestamp: TS_MS,
      request_thread_control: { requested_owner_app_id: 333, metadata: "hi" },
    }
    expect(parseRequestEvent(item, NOW)).toEqual({
      contact: { sourceId: PSID },
      requestedOwnerAppId: "333",
      handoverNote: "hi",
      occurredAt: TS_FLOORED,
    })
    expect(parseRoutingJobBody("handoverRequest", item, NOW)?.kind).toBe(
      "handoverRequest",
    )
    expect(parseRequestEvent({})).toBeNull()
  })

  it("routes a handover job body to the handover kind", () => {
    expect(parseRoutingJobBody("handover", passItem(), NOW)?.kind).toBe(
      "handover",
    )
    expect(parseRoutingJobBody("handover", {}, NOW)).toBeNull()
  })
})

describe("parseStandbyDelivery", () => {
  it("parses a standby message with a floored timestamp", () => {
    expect(
      parseStandbyDelivery(
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: TS_MS,
          message: { mid: "m.1", text: "hi" },
        },
        NOW,
      ),
    ).toEqual({
      contact: { sourceId: PSID },
      mid: "m.1",
      occurredAt: TS_FLOORED,
      isEcho: false,
    })
  })

  it("tolerates a postback whose payload was stripped", () => {
    const delivery = parseStandbyDelivery(
      {
        sender: { id: PSID },
        recipient: { id: PAGE },
        timestamp: TS_MS,
        postback: {},
      },
      NOW,
    )
    expect(delivery?.contact.sourceId).toBe(PSID)
    expect(delivery?.mid).toBeUndefined()
  })

  it("addresses the user via recipient for an echo", () => {
    const delivery = parseStandbyDelivery({
      sender: { id: PAGE },
      recipient: { id: PSID },
      timestamp: TS_MS,
      message: { mid: "m.2", is_echo: true },
    })
    expect(delivery?.contact.sourceId).toBe(PSID)
    expect(delivery?.isEcho).toBe(true)
  })

  it("returns null for a malformed item", () => {
    expect(parseStandbyDelivery({ message: { mid: "m" } })).toBeNull()
  })
})
