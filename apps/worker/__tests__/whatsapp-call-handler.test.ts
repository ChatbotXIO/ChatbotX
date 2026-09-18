import { CALL_CANCELED_BY_BUSINESS_LAST_ERROR } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const STATUS_ROW_NOT_READY_PATTERN = /whatsapp-call-status-row-not-ready/

const mocks = vi.hoisted(() => ({
  identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  detectContactAndConversation: vi.fn(),
  findByWacid: vi.fn(),
  findByAttemptId: vi.fn(),
  createIfAbsent: vi.fn(),
  updateInterimStatus: vi.fn(),
  markAcceptedIfActive: vi.fn(),
  attachWacid: vi.fn(),
  updateContentBySourceId: vi.fn(),
  emitIncomingCall: vi.fn(),
  finalizeCallSideEffects: vi.fn(),
  markOutboundRinging: vi.fn(),
  markOutboundAccepted: vi.fn(),
  sendToWorkspaceMember: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallLifecycleService: {
    recordIncomingCall: mocks.createIfAbsent,
    advanceInterimStatus: mocks.updateInterimStatus,
  },
  whatsappVoipCallService: {
    markOutboundRinging: mocks.markOutboundRinging,
    markOutboundAccepted: mocks.markOutboundAccepted,
    markAcceptedByAgent: mocks.markAcceptedIfActive,
    attachMetaCallId: mocks.attachWacid,
  },
  sendToWorkspaceMember: mocks.sendToWorkspaceMember,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByWacid: mocks.findByWacid,
    findByAttemptId: mocks.findByAttemptId,
  },
  createMessageRepository: vi.fn(async () => ({
    updateContentBySourceId: mocks.updateContentBySourceId,
  })),
}))

vi.mock("@chatbotx.io/events", () => ({
  setWebhookExecutionContext: vi.fn(),
  emitIncomingCall: mocks.emitIncomingCall,
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier:
      mocks.identifyInboxAndIntegrationAuthFromIdentifier,
  },
}))

vi.mock("../src/integration/handlers/received-message", () => ({
  detectContactAndConversation: mocks.detectContactAndConversation,
}))

// The message/tracking/broadcast/trigger internals are the shared module's
// own responsibility (tested in whatsapp-call-finalize.test.ts) — this file
// only asserts that the handler calls it with the right `call`/`entity`.
vi.mock("../src/integration/handlers/shared/whatsapp-call-finalize", () => ({
  finalizeCallSideEffects: mocks.finalizeCallSideEffects,
  buildCallActivityText: (entity: { status: string }) =>
    entity.status === "rejected" ? "Declined voice call" : "Missed voice call",
  callActivitySourceId: (callId: string) => `wacall-${callId}`,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mocks.logger,
}))

const { handleWhatsappCallEvent } = await import(
  "../src/integration/handlers/whatsapp-call"
)

const inbox = { id: "inbox-1", workspaceId: "ws-1", channel: "whatsapp" }
const integrationRow = { id: "iw-1", auth: {}, inboxId: "inbox-1" }

const callRow = {
  id: "call-1",
  wacid: "wacid.ABC",
  attemptId: null as string | null,
  direction: "userInitiated" as const,
  status: "ringing" as const,
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
}

const pendingOutboundRow = {
  id: "call-pending",
  wacid: null as string | null,
  attemptId: "att-1",
  direction: "businessInitiated" as const,
  status: "ringing" as const,
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
}

const outboundCallRow = {
  id: "call-out-1",
  wacid: "wacid.OUT",
  attemptId: "att-1",
  direction: "businessInitiated" as const,
  status: "ringing" as const,
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  answeredByUserId: "initiator-1" as string | null,
}

const baseData = {
  integrationType: "whatsapp" as const,
  integrationIdentifier: "phone-1",
}

describe("handleWhatsappCallEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.identifyInboxAndIntegrationAuthFromIdentifier.mockResolvedValue({
      inbox,
      integrationRow,
    })
    mocks.detectContactAndConversation.mockResolvedValue({
      contactInbox: { id: "ci-1", contactId: "contact-1" },
      contact: { id: "contact-1" },
      conversation: { id: "conv-1", workspaceId: "ws-1" },
      isNewContact: false,
    })
    mocks.createIfAbsent.mockResolvedValue({ call: callRow, isNew: true })
    mocks.findByWacid.mockResolvedValue(callRow)
    mocks.attachWacid.mockResolvedValue({
      ...pendingOutboundRow,
      wacid: "wacid.OUT",
    })
    mocks.findByAttemptId.mockResolvedValue(undefined)
    mocks.markOutboundRinging.mockResolvedValue(true)
    mocks.markOutboundAccepted.mockResolvedValue(true)
    mocks.markAcceptedIfActive.mockResolvedValue({
      ...outboundCallRow,
      status: "accepted",
    })
    mocks.sendToWorkspaceMember.mockResolvedValue({ ok: true })
  })

  describe("connect", () => {
    test("userInitiated creates the call row for the resolved contact", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001", name: "Kerry" },
          event: {
            kind: "connect",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            from: "84900000001",
            to: "16505551111",
            timestamp: "1755700000",
          },
        },
      })

      expect(mocks.createIfAbsent).toHaveBeenCalledWith({
        wacid: "wacid.ABC",
        direction: "userInitiated",
        status: "ringing",
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      })
      expect(mocks.emitIncomingCall).toHaveBeenCalledWith("ws-1", "contact-1", {
        callId: "wacid.ABC",
        conversationId: "conv-1",
      })
    })

    test("R2: a Username/BSUID-only caller (no wa_id, no from) resolves via the BSUID and still rings", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { userId: "bsuid-123", username: "kerryf", name: "Kerry" },
          event: {
            kind: "connect",
            wacid: "wacid.BSUID",
            direction: "userInitiated",
            fromUserId: "bsuid-123",
          },
        },
      })

      expect(mocks.detectContactAndConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          incomingContact: expect.objectContaining({
            sourceId: "bsuid-123",
            sourceUserId: "bsuid-123",
            sourceUsername: "kerryf",
          }),
        }),
      )
      expect(mocks.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ wacid: "wacid.BSUID", status: "ringing" }),
      )
      expect(mocks.emitIncomingCall).toHaveBeenCalled()
    })

    test("D2: a payload contact that disagrees with the item's from_user_id lets the item's identity decide sourceId", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          // Belongs to a DIFFERENT batched item — must never win over the
          // item's own from_user_id.
          contact: { userId: "bsuid-other", name: "Wrong Name" },
          event: {
            kind: "connect",
            wacid: "wacid.MISMATCH",
            direction: "userInitiated",
            fromUserId: "bsuid-correct",
          },
        },
      })

      expect(mocks.detectContactAndConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          incomingContact: expect.objectContaining({
            sourceId: "bsuid-correct",
            sourceUserId: "bsuid-correct",
          }),
        }),
      )
    })

    test("D2: a mismatched payload contact's username/name never reach detectContactAndConversation", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: {
            userId: "bsuid-other",
            username: "wrong-username",
            name: "Wrong Name",
          },
          event: {
            kind: "connect",
            wacid: "wacid.MISMATCH-2",
            direction: "userInitiated",
            fromUserId: "bsuid-correct",
          },
        },
      })

      expect(mocks.detectContactAndConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          incomingContact: expect.objectContaining({
            sourceUsername: undefined,
            firstName: undefined,
          }),
        }),
      )
    })

    test("D2 regression: a real Meta call item (from_user_id only, no `from`) with a MATCHING contacts[] entry keys by the phone number, not the BSUID", async () => {
      // The exact production shape: `calls.ts`'s `pickContactForCallItem`
      // already resolved this contact for this item upstream, so it is safe
      // to enrich the identity the item itself omitted.
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: {
            waId: "84349566550",
            userId: "VN.1506778474525162",
            name: "Hung Phan",
          },
          event: {
            kind: "connect",
            wacid: "wacid.PROD-1",
            direction: "userInitiated",
            fromUserId: "VN.1506778474525162",
            to: "6287744910069",
          },
        },
      })

      expect(mocks.detectContactAndConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          incomingContact: expect.objectContaining({
            sourceId: "84349566550",
            sourceUserId: "VN.1506778474525162",
          }),
        }),
      )
    })

    test("D2 regression: a genuinely BSUID-only caller (contact has no wa_id) still keys by the BSUID", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { userId: "bsuid-only-1", name: "No Phone Exposed" },
          event: {
            kind: "connect",
            wacid: "wacid.PROD-2",
            direction: "userInitiated",
            fromUserId: "bsuid-only-1",
          },
        },
      })

      expect(mocks.detectContactAndConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          incomingContact: expect.objectContaining({
            sourceId: "bsuid-only-1",
            sourceUserId: "bsuid-only-1",
          }),
        }),
      )
    })

    test("redelivered connect does not re-fire the incomingCall event", async () => {
      mocks.createIfAbsent.mockResolvedValue({ call: callRow, isNew: false })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "connect",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            from: "84900000001",
          },
        },
      })

      expect(mocks.emitIncomingCall).not.toHaveBeenCalled()
    })

    test("R23: businessInitiated NEVER creates a row — with no prior wacid and no attemptId echo (SIP-mode/legacy shape), correlation is unmatched and nothing is attached", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "connect",
            wacid: "wacid.OUT",
            direction: "businessInitiated",
            to: "84900000001",
            timestamp: "1755700000",
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.attachWacid).not.toHaveBeenCalled()
      expect(mocks.emitIncomingCall).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "outbound-correlation-unmatched" }),
        expect.any(String),
      )
    })

    test("L1: VoIP outbound connect whose wacid is already attached (attachWacid ran synchronously in the initiate action) resolves directly — never logs outbound-correlation-ambiguous, never re-attaches", async () => {
      mocks.findByWacid.mockResolvedValue(outboundCallRow)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "connect",
            wacid: "wacid.OUT",
            direction: "businessInitiated",
            to: "84900000001",
            timestamp: "1755700000",
          },
        },
      })

      expect(mocks.findByWacid).toHaveBeenCalledWith("wacid.OUT")
      expect(mocks.attachWacid).not.toHaveBeenCalled()
      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "outbound-correlation-ambiguous" }),
        expect.any(String),
      )
    })

    test("L1: resolves via findByAttemptId (Meta's echoed biz_opaque_callback_data) before the time-window heuristic", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)
      mocks.findByAttemptId.mockResolvedValue(pendingOutboundRow)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "connect",
            wacid: "wacid.OUT",
            direction: "businessInitiated",
            to: "84900000001",
            timestamp: "1755700000",
            bizOpaqueCallbackData: "att-1",
          },
        },
      })

      expect(mocks.findByAttemptId).toHaveBeenCalledWith("att-1")
      expect(mocks.attachWacid).toHaveBeenCalledWith({
        whatsappCallId: "call-pending",
        wacid: "wacid.OUT",
      })
      expect(mocks.logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "outbound-correlation-ambiguous" }),
        expect.any(String),
      )
    })

    test("R23: businessInitiated with an attemptId echo that matches no pending attempt logs unmatched and creates/attaches nothing (no time-window fallback)", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)
      mocks.findByAttemptId.mockResolvedValue(undefined)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "connect",
            wacid: "wacid.OUT",
            direction: "businessInitiated",
            to: "84900000001",
            bizOpaqueCallbackData: "att-unknown",
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.attachWacid).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "outbound-correlation-unmatched",
          attemptId: "att-unknown",
        }),
        expect.any(String),
      )
    })
  })

  describe("status", () => {
    test("interim status advances an existing row", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "status",
            wacid: "wacid.ABC",
            status: "ACCEPTED",
            timestamp: "1755700005",
          },
        },
      })

      expect(mocks.updateInterimStatus).toHaveBeenCalledWith({
        wacid: "wacid.ABC",
        status: "accepted",
        current: expect.objectContaining({ wacid: "wacid.ABC" }),
      })
    })

    test("late REJECTED after a failed terminate repairs the activity message keyed by the id-based sourceId", async () => {
      mocks.findByWacid.mockResolvedValue({ ...callRow, status: "failed" })
      mocks.updateInterimStatus.mockResolvedValue({ previousStatus: "failed" })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "status",
            wacid: "wacid.ABC",
            status: "REJECTED",
            timestamp: "1755700050",
          },
        },
      })

      expect(mocks.updateContentBySourceId).toHaveBeenCalledWith(
        "wacall-call-1",
        "ws-1",
        {
          text: "Declined voice call",
          contentAttributes: {
            type: "whatsapp_call",
            direction: "userInitiated",
            status: "rejected",
          },
        },
      )
    })

    test("interim status on a live call does not touch the message", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: { kind: "status", wacid: "wacid.ABC", status: "ACCEPTED" },
        },
      })

      expect(mocks.updateContentBySourceId).not.toHaveBeenCalled()
    })

    test("interim status without a row warns and skips", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: { kind: "status", wacid: "wacid.MISSING", status: "RINGING" },
        },
      })

      expect(mocks.updateInterimStatus).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        { wacid: "wacid.MISSING", status: "RINGING" },
        "Whatsapp call status skipped: call row not found",
      )
    })

    test("ACCEPTED without a resolvable row throws so BullMQ retries (row is created pre-dial)", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)
      mocks.findByAttemptId.mockResolvedValue(undefined)

      await expect(
        handleWhatsappCallEvent({
          ...baseData,
          payload: {
            phoneNumberId: "phone-1",
            event: {
              kind: "status",
              wacid: "wacid.MISSING",
              status: "ACCEPTED",
            },
          },
        }),
      ).rejects.toThrow(STATUS_ROW_NOT_READY_PATTERN)

      expect(mocks.markAcceptedIfActive).not.toHaveBeenCalled()
    })
  })

  describe("status: businessInitiated (outbound)", () => {
    beforeEach(() => {
      mocks.findByWacid.mockResolvedValue(outboundCallRow)
    })

    test("RINGING advances the interim status and best-effort advances the outbound control", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: { kind: "status", wacid: "wacid.OUT", status: "RINGING" },
        },
      })

      expect(mocks.updateInterimStatus).toHaveBeenCalledWith({
        wacid: "wacid.OUT",
        status: "ringing",
        current: outboundCallRow,
      })
      expect(mocks.markOutboundRinging).toHaveBeenCalledWith({
        wacid: "wacid.OUT",
      })
      expect(mocks.markAcceptedIfActive).not.toHaveBeenCalled()
      expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
        { workspaceId: "ws-1", userId: "initiator-1" },
        {
          eventType: "whatsappCallOutboundStatus",
          data: {
            whatsappCallId: "call-out-1",
            wacid: "wacid.OUT",
            attemptId: "att-1",
            status: "ringing",
          },
        },
      )
    })

    test("ACCEPTED marks accepted via the authoritative markAcceptedIfActive and best-effort advances the control", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: { kind: "status", wacid: "wacid.OUT", status: "ACCEPTED" },
        },
      })

      expect(mocks.markAcceptedIfActive).toHaveBeenCalledWith({
        whatsappCallId: "call-out-1",
        agentUserId: "initiator-1",
      })
      expect(mocks.markOutboundAccepted).toHaveBeenCalledWith({
        wacid: "wacid.OUT",
      })
      expect(mocks.updateInterimStatus).not.toHaveBeenCalled()
      expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
        { workspaceId: "ws-1", userId: "initiator-1" },
        {
          eventType: "whatsappCallOutboundStatus",
          data: {
            whatsappCallId: "call-out-1",
            wacid: "wacid.OUT",
            attemptId: "att-1",
            status: "accepted",
          },
        },
      )
    })

    test("ACCEPTED on a row with no initiator logs a warning and never marks accepted", async () => {
      mocks.findByWacid.mockResolvedValue({
        ...outboundCallRow,
        answeredByUserId: null,
      })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: { kind: "status", wacid: "wacid.OUT", status: "ACCEPTED" },
        },
      })

      expect(mocks.markAcceptedIfActive).not.toHaveBeenCalled()
      expect(mocks.markOutboundAccepted).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalled()
      expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
    })

    test("a realtime send failure for the outbound status event is swallowed (warn) without failing the handler", async () => {
      mocks.sendToWorkspaceMember.mockResolvedValue(null)

      await expect(
        handleWhatsappCallEvent({
          ...baseData,
          payload: {
            phoneNumberId: "phone-1",
            event: { kind: "status", wacid: "wacid.OUT", status: "RINGING" },
          },
        }),
      ).resolves.toBeUndefined()

      expect(mocks.sendToWorkspaceMember).toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          whatsappCallId: "call-out-1",
          status: "ringing",
        }),
        expect.stringContaining("unable to deliver"),
      )
    })

    test("a realtime send throw for the outbound status event is swallowed (warn) without failing the handler", async () => {
      mocks.sendToWorkspaceMember.mockRejectedValue(new Error("network down"))

      await expect(
        handleWhatsappCallEvent({
          ...baseData,
          payload: {
            phoneNumberId: "phone-1",
            event: { kind: "status", wacid: "wacid.OUT", status: "ACCEPTED" },
          },
        }),
      ).resolves.toBeUndefined()

      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          whatsappCallId: "call-out-1",
          status: "accepted",
        }),
        expect.stringContaining("threw unexpectedly"),
      )
    })

    test("REJECTED finalizes immediately via the shared side-effect path", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: { kind: "status", wacid: "wacid.OUT", status: "REJECTED" },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
        call: outboundCallRow,
        entity: {
          type: "whatsapp_call",
          direction: "businessInitiated",
          status: "rejected",
        },
      })
      expect(mocks.updateInterimStatus).not.toHaveBeenCalled()
    })

    test("resolves the row via attemptId (biz_opaque_callback_data) when wacid isn't attached yet", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)
      mocks.findByAttemptId.mockResolvedValue(outboundCallRow)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "status",
            wacid: "wacid.OUT",
            status: "RINGING",
            bizOpaqueCallbackData: "att-1",
          } as never,
        },
      })

      expect(mocks.findByAttemptId).toHaveBeenCalledWith("att-1")
      expect(mocks.markOutboundRinging).toHaveBeenCalledWith({
        wacid: "wacid.OUT",
      })
    })
  })

  describe("terminate", () => {
    test("userInitiated with an existing row finalizes via the shared side-effect function", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "COMPLETED",
            timestamp: "1755700100",
            startTime: "1755700010",
            endTime: "1755700100",
            durationSeconds: 90,
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
        call: callRow,
        entity: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "completed",
          durationSeconds: 90,
        },
        endedAt: new Date(1_755_700_100 * 1000),
        startedAt: new Date(1_755_700_010 * 1000),
      })
    })

    // Meta omits `start_time`/`duration` on a call it terminated without media
    // ever flowing, even when an agent really did answer it. Our own row knows
    // better: it only reaches `accepted` after Meta accepted the call.
    test("an ACCEPTED row terminated with no start_time or duration is still a completed call, never missed", async () => {
      mocks.findByWacid.mockResolvedValue({ ...callRow, status: "accepted" })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "COMPLETED",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: expect.objectContaining({
            status: "completed",
            // No duration to report — better than claiming a 0-second call.
            durationSeconds: undefined,
          }),
        }),
      )
    })

    // The agent's own hangup finalizes the row `completed` before Meta's
    // terminate arrives; that trailing webhook must not downgrade it.
    test("a late terminate never downgrades a row an agent already completed", async () => {
      mocks.findByWacid.mockResolvedValue({ ...callRow, status: "completed" })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "FAILED",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: expect.objectContaining({ status: "completed" }),
        }),
      )
    })

    // The original guard must survive: a call NOBODY answered still renders as
    // missed, so its card never waits on a recording that cannot exist.
    test("a never-answered row terminated as COMPLETED with no timestamps is still failed", async () => {
      mocks.findByWacid.mockResolvedValue({ ...callRow, status: "ringing" })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "COMPLETED",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: expect.objectContaining({ status: "failed" }),
        }),
      )
    })

    test("failed terminate after a rejected status renders the entity as rejected", async () => {
      mocks.findByWacid.mockResolvedValue({ ...callRow, status: "rejected" })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            status: "FAILED",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: expect.objectContaining({ status: "rejected" }),
        }),
      )
    })

    test("userInitiated without a prior row upserts (createIfAbsent) before finalizing", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "terminate",
            wacid: "wacid.NEW",
            direction: "userInitiated",
            status: "FAILED",
            from: "84900000001",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.createIfAbsent).toHaveBeenCalled()
      expect(mocks.finalizeCallSideEffects).toHaveBeenCalled()
    })

    test("no direction and no prior row: skipped, never recorded as an inbound call that never happened", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "terminate",
            wacid: "wacid.NODIR",
            status: "COMPLETED",
            from: "84900000001",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ wacid: "wacid.NODIR" }),
        "Whatsapp call terminate skipped: missing direction",
      )
    })

    test("no direction but an EXISTING row still finalizes — direction comes off the row, not the event", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "terminate",
            wacid: "wacid.1",
            status: "COMPLETED",
            from: "84900000001",
            timestamp: "1755700100",
            durationSeconds: 12,
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalled()
    })

    test("R23: businessInitiated without a prior row attaches via the exact attemptId match and finalizes it (no time-window fallback)", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)
      mocks.findByAttemptId.mockResolvedValue(pendingOutboundRow)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "terminate",
            wacid: "wacid.OUT",
            direction: "businessInitiated",
            status: "COMPLETED",
            to: "84900000001",
            timestamp: "1755700100",
            durationSeconds: 42,
            bizOpaqueCallbackData: "att-1",
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.findByAttemptId).toHaveBeenCalledWith("att-1")
      expect(mocks.attachWacid).toHaveBeenCalledWith({
        whatsappCallId: "call-pending",
        wacid: "wacid.OUT",
      })
      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          call: { ...pendingOutboundRow, wacid: "wacid.OUT" },
        }),
      )
    })

    test("R23: businessInitiated with no prior wacid and no attemptId match: no row, no finalize, unmatched logged (no time-window fallback)", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          contact: { waId: "84900000001" },
          event: {
            kind: "terminate",
            wacid: "wacid.OUT",
            direction: "businessInitiated",
            status: "COMPLETED",
            to: "84900000001",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.attachWacid).not.toHaveBeenCalled()
      expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "outbound-correlation-unmatched" }),
        expect.any(String),
      )
    })

    test("redelivered terminate calls finalizeCallSideEffects again — idempotency is that function's contract, not this handler's", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            status: "COMPLETED",
            durationSeconds: 5,
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledOnce()
    })

    test("terminate errors[] (media-drop codes) are joined into lastError", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "FAILED",
            timestamp: "1755700100",
            errors: [{ code: 138_021, title: "Media connection dropped" }],
          } as never,
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: "138021:Media connection dropped",
        }),
      )
    })

    test("terminate without errors never sets lastError", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "COMPLETED",
            timestamp: "1755700100",
          },
        },
      })

      const finalizeArgs = mocks.finalizeCallSideEffects.mock.calls[0][0]
      expect(finalizeArgs).not.toHaveProperty("lastError")
    })

    test("a COMPLETED terminate that was never picked up (no start_time/duration) finalizes as failed, not a completed call awaiting a recording", async () => {
      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "COMPLETED",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: {
            type: "whatsapp_call",
            direction: "userInitiated",
            status: "failed",
            durationSeconds: undefined,
          },
        }),
      )
    })

    test("a trailing COMPLETED terminate never upgrades a call already finalized as rejected back to completed", async () => {
      mocks.findByWacid.mockResolvedValue({ ...callRow, status: "rejected" })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "userInitiated",
            status: "COMPLETED",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: expect.objectContaining({ status: "rejected" }),
        }),
      )
    })

    test("an outbound call the agent cancelled before answer (business-cancel marker) finalizes as 'canceled', not 'no answer'", async () => {
      mocks.findByWacid.mockResolvedValue({
        ...callRow,
        direction: "businessInitiated",
        status: "failed",
        lastError: CALL_CANCELED_BY_BUSINESS_LAST_ERROR,
      })

      await handleWhatsappCallEvent({
        ...baseData,
        payload: {
          phoneNumberId: "phone-1",
          event: {
            kind: "terminate",
            wacid: "wacid.ABC",
            direction: "businessInitiated",
            status: "COMPLETED",
            timestamp: "1755700100",
          },
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: expect.objectContaining({ status: "canceled" }),
        }),
      )
    })
  })
})
