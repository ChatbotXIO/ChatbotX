import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  detectContactAndConversation: vi.fn(),
  findByWacid: vi.fn(),
  createIfAbsent: vi.fn(),
  updateInterimStatus: vi.fn(),
  finalizeByWacid: vi.fn(),
  createOrUpdate: vi.fn(),
  updateContentBySourceId: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  updateFlowStepState: vi.fn(),
  contactInboxFindBy: vi.fn(),
  updateTracking: vi.fn(),
  invalidateTracking: vi.fn(),
  emitIncomingCall: vi.fn(),
  emitMissedAudioCall: vi.fn(),
  emitCallEnded: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  contactInboxService: {
    findBy: mocks.contactInboxFindBy,
    updateTracking: mocks.updateTracking,
    invalidateTracking: mocks.invalidateTracking,
  },
  conversationService: {
    updateFlowStepState: mocks.updateFlowStepState,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByWacid: mocks.findByWacid,
    createIfAbsent: mocks.createIfAbsent,
    updateInterimStatus: mocks.updateInterimStatus,
    finalizeByWacid: mocks.finalizeByWacid,
  },
  createMessageRepository: vi.fn(async () => ({
    createOrUpdate: mocks.createOrUpdate,
    updateContentBySourceId: mocks.updateContentBySourceId,
  })),
}))

vi.mock("@chatbotx.io/events", () => ({
  setWebhookExecutionContext: vi.fn(),
  emitIncomingCall: mocks.emitIncomingCall,
  emitMissedAudioCall: mocks.emitMissedAudioCall,
  emitCallEnded: mocks.emitCallEnded,
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
  direction: "userInitiated" as const,
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
    mocks.createOrUpdate.mockResolvedValue({
      isNew: true,
      message: {
        id: "msg-1",
        createdAt: new Date("2026-08-21T10:00:00Z"),
        conversationId: "conv-1",
      },
    })
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
    mocks.updateTracking.mockResolvedValue(null)
  })

  test("connect creates the call row for the resolved contact", async () => {
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

    expect(mocks.detectContactAndConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        inbox,
        incomingContact: expect.objectContaining({
          sourceId: "84900000001",
          firstName: "Kerry",
        }),
      }),
    )
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
      wacid: "wacid.ABC",
      conversationId: "conv-1",
    })
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
    })
  })

  test("late REJECTED after a failed terminate repairs the activity message", async () => {
    mocks.findByWacid.mockResolvedValue({ ...callRow, status: "failed" })
    // The repair keys off the transition reported by the repository, not the
    // handler's own read — mirrors the real failed→rejected upgrade.
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

    expect(mocks.updateInterimStatus).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      status: "rejected",
    })
    expect(mocks.updateContentBySourceId).toHaveBeenCalledWith(
      "wacid.ABC",
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

  test("completed terminate writes the activity message and finalizes", async () => {
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

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        workspaceId: "ws-1",
        sourceId: "wacid.ABC",
        senderType: "system",
        messageType: "activity",
        text: "Voice call · 1:30",
        contentAttributes: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "completed",
          durationSeconds: 90,
        },
      }),
    )
    expect(mocks.finalizeByWacid).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      status: "completed",
      startedAt: new Date(1_755_700_010 * 1000),
      endedAt: new Date(1_755_700_100 * 1000),
      durationSeconds: 90,
      messageId: "msg-1",
    })
    expect(mocks.updateFlowStepState).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "conv-1",
      }),
    )
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({ id: "msg-1" }),
      }),
    )
    expect(mocks.emitCallEnded).toHaveBeenCalledWith("ws-1", "contact-1", {
      wacid: "wacid.ABC",
      durationSeconds: 90,
    })
    expect(mocks.emitMissedAudioCall).not.toHaveBeenCalled()
  })

  test("failed terminate after a rejected status renders as declined", async () => {
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

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Declined voice call",
        contentAttributes: expect.objectContaining({ status: "rejected" }),
      }),
    )
  })

  test("terminate without a prior row upserts before finalizing", async () => {
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
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Missed voice call" }),
    )
    expect(mocks.emitMissedAudioCall).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      { wacid: "wacid.NEW", conversationId: "conv-1" },
    )
  })

  test("redelivered terminate does not re-broadcast", async () => {
    mocks.createOrUpdate.mockResolvedValue({
      isNew: false,
      message: { id: "msg-1", createdAt: new Date() },
    })

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

    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
    expect(mocks.updateFlowStepState).not.toHaveBeenCalled()
    expect(mocks.updateTracking).not.toHaveBeenCalled()
    expect(mocks.emitCallEnded).not.toHaveBeenCalled()
    expect(mocks.emitMissedAudioCall).not.toHaveBeenCalled()
  })
})
