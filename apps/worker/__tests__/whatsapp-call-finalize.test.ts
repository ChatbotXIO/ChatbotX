import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createOrUpdate: vi.fn(),
  finalizeById: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  updateFlowStepState: vi.fn(),
  contactInboxFindBy: vi.fn(),
  updateTracking: vi.fn(),
  invalidateTracking: vi.fn(),
  emitCallEnded: vi.fn(),
  emitMissedAudioCall: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  contactInboxService: {
    findBy: mocks.contactInboxFindBy,
    updateTracking: mocks.updateTracking,
    invalidateTracking: mocks.invalidateTracking,
  },
  conversationService: { updateFlowStepState: mocks.updateFlowStepState },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: { finalizeById: mocks.finalizeById },
  createMessageRepository: vi.fn(async () => ({
    createOrUpdate: mocks.createOrUpdate,
  })),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCallEnded: mocks.emitCallEnded,
  emitMissedAudioCall: mocks.emitMissedAudioCall,
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const { buildCallActivityText, callActivitySourceId, finalizeCallSideEffects } =
  await import("../src/integration/handlers/shared/whatsapp-call-finalize")

const call = {
  id: "call-1",
  wacid: "wacid.ABC",
  attemptId: null as string | null,
  direction: "userInitiated" as const,
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
}

describe("callActivitySourceId", () => {
  test("is stable and id-based", () => {
    expect(callActivitySourceId("call-1")).toBe("wacall-call-1")
  })
})

describe("buildCallActivityText", () => {
  test("completed with duration", () => {
    expect(
      buildCallActivityText({
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        durationSeconds: 90,
      }),
    ).toBe("Voice call · 1:30")
  })
  test("rejected", () => {
    expect(
      buildCallActivityText({
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      }),
    ).toBe("Declined voice call")
  })
  test("failed renders as missed", () => {
    expect(
      buildCallActivityText({
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      }),
    ).toBe("Missed voice call")
  })
})

describe("finalizeCallSideEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createOrUpdate.mockResolvedValue({
      isNew: true,
      message: { id: "msg-1", createdAt: new Date("2026-08-21T10:00:00Z") },
    })
    mocks.finalizeById.mockResolvedValue({ ...call, status: "completed" })
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
    mocks.updateTracking.mockResolvedValue(null)
  })

  test("writes the activity message keyed on wacall-<id>, finalizes by id, and fires the full side-effect chain on a fresh insert", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        durationSeconds: 90,
      },
      endedAt: new Date("2026-08-21T10:00:00Z"),
      startedAt: new Date("2026-08-21T09:58:30Z"),
    })

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "wacall-call-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        workspaceId: "ws-1",
        text: "Voice call · 1:30",
      }),
    )
    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        status: "completed",
        startedAt: new Date("2026-08-21T09:58:30Z"),
        durationSeconds: 90,
        messageId: "msg-1",
      }),
    )
    expect(mocks.updateFlowStepState).toHaveBeenCalled()
    expect(mocks.updateTracking).toHaveBeenCalled()
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "messageCreated" }),
    )
    expect(mocks.emitCallEnded).toHaveBeenCalledWith("ws-1", "contact-1", {
      callId: "wacid.ABC",
      durationSeconds: 90,
    })
    expect(mocks.emitMissedAudioCall).not.toHaveBeenCalled()
  })

  test("does not set startedAt on the finalize write when it is omitted (never clears an already-set column)", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    const finalizeArgs = mocks.finalizeById.mock.calls[0][0]
    expect(finalizeArgs).not.toHaveProperty("startedAt")
  })

  test("uses attemptId as the external correlation id when wacid is null (outbound before Meta assigns one)", async () => {
    await finalizeCallSideEffects({
      call: { ...call, wacid: null, attemptId: "att-1" },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      },
    })

    expect(mocks.emitMissedAudioCall).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      { callId: "att-1", conversationId: "conv-1" },
    )
  })

  test("a redelivery (isNew: false) never re-fires tracking/broadcast/trigger events, but still writes the terminal status", async () => {
    mocks.createOrUpdate.mockResolvedValue({
      isNew: false,
      message: { id: "msg-1", createdAt: new Date() },
    })

    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.finalizeById).toHaveBeenCalled()
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
    expect(mocks.updateFlowStepState).not.toHaveBeenCalled()
    expect(mocks.updateTracking).not.toHaveBeenCalled()
    expect(mocks.emitCallEnded).not.toHaveBeenCalled()
  })

  test("failed + userInitiated fires missedAudioCall, not callEnded", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      },
    })

    expect(mocks.emitMissedAudioCall).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      {
        callId: "wacid.ABC",
        conversationId: "conv-1",
      },
    )
    expect(mocks.emitCallEnded).not.toHaveBeenCalled()
  })

  test("failed + businessInitiated fires neither trigger event", async () => {
    await finalizeCallSideEffects({
      call: { ...call, direction: "businessInitiated" },
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "failed",
      },
    })

    expect(mocks.emitMissedAudioCall).not.toHaveBeenCalled()
    expect(mocks.emitCallEnded).not.toHaveBeenCalled()
  })

  test("a realtime broadcast failure is swallowed, never thrown", async () => {
    mocks.broadcastToWorkspaceParty.mockRejectedValueOnce(new Error("down"))

    await expect(
      finalizeCallSideEffects({
        call,
        entity: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "completed",
        },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.logger.warn).toHaveBeenCalled()
  })
})
