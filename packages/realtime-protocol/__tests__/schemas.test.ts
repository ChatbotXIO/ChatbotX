import { describe, expect, test } from "vitest"
import {
  realtimeBatchEnvelopeSchema,
  realtimeCallTransportEndedSchema,
  realtimeCallTransportIncomingSchema,
  realtimeCallTransportOutboundAnswerVoipSchema,
  realtimeCallTransportOutboundStatusVoipSchema,
  realtimeGuestBatchEnvelopeSchema,
  routeForAssignment,
  routeForConversation,
  whatsappCallClaimedElsewhereSchema,
} from "../src/schemas"

const CONVERSATION_SCOPED_ROUTE_ERROR_REGEX =
  /conversation-scoped and requires a route/

describe("realtime batch envelopes", () => {
  const route = { assignedTeamIds: [], assignedUserIds: ["user-1"] }

  test("preserves every event in one sequenced record frame", () => {
    const frame = realtimeBatchEnvelopeSchema.parse({
      batch: [
        { data: { id: "message-1" }, eventType: "messageCreated", route },
        { data: { id: "message-2" }, eventType: "messageCreated", route },
      ],
      seq: "123-0",
    })

    expect(frame.batch).toHaveLength(2)
    expect(frame.seq).toBe("123-0")
  })

  test("rejects a conversation-scoped event missing its route", () => {
    expect(() =>
      realtimeBatchEnvelopeSchema.parse({
        batch: [{ data: { id: "message-1" }, eventType: "messageCreated" }],
        seq: "123-0",
      }),
    ).toThrow(CONVERSATION_SCOPED_ROUTE_ERROR_REGEX)
  })

  test("allows a workspace-wide event with no route", () => {
    const frame = realtimeBatchEnvelopeSchema.parse({
      batch: [
        { data: { contactId: "contact-1" }, eventType: "contactBlocked" },
      ],
      seq: "123-0",
    })

    expect(frame.batch).toHaveLength(1)
  })

  test("rejects a whatsappCallPermissionUpdated event missing its route", () => {
    // Permission-mode changes are conversation-scoped.
    expect(() =>
      realtimeBatchEnvelopeSchema.parse({
        batch: [
          {
            data: { conversationId: "conv-1" },
            eventType: "whatsappCallPermissionUpdated",
          },
        ],
        seq: "123-0",
      }),
    ).toThrow(CONVERSATION_SCOPED_ROUTE_ERROR_REGEX)
  })

  test("allows a whatsappCallPermissionUpdated event with its route", () => {
    const frame = realtimeBatchEnvelopeSchema.parse({
      batch: [
        {
          data: { conversationId: "conv-1" },
          eventType: "whatsappCallPermissionUpdated",
          route,
        },
      ],
      seq: "123-0",
    })

    expect(frame.batch).toHaveLength(1)
  })
})

describe("realtime guest batch envelopes", () => {
  // Guest delivery is never route-filtered, including conversation-scoped
  // events.
  test("allows a conversation-scoped event with no route", () => {
    const frame = realtimeGuestBatchEnvelopeSchema.parse({
      batch: [{ data: { id: "message-1" }, eventType: "messageCreated" }],
      seq: "123-0",
    })

    expect(frame.batch).toHaveLength(1)
  })
})

describe("realtime event routes", () => {
  test("includes previous and current assignees for assignment changes", () => {
    expect(
      routeForAssignment({
        assignedInboxTeamId: "team-next",
        assignedUserId: "user-next",
        previousAssignedInboxTeamIds: ["team-previous"],
        previousAssignedUserIds: ["user-previous"],
      }),
    ).toEqual({
      assignedTeamIds: ["team-previous", "team-next"],
      assignedUserIds: ["user-previous", "user-next"],
    })
  })

  test("keeps conversation assignment and inbox routing data", () => {
    expect(
      routeForConversation({
        assignedInboxTeamId: "team-1",
        assignedUserId: "user-1",
        inboxId: "inbox-1",
      }),
    ).toEqual({
      assignedTeamIds: ["team-1"],
      assignedUserIds: ["user-1"],
      inboxId: "inbox-1",
    })
  })
})

describe("call payload schemas", () => {
  test("accepts a complete incoming directed offer", () => {
    expect(
      realtimeCallTransportIncomingSchema.parse({
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        deadlineAt: "2026-01-01T00:00:00.000Z",
        direction: "userInitiated",
        offer: { sdp: "offer", sdpType: "offer" },
        transport: "voip",
        wacid: "call-1",
        whatsappCallId: "whatsapp-call-1",
      }),
    ).toMatchObject({ transport: "voip" })
  })

  test("rejects an incoming payload with a non-offer session", () => {
    expect(() =>
      realtimeCallTransportIncomingSchema.parse({
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        deadlineAt: "2026-01-01T00:00:00.000Z",
        direction: "userInitiated",
        offer: { sdp: "answer", sdpType: "answer" },
        transport: "voip",
        wacid: "call-1",
        whatsappCallId: "whatsapp-call-1",
      }),
    ).toThrow()
  })

  test("validates terminal, claimed, and outbound call payloads", () => {
    expect(
      realtimeCallTransportEndedSchema.parse({
        status: "completed",
        transport: "voip",
        wacid: "call-1",
        whatsappCallId: "whatsapp-call-1",
      }),
    ).toMatchObject({ status: "completed" })
    expect(
      whatsappCallClaimedElsewhereSchema.parse({
        answeredByUserId: "user-1",
        wacid: "call-1",
        whatsappCallId: "whatsapp-call-1",
      }),
    ).toMatchObject({ answeredByUserId: "user-1" })
    expect(
      realtimeCallTransportOutboundAnswerVoipSchema.parse({
        attemptId: "attempt-1",
        session: { sdp: "answer", sdpType: "answer" },
        wacid: "call-1",
        whatsappCallId: "whatsapp-call-1",
      }),
    ).toMatchObject({ attemptId: "attempt-1" })
    expect(
      realtimeCallTransportOutboundStatusVoipSchema.parse({
        attemptId: "attempt-1",
        status: "ringing",
        wacid: "call-1",
        whatsappCallId: "whatsapp-call-1",
      }),
    ).toMatchObject({ status: "ringing" })
  })
})
