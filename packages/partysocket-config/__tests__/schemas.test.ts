import { describe, expect, test } from "vitest"
import {
  REALTIME_EVENT_TOPICS,
  RealtimeEventType,
  RealtimeProtocol,
  RealtimeTopic,
  realtimeBatchEnvelopeSchema,
  realtimeCallTransportEndedSchema,
  realtimeCallTransportIncomingSchema,
  realtimeCallTransportOutboundAnswerVoipSchema,
  realtimeCallTransportOutboundStatusVoipSchema,
  realtimeEventEnvelopeSchema,
  realtimeProtocolSchema,
  realtimeSubscriptionMessageSchema,
  serializeRealtimeSubscriptionMessage,
  whatsappCallClaimedElsewhereSchema,
} from "../src/schemas"

describe("realtimeCallTransportIncomingSchema", () => {
  test("parses a valid incoming payload carrying the offer", () => {
    const payload = {
      transport: "voip",
      whatsappCallId: "call-1",
      wacid: "wamid.ABC",
      direction: "userInitiated",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactName: "Kerry Fisher",
      offer: { sdpType: "offer", sdp: "v=0..." },
      deadlineAt: "2026-09-14T00:00:30.000Z",
    }

    const result = realtimeCallTransportIncomingSchema.parse(payload)
    expect(result).toEqual(payload)
  })

  test("rejects an incoming payload missing the offer", () => {
    expect(() =>
      realtimeCallTransportIncomingSchema.parse({
        transport: "voip",
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
        direction: "userInitiated",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
      }),
    ).toThrow()
  })

  test("rejects an unknown transport value", () => {
    expect(() =>
      realtimeCallTransportIncomingSchema.parse({
        transport: "sip",
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
        direction: "userInitiated",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        offer: { sdpType: "offer", sdp: "v=0..." },
        deadlineAt: "2026-09-14T00:00:30.000Z",
      }),
    ).toThrow()
  })
})

describe("realtimeCallTransportEndedSchema", () => {
  test("parses a valid ended payload", () => {
    const payload = {
      transport: "voip",
      whatsappCallId: "call-1",
      wacid: "wamid.ABC",
      status: "completed",
    }

    const result = realtimeCallTransportEndedSchema.parse(payload)
    expect(result).toEqual(payload)
  })

  test("rejects an unknown transport value", () => {
    expect(() =>
      realtimeCallTransportEndedSchema.parse({
        transport: "pstn",
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
        status: "completed",
      }),
    ).toThrow()
  })

  test("rejects an unknown status value", () => {
    expect(() =>
      realtimeCallTransportEndedSchema.parse({
        transport: "voip",
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
        status: "missed",
      }),
    ).toThrow()
  })
})

describe("whatsappCallClaimedElsewhereSchema", () => {
  test("parses a valid claimed-elsewhere payload", () => {
    const payload = {
      whatsappCallId: "call-1",
      wacid: "wamid.ABC",
      answeredByUserId: "user-1",
    }

    const result = whatsappCallClaimedElsewhereSchema.parse(payload)
    expect(result).toEqual(payload)
  })

  test("rejects a payload missing answeredByUserId", () => {
    expect(() =>
      whatsappCallClaimedElsewhereSchema.parse({
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
      }),
    ).toThrow()
  })

  test("has the eventType registered on RealtimeEventType", () => {
    expect(RealtimeEventType.whatsappCallClaimedElsewhere).toBe(
      "whatsappCallClaimedElsewhere",
    )
  })
})

describe("realtimeCallTransportOutboundAnswerVoipSchema", () => {
  test("parses a valid outbound answer payload", () => {
    const payload = {
      whatsappCallId: "call-1",
      wacid: "wamid.ABC",
      attemptId: "attempt-1",
      session: { sdpType: "answer", sdp: "v=0..." },
    }

    const result = realtimeCallTransportOutboundAnswerVoipSchema.parse(payload)
    expect(result).toEqual(payload)
  })

  test("rejects a non-answer sdpType", () => {
    expect(() =>
      realtimeCallTransportOutboundAnswerVoipSchema.parse({
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
        attemptId: "attempt-1",
        session: { sdpType: "offer", sdp: "v=0..." },
      }),
    ).toThrow()
  })

  test("has the eventType registered on RealtimeEventType", () => {
    expect(RealtimeEventType.whatsappCallOutboundAnswer).toBe(
      "whatsappCallOutboundAnswer",
    )
  })
})

describe("realtimeCallTransportOutboundStatusVoipSchema", () => {
  test("parses a valid ringing status payload", () => {
    const payload = {
      whatsappCallId: "call-1",
      wacid: "wamid.ABC",
      attemptId: "attempt-1",
      status: "ringing",
    }

    const result = realtimeCallTransportOutboundStatusVoipSchema.parse(payload)
    expect(result).toEqual(payload)
  })

  test("parses a valid accepted status payload", () => {
    const payload = {
      whatsappCallId: "call-1",
      wacid: "wamid.ABC",
      attemptId: "attempt-1",
      status: "accepted",
    }

    const result = realtimeCallTransportOutboundStatusVoipSchema.parse(payload)
    expect(result).toEqual(payload)
  })

  test("rejects an unknown status value", () => {
    expect(() =>
      realtimeCallTransportOutboundStatusVoipSchema.parse({
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
        attemptId: "attempt-1",
        status: "rejected",
      }),
    ).toThrow()
  })

  test("has the eventType registered on RealtimeEventType", () => {
    expect(RealtimeEventType.whatsappCallOutboundStatus).toBe(
      "whatsappCallOutboundStatus",
    )
  })
})

describe("REALTIME_EVENT_TOPICS", () => {
  test("every RealtimeEventType has at least one registered topic", () => {
    for (const eventType of Object.values(RealtimeEventType)) {
      expect(REALTIME_EVENT_TOPICS[eventType]?.length).toBeGreaterThan(0)
    }
  })

  test("every registered topic is a known RealtimeTopic value", () => {
    const knownTopics = new Set(Object.values(RealtimeTopic))
    for (const topics of Object.values(REALTIME_EVENT_TOPICS)) {
      for (const topic of topics) {
        expect(knownTopics.has(topic)).toBe(true)
      }
    }
  })

  test("conversationAssigned carries both chat and voip — it must never be gated as chat-only", () => {
    expect(REALTIME_EVENT_TOPICS.conversationAssigned).toEqual(
      expect.arrayContaining([RealtimeTopic.chat, RealtimeTopic.voip]),
    )
  })
})

describe("realtime event envelopes", () => {
  test("accepts known event types in single and batch envelopes", () => {
    const event = { eventType: RealtimeEventType.messageCreated, data: {} }

    expect(realtimeEventEnvelopeSchema.parse(event)).toEqual(event)
    expect(realtimeBatchEnvelopeSchema.parse({ batch: [event] })).toEqual({
      batch: [event],
    })
  })

  test("keeps unrecognized event types available to forward-compatible clients", () => {
    const event = { eventType: "constructor", data: {} }

    expect(realtimeEventEnvelopeSchema.parse(event)).toEqual(event)
  })
})

describe("realtimeProtocolSchema", () => {
  test("accepts the declared protocol values only", () => {
    expect(realtimeProtocolSchema.parse(RealtimeProtocol.v1)).toBe("v1")
    expect(realtimeProtocolSchema.parse(RealtimeProtocol.v2)).toBe("v2")
    expect(() => realtimeProtocolSchema.parse("v3")).toThrow()
  })
})

describe("realtimeSubscriptionMessageSchema", () => {
  test("parses a valid subscribe frame", () => {
    const payload = { type: "subscribe", topics: ["chat", "voip"] }

    expect(realtimeSubscriptionMessageSchema.parse(payload)).toEqual(payload)
  })

  test("parses an empty topic list", () => {
    const payload = { type: "subscribe", topics: [] }

    expect(realtimeSubscriptionMessageSchema.parse(payload)).toEqual(payload)
  })

  test("rejects an unknown topic", () => {
    expect(() =>
      realtimeSubscriptionMessageSchema.parse({
        type: "subscribe",
        topics: ["billing"],
      }),
    ).toThrow()
  })

  test("rejects a wrong message type", () => {
    expect(() =>
      realtimeSubscriptionMessageSchema.parse({
        type: "presence-ping",
        topics: [],
      }),
    ).toThrow()
  })
})

describe("serializeRealtimeSubscriptionMessage", () => {
  test("round-trips through the schema it pairs with", () => {
    const wire = serializeRealtimeSubscriptionMessage([
      RealtimeTopic.chat,
      RealtimeTopic.voip,
    ])

    const parsed = realtimeSubscriptionMessageSchema.parse(JSON.parse(wire))
    expect(parsed).toEqual({
      type: "subscribe",
      topics: ["chat", "voip"],
    })
  })
})
