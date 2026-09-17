import { beforeEach, describe, expect, test, vi } from "vitest"

const CALL_ROW_NOT_READY_PATTERN = /whatsapp-voip-call-row-not-ready/

const mocks = vi.hoisted(() => ({
  identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  resolveRingTargets: vi.fn(),
  readOffer: vi.fn(),
  readControl: vi.fn(),
  endCall: vi.fn(),
  isCallEnded: vi.fn(),
  deleteOffer: vi.fn(),
  readOutboundAnswer: vi.fn(),
  deleteOutboundAnswer: vi.fn(),
  sendToWorkspaceMember: vi.fn(),
  resolveWhatsappCallerName: vi.fn(),
  findByWacid: vi.fn(),
  findByAttemptId: vi.fn(),
  findAuthByInboxId: vi.fn(),
  rejectCall: vi.fn(),
  terminateCall: vi.fn(),
  finalizeCallSideEffects: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  sendToWorkspaceMember: mocks.sendToWorkspaceMember,
  resolveWhatsappCallerName: mocks.resolveWhatsappCallerName,
  whatsappVoipCallService: {
    resolveRingTargets: mocks.resolveRingTargets,
    readControl: mocks.readControl,
    endCall: mocks.endCall,
    isCallEnded: mocks.isCallEnded,
  },
  whatsappVoipSignalingService: {
    readOffer: mocks.readOffer,
    deleteOffer: mocks.deleteOffer,
    readOutboundAnswer: mocks.readOutboundAnswer,
    deleteOutboundAnswer: mocks.deleteOutboundAnswer,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByWacid: mocks.findByWacid,
    findByAttemptId: mocks.findByAttemptId,
  },
  integrationLookupRepository: {
    findAuthByInboxId: mocks.findAuthByInboxId,
  },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  rejectCall: mocks.rejectCall,
  terminateCall: mocks.terminateCall,
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: {
    whatsappCallTransportIncoming: "whatsappCallTransportIncoming",
    whatsappCallTransportEnded: "whatsappCallTransportEnded",
    whatsappCallOutboundAnswer: "whatsappCallOutboundAnswer",
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  WhatsappVoipSignalingJobAction: {
    handleConnect: "handleConnect",
    expireIfUnanswered: "expireIfUnanswered",
    handleOutboundAnswer: "handleOutboundAnswer",
    expireOutboundDial: "expireOutboundDial",
  },
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier:
      mocks.identifyInboxAndIntegrationAuthFromIdentifier,
  },
}))

vi.mock("../src/integration/handlers/shared/whatsapp-call-finalize", () => ({
  finalizeCallSideEffects: mocks.finalizeCallSideEffects,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mocks.logger,
}))

const { handleWhatsappVoipSignalingJob } = await import(
  "../src/integration/handlers/whatsapp-voip-signaling"
)

const inbox = { id: "inbox-1", workspaceId: "ws-1", channel: "whatsapp" }
const integrationRow = {
  id: "iw-1",
  auth: { fake: "auth" },
  inboxId: "inbox-1",
}

const callRow = {
  id: "call-1",
  wacid: "wacid.ABC",
  direction: "userInitiated" as const,
  conversationId: "conv-1",
  contactInboxId: "ci-1",
}

const ring = {
  status: "ring" as const,
  targets: ["agent-1", "agent-2"],
}

const outboundCallRow = {
  id: "call-out-1",
  wacid: "wacid.OUT",
  attemptId: "att-1",
  direction: "businessInitiated" as const,
  conversationId: "conv-2",
  contactInboxId: "ci-2",
  inboxId: "inbox-1",
  answeredByUserId: "initiator-1" as string | null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.identifyInboxAndIntegrationAuthFromIdentifier.mockResolvedValue({
    inbox,
    integrationRow,
  })
  mocks.findByWacid.mockResolvedValue(callRow)
  mocks.findByAttemptId.mockResolvedValue(undefined)
  mocks.findAuthByInboxId.mockResolvedValue({ auth: integrationRow.auth })
  mocks.resolveWhatsappCallerName.mockResolvedValue("Hung Phan")
  mocks.rejectCall.mockResolvedValue(undefined)
  mocks.terminateCall.mockResolvedValue(undefined)
  mocks.deleteOutboundAnswer.mockResolvedValue(undefined)
  mocks.isCallEnded.mockImplementation(({ status }: { status?: string }) =>
    ["rejected", "completed", "failed"].includes(status ?? ""),
  )
})

describe("handleWhatsappVoipSignalingJob: handleConnect", () => {
  test("rings ALL live agents (ring-all): delivers the offer to every target, expiry scheduled at the boundary", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue(ring)

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.resolveRingTargets).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
      deadlineAt: 2000,
    })
    const expectedEvent = {
      eventType: "whatsappCallTransportIncoming",
      data: {
        transport: "voip",
        whatsappCallId: "call-1",
        wacid: "wacid.ABC",
        direction: "userInitiated",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contactName: "Hung Phan",
        offer: { sdpType: "offer", sdp: "v=0..." },
        deadlineAt: new Date(2000).toISOString(),
      },
    }
    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledTimes(2)
    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "agent-1" },
      expectedEvent,
    )
    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "agent-2" },
      expectedEvent,
    )
    expect(mocks.rejectCall).not.toHaveBeenCalled()
  })

  test("a per-recipient delivery failure (sendToWorkspaceMember returns null) is logged, other recipients still delivered", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue(ring)
    mocks.sendToWorkspaceMember
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ok: true })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledTimes(2)
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.ABC" }),
      expect.stringContaining("unable to deliver"),
    )
  })

  test("no eligible agent: Meta-rejects and finalizes as rejected without touching the control state", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue({
      status: "noEligibleAgent",
    })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    // There is no control record for an unreachable call, so no CAS transition.
    expect(mocks.endCall).not.toHaveBeenCalled()
    expect(mocks.rejectCall).toHaveBeenCalledWith({
      auth: integrationRow.auth,
      callId: "wacid.ABC",
    })
    expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
      call: callRow,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      },
    })
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })

  test("already progressed (redelivered/retried after the call advanced): no-op, never re-rings or terminates", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue({
      status: "alreadyProgressed",
    })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.endCall).not.toHaveBeenCalled()
  })

  test("reserved but the WhatsappCall row is not ready yet: throws so BullMQ retries", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue(ring)
    mocks.findByWacid.mockResolvedValue(null)

    await expect(
      handleWhatsappVoipSignalingJob({
        type: "handleConnect",
        data: {
          wacid: "wacid.ABC",
          deadlineAt: 2000,
          phoneNumberId: "phone-1",
        },
      }),
    ).rejects.toThrow(CALL_ROW_NOT_READY_PATTERN)

    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })

  test("the caller already hung up (terminate processed before connect): never rings, never calls Meta, drops the offer", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.findByWacid.mockResolvedValue({ ...callRow, status: "rejected" })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.resolveRingTargets).not.toHaveBeenCalled()
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
    expect(mocks.deleteOffer).toHaveBeenCalledWith("wacid.ABC")
  })

  test("the caller already hung up and no offer is stored: no Graph reject of the dead call", async () => {
    mocks.readOffer.mockResolvedValue(null)
    mocks.findByWacid.mockResolvedValue({ ...callRow, status: "completed" })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })

  test("the call ended while the ring set was being reserved: ends the fresh control without Meta, never rings", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue(ring)
    mocks.findByWacid
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...callRow, status: "rejected" })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
    expect(mocks.endCall).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      allowFromAccepted: false,
    })
    expect(mocks.deleteOffer).toHaveBeenCalledWith("wacid.ABC")
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.terminateCall).not.toHaveBeenCalled()
  })

  test("the call ended while the offer was being delivered: tells every rung agent it ended, so no dialog rings a dead call", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue(ring)
    mocks.findByWacid
      .mockResolvedValueOnce({ ...callRow, status: "ringing" })
      .mockResolvedValueOnce({ ...callRow, status: "ringing" })
      .mockResolvedValueOnce({ ...callRow, status: "completed" })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    const endedEvent = {
      eventType: "whatsappCallTransportEnded",
      data: {
        transport: "voip",
        whatsappCallId: "call-1",
        wacid: "wacid.ABC",
        status: "completed",
      },
    }
    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledTimes(4)
    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "agent-1" },
      endedEvent,
    )
    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "agent-2" },
      endedEvent,
    )
    expect(mocks.rejectCall).not.toHaveBeenCalled()
  })

  test("a call still ringing after delivery sends no ended event", async () => {
    mocks.readOffer.mockResolvedValue({ sdp: "v=0...", deadlineAt: 2000 })
    mocks.resolveRingTargets.mockResolvedValue(ring)
    mocks.findByWacid.mockResolvedValue({ ...callRow, status: "ringing" })

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledTimes(2)
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "whatsappCallTransportEnded" }),
    )
  })

  test("no stored offer (unprocessable SDP, or offer expired): Meta-rejects before reserving any agent", async () => {
    mocks.readOffer.mockResolvedValue(null)

    await handleWhatsappVoipSignalingJob({
      type: "handleConnect",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.resolveRingTargets).not.toHaveBeenCalled()
    expect(mocks.rejectCall).toHaveBeenCalledWith({
      auth: integrationRow.auth,
      callId: "wacid.ABC",
    })
    expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
      call: callRow,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      },
    })
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })
})

describe("handleWhatsappVoipSignalingJob: expireIfUnanswered", () => {
  test("no-op when the call already reached accepted", async () => {
    mocks.readControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "accepted",
      deadlineAt: 2000,
      fenceToken: "fence-1",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireIfUnanswered",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.endCall).not.toHaveBeenCalled()
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.terminateCall).not.toHaveBeenCalled()
  })

  test("no-op when the call is already terminated", async () => {
    mocks.readControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "terminated",
      deadlineAt: 2000,
      fenceToken: "fence-1",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireIfUnanswered",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.endCall).not.toHaveBeenCalled()
  })

  test("no-op when there is no control record at all", async () => {
    mocks.readControl.mockResolvedValue(null)

    await handleWhatsappVoipSignalingJob({
      type: "expireIfUnanswered",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.endCall).not.toHaveBeenCalled()
  })

  test("phase 'reserved' (never claimed): endCall reports reject, finalizes as rejected", async () => {
    mocks.readControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "reserved",
      deadlineAt: 2000,
      fenceToken: "fence-1",
    })
    mocks.endCall.mockResolvedValue({
      fromPhase: "reserved",
      graphAction: "reject",
      terminalStatus: "rejected",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireIfUnanswered",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.endCall).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      allowFromAccepted: false,
    })
    expect(mocks.rejectCall).toHaveBeenCalledWith({
      auth: integrationRow.auth,
      callId: "wacid.ABC",
    })
    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
      call: callRow,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      },
    })
  })

  test("phase 'answering' (mid-handshake): endCall reports terminate, finalizes as failed", async () => {
    mocks.readControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "answering",
      deadlineAt: 2000,
      fenceToken: "fence-1",
    })
    mocks.endCall.mockResolvedValue({
      fromPhase: "answering",
      graphAction: "terminate",
      terminalStatus: "failed",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireIfUnanswered",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.terminateCall).toHaveBeenCalledWith({
      auth: integrationRow.auth,
      callId: "wacid.ABC",
    })
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
      call: callRow,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      },
    })
  })

  test("endCall reports an unexpected terminalStatus (defensive guard): logs a warning, never calls Graph or finalizes", async () => {
    mocks.readControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "reserved",
      deadlineAt: 2000,
      fenceToken: "fence-1",
    })
    mocks.endCall.mockResolvedValue({
      fromPhase: "accepted",
      graphAction: "terminate",
      terminalStatus: "completed",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireIfUnanswered",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("lost the endCall race (e.g. accept just committed): no Graph call, no finalize", async () => {
    mocks.readControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "reserved",
      deadlineAt: 2000,
      fenceToken: "fence-1",
    })
    mocks.endCall.mockResolvedValue(null)

    await handleWhatsappVoipSignalingJob({
      type: "expireIfUnanswered",
      data: { wacid: "wacid.ABC", deadlineAt: 2000, phoneNumberId: "phone-1" },
    })

    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
  })
})

describe("handleWhatsappVoipSignalingJob: handleOutboundAnswer", () => {
  test("forwards the SDP answer to the initiator, targeted-only, then deletes the stored answer", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.readOutboundAnswer.mockResolvedValue({ sdp: "v=0...answer" })
    mocks.sendToWorkspaceMember.mockResolvedValue({ ok: true })

    await handleWhatsappVoipSignalingJob({
      type: "handleOutboundAnswer",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
      },
    })

    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "initiator-1" },
      {
        eventType: "whatsappCallOutboundAnswer",
        data: {
          whatsappCallId: "call-out-1",
          wacid: "wacid.OUT",
          attemptId: "att-1",
          session: { sdpType: "answer", sdp: "v=0...answer" },
        },
      },
    )
    expect(mocks.deleteOutboundAnswer).toHaveBeenCalledWith("att-1")
  })

  test("no stored answer (already consumed by an earlier delivery): logs and returns without sending", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.readOutboundAnswer.mockResolvedValue(null)

    await handleWhatsappVoipSignalingJob({
      type: "handleOutboundAnswer",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
      },
    })

    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
    expect(mocks.deleteOutboundAnswer).not.toHaveBeenCalled()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("call row has no initiator (answeredByUserId null): logs and drops, never sends", async () => {
    mocks.findByAttemptId.mockResolvedValue({
      ...outboundCallRow,
      answeredByUserId: null,
    })
    mocks.readOutboundAnswer.mockResolvedValue({ sdp: "v=0...answer" })

    await handleWhatsappVoipSignalingJob({
      type: "handleOutboundAnswer",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
      },
    })

    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
    expect(mocks.deleteOutboundAnswer).not.toHaveBeenCalled()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("a per-recipient delivery failure is logged, but the stored answer is still deleted", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.readOutboundAnswer.mockResolvedValue({ sdp: "v=0...answer" })
    mocks.sendToWorkspaceMember.mockResolvedValue(null)

    await handleWhatsappVoipSignalingJob({
      type: "handleOutboundAnswer",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
      },
    })

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: "att-1" }),
      expect.stringContaining("unable to deliver"),
    )
    expect(mocks.deleteOutboundAnswer).toHaveBeenCalledWith("att-1")
  })

  test("row not ready yet (retried against the connect/answer race): throws so BullMQ retries", async () => {
    mocks.findByAttemptId.mockResolvedValue(undefined)
    mocks.findByWacid.mockResolvedValue(undefined)

    await expect(
      handleWhatsappVoipSignalingJob({
        type: "handleOutboundAnswer",
        data: {
          attemptId: "att-1",
          whatsappCallId: "call-out-1",
          wacid: "wacid.OUT",
          workspaceId: "ws-1",
        },
      }),
    ).rejects.toThrow(CALL_ROW_NOT_READY_PATTERN)

    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })
})

describe("handleWhatsappVoipSignalingJob: expireOutboundDial", () => {
  test("no-answer dial: endCall reports terminate/failed, Graph-terminates and finalizes via the shared path", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    // `endReservedCall`'s shared finalize path re-fetches the row by wacid.
    mocks.findByWacid.mockResolvedValue(outboundCallRow)
    mocks.endCall.mockResolvedValue({
      fromPhase: "dialing",
      graphAction: "terminate",
      terminalStatus: "failed",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireOutboundDial",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
        deadlineAt: 2000,
      },
    })

    expect(mocks.endCall).toHaveBeenCalledWith({
      wacid: "wacid.OUT",
      allowFromAccepted: false,
    })
    expect(mocks.findAuthByInboxId).toHaveBeenCalledWith({
      modelName: "IntegrationWhatsapp",
      inboxId: "inbox-1",
    })
    expect(mocks.terminateCall).toHaveBeenCalledWith({
      auth: integrationRow.auth,
      callId: "wacid.OUT",
    })
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
      call: outboundCallRow,
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "failed",
      },
    })
  })

  test("already accepted: endCall no-ops (allowFromAccepted:false), no Graph call, no finalize", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.endCall.mockResolvedValue(null)

    await handleWhatsappVoipSignalingJob({
      type: "expireOutboundDial",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
        deadlineAt: 2000,
      },
    })

    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
  })

  test("already terminated: endCall no-ops, no Graph call, no finalize", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.endCall.mockResolvedValue(null)

    await handleWhatsappVoipSignalingJob({
      type: "expireOutboundDial",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
        deadlineAt: 2000,
      },
    })

    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
  })

  test("row not ready yet: throws so BullMQ retries", async () => {
    mocks.findByAttemptId.mockResolvedValue(undefined)
    mocks.findByWacid.mockResolvedValue(undefined)

    await expect(
      handleWhatsappVoipSignalingJob({
        type: "expireOutboundDial",
        data: {
          attemptId: "att-1",
          whatsappCallId: "call-out-1",
          wacid: "wacid.OUT",
          workspaceId: "ws-1",
          deadlineAt: 2000,
        },
      }),
    ).rejects.toThrow(CALL_ROW_NOT_READY_PATTERN)

    expect(mocks.endCall).not.toHaveBeenCalled()
  })

  test("the control already expired/was lost (endCall no-ops) but the DB row is still ringing — force-terminates via Graph and finalizes as failed", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.endCall.mockResolvedValue(null)
    mocks.findByWacid.mockResolvedValue({
      ...outboundCallRow,
      status: "ringing",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireOutboundDial",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
        deadlineAt: 2000,
      },
    })

    expect(mocks.terminateCall).toHaveBeenCalledWith({
      auth: integrationRow.auth,
      callId: "wacid.OUT",
    })
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith({
      call: { ...outboundCallRow, status: "ringing" },
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "failed",
      },
    })
  })

  test("the control already expired but the DB row is already accepted — stays a no-op (never terminates a live call)", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.endCall.mockResolvedValue(null)
    mocks.findByWacid.mockResolvedValue({
      ...outboundCallRow,
      status: "accepted",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireOutboundDial",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
        deadlineAt: 2000,
      },
    })

    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.rejectCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
  })

  test("the control already expired and the DB row already reached a terminal status — stays a no-op", async () => {
    mocks.findByAttemptId.mockResolvedValue(outboundCallRow)
    mocks.endCall.mockResolvedValue(null)
    mocks.findByWacid.mockResolvedValue({
      ...outboundCallRow,
      status: "failed",
    })

    await handleWhatsappVoipSignalingJob({
      type: "expireOutboundDial",
      data: {
        attemptId: "att-1",
        whatsappCallId: "call-out-1",
        wacid: "wacid.OUT",
        workspaceId: "ws-1",
        deadlineAt: 2000,
      },
    })

    expect(mocks.terminateCall).not.toHaveBeenCalled()
    expect(mocks.finalizeCallSideEffects).not.toHaveBeenCalled()
  })
})
