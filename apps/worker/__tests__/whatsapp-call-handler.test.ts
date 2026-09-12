import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  detectContactAndConversation: vi.fn(),
  findByWacid: vi.fn(),
  createIfAbsent: vi.fn(),
  updateInterimStatus: vi.fn(),
  findPendingOutbound: vi.fn(),
  attachWacid: vi.fn(),
  updateContentBySourceId: vi.fn(),
  emitIncomingCall: vi.fn(),
  finalizeCallSideEffects: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByWacid: mocks.findByWacid,
    createIfAbsent: mocks.createIfAbsent,
    updateInterimStatus: mocks.updateInterimStatus,
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

    test("businessInitiated NEVER creates a row — attaches to the pending outbound attempt instead", async () => {
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

    test("businessInitiated with no matching pending attempt logs ambiguous and creates nothing", async () => {
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
  })
})
