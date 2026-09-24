import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createOrUpdate: vi.fn(),
  findBySourceId: vi.fn(),
  updateContentBySourceId: vi.fn(),
  mergeContentAttributesBySourceId: vi.fn(),
  findByInboxIdForWorkspace: vi.fn(),
  finalizeById: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  sendToWorkspaceMember: vi.fn(),
  updateFlowStepState: vi.fn(),
  contactInboxFindBy: vi.fn(),
  updateTracking: vi.fn(),
  invalidateTracking: vi.fn(),
  emitCallEnded: vi.fn(),
  emitMissedAudioCall: vi.fn(),
  voipReadControl: vi.fn(),
  voipMarkTerminated: vi.fn(),
  voipDeleteOffer: vi.fn(),
  findNameAndEmail: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  sendToWorkspaceMember: mocks.sendToWorkspaceMember,
  contactInboxService: {
    findBy: mocks.contactInboxFindBy,
    updateTracking: mocks.updateTracking,
    invalidateTracking: mocks.invalidateTracking,
  },
  conversationService: { updateFlowStepState: mocks.updateFlowStepState },
  userService: {
    findNameAndEmail: mocks.findNameAndEmail,
  },
  whatsappVoipCallService: {
    readControl: mocks.voipReadControl,
    endCall: mocks.voipMarkTerminated,
    finalizeEndedCall: mocks.finalizeById,
  },
  whatsappVoipSignalingService: {
    deleteOffer: mocks.voipDeleteOffer,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: mocks.findByInboxIdForWorkspace,
  },
  createMessageRepository: vi.fn(async () => ({
    createOrUpdate: mocks.createOrUpdate,
    findBySourceId: mocks.findBySourceId,
    updateContentBySourceId: mocks.updateContentBySourceId,
    mergeContentAttributesBySourceId: mocks.mergeContentAttributesBySourceId,
  })),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCallEnded: mocks.emitCallEnded,
  emitMissedAudioCall: mocks.emitMissedAudioCall,
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: {
    messageCreated: "messageCreated",
    whatsappCallTransportEnded: "whatsappCallTransportEnded",
    messageContentUpdated: "messageContentUpdated",
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const {
  buildCallActivityText,
  callActivitySourceId,
  finalizeCallSideEffects,
  enrichCallActivityMessage,
  WhatsappCallEnrichmentPendingError,
} = await import("../src/integration/handlers/shared/whatsapp-call-finalize")

const call = {
  id: "call-1",
  wacid: "wacid.ABC",
  attemptId: null as string | null,
  direction: "userInitiated" as const,
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  createdAt: new Date("2026-08-21T09:58:00Z"),
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
  test("failed inbound renders as missed (the business missed the customer's call)", () => {
    expect(
      buildCallActivityText({
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      }),
    ).toBe("Missed voice call")
  })
  test("failed outbound renders as no answer (the customer did not pick up), never 'missed'", () => {
    expect(
      buildCallActivityText({
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "failed",
      }),
    ).toBe("No answer")
  })
  test("rejected outbound is still declined regardless of direction", () => {
    expect(
      buildCallActivityText({
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "rejected",
      }),
    ).toBe("Declined voice call")
  })
  test("canceled (agent hung up before answer) renders as a cancelled call, never 'no answer'", () => {
    expect(
      buildCallActivityText({
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "canceled",
      }),
    ).toBe("Cancelled call")
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
    mocks.voipReadControl.mockResolvedValue(null)
    mocks.voipMarkTerminated.mockResolvedValue(false)
    mocks.voipDeleteOffer.mockResolvedValue(undefined)
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      callTranscriptionEnabled: false,
    })
    mocks.findNameAndEmail.mockResolvedValue(undefined)
  })

  test("stamps an agent id+name snapshot for an inbound answered call", async () => {
    mocks.findNameAndEmail.mockResolvedValue({
      name: "Agent Smith",
      email: "agent@example.com",
    })

    await finalizeCallSideEffects({
      call: { ...call, answeredByUserId: "user-1" },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.findNameAndEmail).toHaveBeenCalledWith("user-1")
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          agentUserId: "user-1",
          agentName: "Agent Smith",
        }),
      }),
    )
  })

  test("stamps an agent id+name snapshot for an outbound (business-initiated) call — answeredByUserId is the INITIATOR there", async () => {
    mocks.findNameAndEmail.mockResolvedValue({
      name: "Agent Outbound",
      email: "outbound@example.com",
    })

    await finalizeCallSideEffects({
      call: {
        ...call,
        direction: "businessInitiated",
        answeredByUserId: "user-2",
      },
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "completed",
      },
    })

    expect(mocks.findNameAndEmail).toHaveBeenCalledWith("user-2")
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          agentUserId: "user-2",
          agentName: "Agent Outbound",
        }),
      }),
    )
  })

  test("skips the agent lookup entirely and stamps no agent fields when answeredByUserId is null", async () => {
    await finalizeCallSideEffects({
      call: { ...call, answeredByUserId: null },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.findNameAndEmail).not.toHaveBeenCalled()
    const attrs = mocks.createOrUpdate.mock.calls[0]?.[0]?.contentAttributes
    expect(attrs).not.toHaveProperty("agentUserId")
    expect(attrs).not.toHaveProperty("agentName")
  })

  test("a user id that no longer resolves to a user: id stamped, name absent, never throws", async () => {
    mocks.findNameAndEmail.mockResolvedValue(undefined)

    await expect(
      finalizeCallSideEffects({
        call: { ...call, answeredByUserId: "deleted-user" },
        entity: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "completed",
        },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          agentUserId: "deleted-user",
        }),
      }),
    )
    const attrs = mocks.createOrUpdate.mock.calls[0]?.[0]?.contentAttributes
    expect(attrs).not.toHaveProperty("agentName")
  })

  test("reports a call the number records but Meta refused to record as unavailable, not pending", async () => {
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      callRecordingEnabled: true,
      callTranscriptionEnabled: false,
    })

    await finalizeCallSideEffects({
      call: { ...call, recordingRequested: false },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          recordingRequested: false,
          recordingUnavailable: true,
        }),
      }),
    )
  })

  test("never promises a transcript on a number that does not record calls", async () => {
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      callRecordingEnabled: false,
      callTranscriptionEnabled: true,
    })

    await finalizeCallSideEffects({
      call: { ...call, recordingRequested: null },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          transcriptionRequested: false,
        }),
      }),
    )
  })

  test("falls back to the number's setting for a call row written before the column existed", async () => {
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      callRecordingEnabled: true,
      callTranscriptionEnabled: false,
    })

    await finalizeCallSideEffects({
      call: { ...call, recordingRequested: null },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          recordingRequested: true,
          recordingUnavailable: false,
        }),
      }),
    )
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
        whatsappCallId: "call-1",
        status: "completed",
        outcome: "completed",
        startedAt: new Date("2026-08-21T09:58:30Z"),
        durationSeconds: 90,
        messageId: "msg-1",
      }),
    )
    expect(mocks.updateFlowStepState).toHaveBeenCalledWith(
      expect.objectContaining({ contactRepliedAt: expect.any(Date) }),
    )
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
    // No control record for this call, so nobody is targeted with the
    // ended event even though the signaling cleanup still runs.
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })

  test("a canceled entity persists status failed with outcome canceled — read BEFORE the display collapse", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "canceled",
      },
      endedAt: new Date("2026-08-21T10:00:00Z"),
    })

    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", outcome: "canceled" }),
    )
  })

  test("a rejected entity persists status rejected with outcome rejected", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      },
      endedAt: new Date("2026-08-21T10:00:00Z"),
    })

    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", outcome: "rejected" }),
    )
  })

  test("a failed (not canceled) entity persists status failed with outcome failed", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      },
      endedAt: new Date("2026-08-21T10:00:00Z"),
    })

    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", outcome: "failed" }),
    )
  })

  test("stamps answerSeconds (ring wait) = startedAt − row createdAt on the activity message", async () => {
    await finalizeCallSideEffects({
      // Placed/started ringing at 09:58:15, answered at 09:58:30 → 15s wait.
      call: { ...call, createdAt: new Date("2026-08-21T09:58:15Z") },
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
        contentAttributes: expect.objectContaining({
          answerSeconds: 15,
          // Talk time is kept separate from the ring wait.
          durationSeconds: 90,
        }),
      }),
    )
  })

  test("omits answerSeconds when the answered timestamp is unknown (never falls back to talk time)", async () => {
    await finalizeCallSideEffects({
      call: { ...call, createdAt: new Date("2026-08-21T09:58:15Z") },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        durationSeconds: 90,
      },
      endedAt: new Date("2026-08-21T10:00:00Z"),
      // No startedAt → cannot compute a ring wait.
    })

    const attrs = mocks.createOrUpdate.mock.calls[0]?.[0]?.contentAttributes
    expect(attrs).not.toHaveProperty("answerSeconds")
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

  test("does not set lastError on the finalize write when it is omitted (never clears an already-set column)", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    const finalizeArgs = mocks.finalizeById.mock.calls[0][0]
    expect(finalizeArgs).not.toHaveProperty("lastError")
  })

  test("forwards lastError through to the finalize write when provided (terminate errors[])", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      },
      lastError: "138021:Media connection dropped",
    })

    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "138021:Media connection dropped",
      }),
    )
  })

  test("stamps lastError onto the activity entity as failureReason, so the card can show WHY the call failed", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
      lastError:
        "138021:WhatsApp client terminated the call due to not receiving any media for a long time.",
    })

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          failureReason:
            "138021:WhatsApp client terminated the call due to not receiving any media for a long time.",
        }),
      }),
    )
  })

  test("leaves failureReason unset on the activity entity when lastError is absent", async () => {
    await finalizeCallSideEffects({
      call,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    const attrs = mocks.createOrUpdate.mock.calls[0]?.[0]?.contentAttributes
    expect(attrs).not.toHaveProperty("failureReason")
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

// Meta, Calling API pricing: the 24h customer service window opens "when a
// WhatsApp user calls you, regardless of if you accept the call or not" and
// "when a WhatsApp user accepts your call". The inbox gates free-form replies
// on `lastIncomingMessageAt`, so the finalize has to move it.
describe("finalizeCallSideEffects customer service window", () => {
  const placedAt = new Date("2026-08-21T09:58:00Z")
  const answeredAt = new Date("2026-08-21T09:58:30Z")

  const trackingData = () =>
    mocks.updateTracking.mock.calls[0]?.[0]?.data as
      | { lastIncomingMessageAt?: Date }
      | undefined
  const stampedEntity = () =>
    mocks.createOrUpdate.mock.calls[0]?.[0]?.contentAttributes as {
      customerServiceWindowOpenedAt?: string
    }

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
    mocks.voipReadControl.mockResolvedValue(null)
    mocks.voipMarkTerminated.mockResolvedValue(false)
    mocks.voipDeleteOffer.mockResolvedValue(undefined)
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      callTranscriptionEnabled: false,
    })
  })

  test("a customer's call opens the window even when nobody answered — from when it rang", async () => {
    await finalizeCallSideEffects({
      call: { ...call, createdAt: placedAt },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
      },
    })

    expect(trackingData()?.lastIncomingMessageAt).toEqual(placedAt)
    expect(stampedEntity().customerServiceWindowOpenedAt).toBe(
      placedAt.toISOString(),
    )
  })

  test("a business call the customer answered opens it from the answer", async () => {
    await finalizeCallSideEffects({
      call: { ...call, direction: "businessInitiated", createdAt: placedAt },
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "completed",
      },
      startedAt: answeredAt,
    })

    expect(trackingData()?.lastIncomingMessageAt).toEqual(answeredAt)
  })

  test("an answered business call with no reported answer time falls back to when it was placed — never later", async () => {
    await finalizeCallSideEffects({
      call: { ...call, direction: "businessInitiated", createdAt: placedAt },
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "completed",
      },
    })

    expect(trackingData()?.lastIncomingMessageAt).toEqual(placedAt)
  })

  test.each([
    ["failed"],
    ["rejected"],
    ["canceled"],
  ] as const)("a business call that ended %s does not open it", async (status) => {
    await finalizeCallSideEffects({
      call: { ...call, direction: "businessInitiated", createdAt: placedAt },
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status,
      },
    })

    expect(trackingData()).not.toHaveProperty("lastIncomingMessageAt")
    expect(stampedEntity()).not.toHaveProperty("customerServiceWindowOpenedAt")
  })
})

describe("finalizeCallSideEffects ended emit", () => {
  const voipCall = call

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createOrUpdate.mockResolvedValue({
      isNew: true,
      message: { id: "msg-1", createdAt: new Date("2026-08-21T10:00:00Z") },
    })
    mocks.finalizeById.mockResolvedValue({ ...voipCall, status: "completed" })
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
    mocks.updateTracking.mockResolvedValue(null)
    mocks.voipMarkTerminated.mockResolvedValue(true)
    mocks.voipDeleteOffer.mockResolvedValue(undefined)
  })

  test("reads control before markTerminated, then sends whatsappCallTransportEnded to only the reserved agent", async () => {
    mocks.voipReadControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "accepted",
      deadlineAt: 123,
      fenceToken: "fence-1",
    })

    await finalizeCallSideEffects({
      call: voipCall,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.voipReadControl).toHaveBeenCalledWith("wacid.ABC")
    expect(mocks.voipMarkTerminated).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      allowFromAccepted: true,
    })
    expect(mocks.voipDeleteOffer).toHaveBeenCalledWith("wacid.ABC")
    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "agent-1" },
      {
        eventType: "whatsappCallTransportEnded",
        data: {
          transport: "voip",
          whatsappCallId: "call-1",
          wacid: "wacid.ABC",
          status: "completed",
        },
      },
    )
    // The claimed-call path is targeted only — never a workspace-wide
    // broadcast of the ended event.
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "whatsappCallTransportEnded" }),
    )
  })

  test("unclaimed call (ring-all, reservedUserId empty): broadcasts ended to the whole workspace so every rung agent's dialog clears", async () => {
    mocks.voipReadControl.mockResolvedValue({
      reservedUserId: "",
      phase: "reserved",
      deadlineAt: 123,
      fenceToken: "fence-1",
    })

    await finalizeCallSideEffects({
      call: voipCall,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      },
    })

    expect(mocks.voipDeleteOffer).toHaveBeenCalledWith("wacid.ABC")
    // An empty userId is never passed to `sendToWorkspaceMember` (that would
    // fan out via a different, unintended path) — the workspace broadcast is
    // explicit instead.
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "whatsappCallTransportEnded",
      data: {
        transport: "voip",
        whatsappCallId: "call-1",
        wacid: "wacid.ABC",
        status: "rejected",
      },
    })
  })

  test("no control record: cleans up Redis but never sends (no agent to notify)", async () => {
    mocks.voipReadControl.mockResolvedValue(null)
    mocks.voipMarkTerminated.mockResolvedValue(false)

    await finalizeCallSideEffects({
      call: voipCall,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      },
    })

    expect(mocks.voipMarkTerminated).toHaveBeenCalled()
    expect(mocks.voipDeleteOffer).toHaveBeenCalled()
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })

  test("a call that never got a wacid never triggers the ended emit", async () => {
    await finalizeCallSideEffects({
      call: { ...voipCall, wacid: null },
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
      },
    })

    expect(mocks.voipReadControl).not.toHaveBeenCalled()
    expect(mocks.voipMarkTerminated).not.toHaveBeenCalled()
    expect(mocks.voipDeleteOffer).not.toHaveBeenCalled()
    expect(mocks.sendToWorkspaceMember).not.toHaveBeenCalled()
  })

  test("a send failure is swallowed, never thrown", async () => {
    mocks.voipReadControl.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "accepted",
      deadlineAt: 123,
      fenceToken: "fence-1",
    })
    mocks.sendToWorkspaceMember.mockRejectedValueOnce(new Error("down"))

    await expect(
      finalizeCallSideEffects({
        call: voipCall,
        entity: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "completed",
        },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("a workspace-broadcast failure on the unclaimed path is swallowed, never thrown", async () => {
    mocks.voipReadControl.mockResolvedValue({
      reservedUserId: "",
      phase: "reserved",
      deadlineAt: 123,
      fenceToken: "fence-1",
    })
    // `emitVoipCallEnded` runs (and broadcasts) before the unrelated
    // `messageCreated` broadcast later in `finalizeCallSideEffects` — only
    // the first (ended-event) broadcast rejects here.
    mocks.broadcastToWorkspaceParty
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(undefined)

    await expect(
      finalizeCallSideEffects({
        call: voipCall,
        entity: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "rejected",
        },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("outbound (businessInitiated) call: control.reservedUserId is the initiator — targets them, never broadcasts", async () => {
    mocks.voipReadControl.mockResolvedValue({
      reservedUserId: "initiator-1",
      phase: "accepted",
      direction: "businessInitiated",
      deadlineAt: 123,
      fenceToken: "fence-1",
    })

    await finalizeCallSideEffects({
      call: { ...voipCall, direction: "businessInitiated" },
      entity: {
        type: "whatsapp_call",
        direction: "businessInitiated",
        status: "completed",
      },
    })

    expect(mocks.sendToWorkspaceMember).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "initiator-1" },
      expect.objectContaining({ eventType: "whatsappCallTransportEnded" }),
    )
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "whatsappCallTransportEnded" }),
    )
  })

  test("a redelivery (isNew: false) still re-runs the transport cleanup/emit, so a finalize that died after inserting the card never leaves agents ringing", async () => {
    mocks.createOrUpdate.mockResolvedValue({
      isNew: false,
      message: { id: "msg-1", createdAt: new Date() },
    })
    mocks.voipReadControl.mockResolvedValue({
      reservedUserId: "",
      phase: "reserved",
      deadlineAt: 123,
      fenceToken: "fence-1",
    })

    await finalizeCallSideEffects({
      call: voipCall,
      entity: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "rejected",
      },
    })

    expect(mocks.voipMarkTerminated).toHaveBeenCalled()
    expect(mocks.voipDeleteOffer).toHaveBeenCalled()
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "whatsappCallTransportEnded" }),
    )
    // Everything that is not transport cleanup stays first-delivery only.
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledTimes(1)
    expect(mocks.updateFlowStepState).not.toHaveBeenCalled()
  })
})

describe("enrichCallActivityMessage", () => {
  const call = {
    id: "call-1",
    conversationId: "conv-1",
    workspaceId: "ws-1",
    direction: "userInitiated" as const,
    createdAt: new Date("2026-08-21T09:58:00Z"),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findBySourceId.mockResolvedValue({
      id: "msg-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        transcriptionRequested: true,
        hasRecording: false,
        hasTranscript: false,
        hasSummary: false,
        recordingExpired: false,
      },
    })
  })

  test("merges ONLY the passed overrides via the atomic jsonb merge — never a full-column overwrite", async () => {
    mocks.mergeContentAttributesBySourceId.mockResolvedValue({
      id: "msg-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        transcriptionRequested: true,
        hasRecording: true,
        hasTranscript: false,
        hasSummary: false,
        recordingExpired: false,
      },
    })

    await enrichCallActivityMessage({
      call,
      overrides: { hasRecording: true },
    })

    expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalledWith(
      "wacall-call-1",
      "ws-1",
      { hasRecording: true },
    )
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "messageContentUpdated",
      data: {
        messageId: "msg-1",
        contentAttributes: expect.objectContaining({ hasRecording: true }),
      },
    })
  })

  test("two concurrent enrichments racing on disjoint flags (recording + transcript) both converge to true", async () => {
    // Each writer's atomic merge is independent of the other's — simulate
    // by having the DB-side merge for EACH call already reflect BOTH flags
    // (as a real `jsonb ||` merge would once both UPDATEs have applied),
    // proving neither call's local computation clobbers the other's flag.
    mocks.mergeContentAttributesBySourceId
      .mockResolvedValueOnce({
        id: "msg-1",
        contentAttributes: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "completed",
          callId: "call-1",
          transcriptionRequested: true,
          hasRecording: true,
          hasTranscript: false,
          hasSummary: false,
          recordingExpired: false,
        },
      })
      .mockResolvedValueOnce({
        id: "msg-1",
        contentAttributes: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "completed",
          callId: "call-1",
          transcriptionRequested: true,
          hasRecording: true,
          hasTranscript: true,
          hasSummary: false,
          recordingExpired: false,
        },
      })

    await Promise.all([
      enrichCallActivityMessage({ call, overrides: { hasRecording: true } }),
      enrichCallActivityMessage({ call, overrides: { hasTranscript: true } }),
    ])

    expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalledWith(
      "wacall-call-1",
      "ws-1",
      { hasRecording: true },
    )
    expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalledWith(
      "wacall-call-1",
      "ws-1",
      { hasTranscript: true },
    )
    // The last broadcast reflects BOTH flags true — neither writer's merge
    // dropped the other's already-applied flag.
    const lastCallData =
      mocks.broadcastToWorkspaceParty.mock.calls.at(-1)?.[1].data
    expect(lastCallData.contentAttributes).toMatchObject({
      hasRecording: true,
      hasTranscript: true,
    })
  })

  // Real timers — the bounded wait totals ~3.5s, which is cheap enough
  // to run for real rather than fighting fake-timer/monotonic-clock
  // interactions elsewhere in this suite (see whatsapp-call-recording.test.ts).
  test("throws WhatsappCallEnrichmentPendingError (instead of silently returning) when the finalize message never lands within the bounded wait", async () => {
    mocks.findBySourceId.mockResolvedValue(null)

    await expect(
      enrichCallActivityMessage({
        call,
        overrides: { hasRecording: true },
      }),
    ).rejects.toBeInstanceOf(WhatsappCallEnrichmentPendingError)

    expect(mocks.mergeContentAttributesBySourceId).not.toHaveBeenCalled()
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
  }, 10_000)

  test("converges once the finalize message shows up mid-wait", async () => {
    mocks.findBySourceId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "msg-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        transcriptionRequested: true,
        hasRecording: false,
        hasTranscript: false,
        hasSummary: false,
        recordingExpired: false,
      },
    })
    mocks.mergeContentAttributesBySourceId.mockResolvedValue({
      id: "msg-1",
      contentAttributes: { type: "whatsapp_call", hasRecording: true },
    })

    await enrichCallActivityMessage({
      call,
      overrides: { hasRecording: true },
    })

    expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalled()
  })

  test("a realtime broadcast failure is swallowed, never thrown", async () => {
    mocks.mergeContentAttributesBySourceId.mockResolvedValue({
      id: "msg-1",
      contentAttributes: { type: "whatsapp_call", hasRecording: true },
    })
    mocks.broadcastToWorkspaceParty.mockRejectedValueOnce(new Error("down"))

    await expect(
      enrichCallActivityMessage({
        call,
        overrides: { hasRecording: true },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.logger.warn).toHaveBeenCalled()
  })
})
