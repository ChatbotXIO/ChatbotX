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
  findPendingOutbound: vi.fn(),
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
  whatsappVoipCallService: {
    markOutboundRinging: mocks.markOutboundRinging,
    markOutboundAccepted: mocks.markOutboundAccepted,
  },
  sendToWorkspaceMember: mocks.sendToWorkspaceMember,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByWacid: mocks.findByWacid,
    findByAttemptId: mocks.findByAttemptId,
    createIfAbsent: mocks.createIfAbsent,
    updateInterimStatus: mocks.updateInterimStatus,
    markAcceptedIfActive: mocks.markAcceptedIfActive,
    findPendingOutbound: mocks.findPendingOutbound,
    attachWacid: mocks.attachWacid,
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
    mocks.findPendingOutbound.mockResolvedValue(pendingOutboundRow)
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
      expect(mocks.findPendingOutbound).not.toHaveBeenCalled()
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

    test("businessInitiated NEVER creates a row — attaches to the pending outbound attempt instead (no prior wacid, no attemptId echo)", async () => {
      // No row already carries this wacid, and no biz_opaque_callback_data
      // was echoed on this connect (SIP-mode/legacy shape) — falls through
      // to the time-window heuristic, unchanged.
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
      expect(mocks.findPendingOutbound).toHaveBeenCalledWith({
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        since: expect.any(Date),
      })
      expect(mocks.attachWacid).toHaveBeenCalledWith({
        id: "call-pending",
        wacid: "wacid.OUT",
      })
      expect(mocks.emitIncomingCall).not.toHaveBeenCalled()
    })

    test("L1: VoIP outbound connect whose wacid is already attached (attachWacid ran synchronously in the initiate action) resolves directly — never logs outbound-correlation-ambiguous, never touches findPendingOutbound", async () => {
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
      expect(mocks.findPendingOutbound).not.toHaveBeenCalled()
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
      expect(mocks.findPendingOutbound).not.toHaveBeenCalled()
      expect(mocks.attachWacid).toHaveBeenCalledWith({
        id: "call-pending",
        wacid: "wacid.OUT",
      })
      expect(mocks.logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "outbound-correlation-ambiguous" }),
        expect.any(String),
      )
    })

    test("businessInitiated with no matching pending attempt logs ambiguous and creates nothing", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)
      mocks.findPendingOutbound.mockResolvedValue(undefined)

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
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.attachWacid).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "outbound-correlation-ambiguous" }),
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
        id: "call-out-1",
        answeredByUserId: "initiator-1",
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

    test("businessInitiated without a prior row NEVER creates one — attaches to the pending outbound row and finalizes it", async () => {
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
            durationSeconds: 42,
          },
        },
      })

      expect(mocks.createIfAbsent).not.toHaveBeenCalled()
      expect(mocks.findPendingOutbound).toHaveBeenCalledWith({
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        since: expect.any(Date),
      })
      expect(mocks.attachWacid).toHaveBeenCalledWith({
        id: "call-pending",
        wacid: "wacid.OUT",
      })
      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          call: { ...pendingOutboundRow, wacid: "wacid.OUT" },
        }),
      )
    })

    test("businessInitiated with no matching pending attempt: no row, no finalize, ambiguous logged", async () => {
      mocks.findByWacid.mockResolvedValue(undefined)
      mocks.findPendingOutbound.mockResolvedValue(undefined)

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
        expect.objectContaining({ event: "outbound-correlation-ambiguous" }),
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
