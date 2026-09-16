import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setIfAbsent: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  getJson: vi.fn(),
  compareAndSwap: vi.fn(),
  liveAgents: vi.fn(),
  randomUUID: vi.fn(),
  queueAdd: vi.fn(),
  enqueueIntegrationJob: vi.fn(),
  findRingingByWorkspace: vi.fn(),
  findActiveByContactInbox: vi.fn(),
  findByAttemptId: vi.fn(),
  findByWacid: vi.fn(),
  touchLivenessIfStale: vi.fn(),
  recoverStrandedAccepted: vi.fn(),
  finalizeById: vi.fn(),
  attachWacid: vi.fn(),
  findById: vi.fn(),
  contactInboxFindBy: vi.fn(),
  contactFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  casStore: {
    setIfAbsent: mocks.setIfAbsent,
    set: mocks.set,
    get: mocks.get,
    del: mocks.del,
    getJson: mocks.getJson,
    compareAndSwap: mocks.compareAndSwap,
  },
}))

vi.mock("../src/whatsapp-call/voip-presence-service", () => ({
  whatsappVoipPresenceService: { liveAgents: mocks.liveAgents },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  WHATSAPP_CALL_TERMINAL_STATUSES: ["rejected", "completed", "failed"],
  whatsappCallRepository: {
    findRingingByWorkspace: mocks.findRingingByWorkspace,
    findActiveByContactInbox: mocks.findActiveByContactInbox,
    findByAttemptId: mocks.findByAttemptId,
    findByWacid: mocks.findByWacid,
    touchLivenessIfStale: mocks.touchLivenessIfStale,
    recoverStrandedAccepted: mocks.recoverStrandedAccepted,
    finalizeById: mocks.finalizeById,
    attachWacid: mocks.attachWacid,
    findById: mocks.findById,
  },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findBy: mocks.contactInboxFindBy },
}))

vi.mock("../src/contact/service", () => ({
  contactService: { findById: mocks.contactFindById },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS: {
    attempts: 10,
    backoff: { type: "fixed", delay: 2000 },
  },
  WhatsappVoipSignalingJobAction: {
    handleConnect: "handleConnect",
    expireIfUnanswered: "expireIfUnanswered",
    handleOutboundAnswer: "handleOutboundAnswer",
    expireOutboundDial: "expireOutboundDial",
  },
  whatsappVoipSignalingJobId: (wacid: string) => `voip-signal-${wacid}`,
  whatsappVoipExpiryJobId: (wacid: string) => `voip-expire-${wacid}`,
  outboundAnswerJobId: (attemptId: string) => `voip-out-answer-${attemptId}`,
  expireOutboundDialJobId: (attemptId: string) =>
    `voip-out-expire-${attemptId}`,
  whatsappVoipSignalingQueue: { add: mocks.queueAdd },
  IntegrationJobAction: {
    whatsappCallNativeRecordingFetch: "whatsappCallNativeRecordingFetch",
    whatsappCallNativeTranscriptFetch: "whatsappCallNativeTranscriptFetch",
  },
  whatsappCallNativeRecordingFetchJobId: (wacid: string) =>
    `native-rec-fetch-${wacid}`,
  whatsappCallNativeTranscriptFetchJobId: (wacid: string) =>
    `native-transcript-fetch-${wacid}`,
  enqueueIntegrationJob: mocks.enqueueIntegrationJob,
}))

vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: mocks.randomUUID,
})

const { ACTIVE_CALL_LIVENESS_STALE_MS, isAnswerDeadlineExpired } = await import(
  "../src/whatsapp-call/voip-call-control"
)
const { whatsappVoipCallService } = await import(
  "../src/whatsapp-call/voip-call-service"
)
const { whatsappVoipSignalingService } = await import(
  "../src/whatsapp-call/voip-signaling-service"
)

const NOW = 1_000_000
const DEADLINE = NOW + 30_000
const CALL_IN_PROGRESS_RE = /call-in-progress/

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, "now").mockReturnValue(NOW)
})

describe("whatsappVoipCallService.storeOffer", () => {
  test("writes the offer with SET NX PX=(deadlineAt-now)", async () => {
    mocks.setIfAbsent.mockResolvedValue(true)

    const applied = await whatsappVoipSignalingService.storeOffer({
      wacid: "wa1",
      sdp: "v=0...",
      deadlineAt: DEADLINE,
    })

    expect(applied).toBe(true)
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:offer:wa1",
      { sdp: "v=0...", deadlineAt: DEADLINE },
      30_000,
    )
  })

  test("floors the TTL so a near/past-deadline offer is not written with a non-positive TTL", async () => {
    mocks.setIfAbsent.mockResolvedValue(true)

    await whatsappVoipSignalingService.storeOffer({
      wacid: "wa1",
      sdp: "v=0...",
      deadlineAt: NOW - 1,
    })

    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:offer:wa1",
      expect.anything(),
      5000,
    )
  })

  test("redelivery is a no-op: false when the offer already exists", async () => {
    mocks.setIfAbsent.mockResolvedValue(false)

    await expect(
      whatsappVoipSignalingService.storeOffer({
        wacid: "wa1",
        sdp: "v=0...",
        deadlineAt: DEADLINE,
      }),
    ).resolves.toBe(false)
  })
})

describe("whatsappVoipCallService.resolveRingTargets", () => {
  test("returns the live ring set and creates ONE unclaimed control (reservedUserId empty)", async () => {
    mocks.getJson.mockResolvedValueOnce(null) // no existing control
    mocks.liveAgents.mockResolvedValue(["agent-1", "agent-2"])
    mocks.randomUUID.mockReturnValue("fence-1")
    mocks.setIfAbsent.mockResolvedValue(true)

    const result = await whatsappVoipCallService.resolveRingTargets({
      wacid: "wa1",
      workspaceId: "ws1",
      deadlineAt: DEADLINE,
    })

    expect(result).toEqual({ status: "ring", targets: ["agent-1", "agent-2"] })
    expect(mocks.liveAgents).toHaveBeenCalledWith({ workspaceId: "ws1" })
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      {
        reservedUserId: "",
        phase: "reserved",
        deadlineAt: DEADLINE,
        fenceToken: "fence-1",
      },
      30_000,
    )
  })

  test("returns noEligibleAgent when nobody has the inbox open", async () => {
    mocks.getJson.mockResolvedValueOnce(null)
    mocks.liveAgents.mockResolvedValue([])

    const result = await whatsappVoipCallService.resolveRingTargets({
      wacid: "wa1",
      workspaceId: "ws1",
      deadlineAt: DEADLINE,
    })

    expect(result).toEqual({ status: "noEligibleAgent" })
    expect(mocks.setIfAbsent).not.toHaveBeenCalled()
  })

  test("a redelivered connect for a still-ringing call re-rings the current live set", async () => {
    mocks.getJson.mockResolvedValueOnce({
      reservedUserId: "",
      phase: "reserved",
      deadlineAt: DEADLINE,
      fenceToken: "fence-1",
    })
    mocks.liveAgents.mockResolvedValue(["agent-3"])

    const result = await whatsappVoipCallService.resolveRingTargets({
      wacid: "wa1",
      workspaceId: "ws1",
      deadlineAt: DEADLINE,
    })

    expect(result).toEqual({ status: "ring", targets: ["agent-3"] })
    expect(mocks.setIfAbsent).not.toHaveBeenCalled()
  })

  test("a redelivered connect whose agents have all left rejects (no ringing an empty set)", async () => {
    mocks.getJson.mockResolvedValueOnce({
      reservedUserId: "",
      phase: "reserved",
      deadlineAt: DEADLINE,
      fenceToken: "fence-1",
    })
    mocks.liveAgents.mockResolvedValue([])

    const result = await whatsappVoipCallService.resolveRingTargets({
      wacid: "wa1",
      workspaceId: "ws1",
      deadlineAt: DEADLINE,
    })

    expect(result).toEqual({ status: "noEligibleAgent" })
  })

  test("returns alreadyProgressed when the call has moved past 'reserved'", async () => {
    mocks.getJson.mockResolvedValueOnce({
      reservedUserId: "agent-1",
      phase: "answering",
      deadlineAt: DEADLINE,
      fenceToken: "fence-1",
    })

    const result = await whatsappVoipCallService.resolveRingTargets({
      wacid: "wa1",
      workspaceId: "ws1",
      deadlineAt: DEADLINE,
    })

    expect(result).toEqual({ status: "alreadyProgressed" })
    expect(mocks.liveAgents).not.toHaveBeenCalled()
  })
})

describe("whatsappVoipCallService.claimForAnswer", () => {
  const unclaimed = {
    reservedUserId: "",
    phase: "reserved" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("wins: any live agent claims the unclaimed call, CAS reserved -> answering stamping the claimant, returns the fence", async () => {
    mocks.getJson.mockResolvedValue(unclaimed)
    mocks.compareAndSwap.mockResolvedValue(true)

    const fenceToken = await whatsappVoipCallService.claimForAnswer({
      wacid: "wa1",
      userId: "agent-2",
    })

    expect(fenceToken).toBe("fence-1")
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      unclaimed,
      { ...unclaimed, phase: "answering", reservedUserId: "agent-2" },
      30_000,
    )
  })

  test("loses: the call was already claimed by someone else (phase past reserved)", async () => {
    mocks.getJson.mockResolvedValue({
      ...unclaimed,
      phase: "answering",
      reservedUserId: "agent-1",
    })

    const fenceToken = await whatsappVoipCallService.claimForAnswer({
      wacid: "wa1",
      userId: "agent-2",
    })

    expect(fenceToken).toBeNull()
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("loses: two answerers race, second CAS returns false", async () => {
    mocks.getJson.mockResolvedValue(unclaimed)
    mocks.compareAndSwap.mockResolvedValue(false)

    const fenceToken = await whatsappVoipCallService.claimForAnswer({
      wacid: "wa1",
      userId: "agent-1",
    })

    expect(fenceToken).toBeNull()
  })

  test("loses: already accepted", async () => {
    mocks.getJson.mockResolvedValue({
      ...unclaimed,
      phase: "accepted",
      reservedUserId: "agent-1",
    })

    const fenceToken = await whatsappVoipCallService.claimForAnswer({
      wacid: "wa1",
      userId: "agent-1",
    })

    expect(fenceToken).toBeNull()
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })
})

describe("whatsappVoipCallService.commitAccepted", () => {
  const answering = {
    reservedUserId: "agent-1",
    phase: "answering" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("wins: CAS answering+matching fence -> accepted with the active-call TTL", async () => {
    mocks.getJson.mockResolvedValue(answering)
    mocks.compareAndSwap.mockResolvedValue(true)

    const won = await whatsappVoipCallService.commitAccepted({
      wacid: "wa1",
      fenceToken: "fence-1",
    })

    expect(won).toBe(true)
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      answering,
      { ...answering, phase: "accepted" },
      4 * 60 * 60 * 1000,
    )
  })

  test("loses: fence mismatch is rejected before any CAS call", async () => {
    mocks.getJson.mockResolvedValue(answering)

    const won = await whatsappVoipCallService.commitAccepted({
      wacid: "wa1",
      fenceToken: "wrong-fence",
    })

    expect(won).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("fence inverse race: a terminate that already advanced the phase beats this CAS", async () => {
    mocks.getJson.mockResolvedValue({ ...answering, phase: "terminated" })

    const won = await whatsappVoipCallService.commitAccepted({
      wacid: "wa1",
      fenceToken: "fence-1",
    })

    expect(won).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })
})

describe("whatsappVoipCallService.heartbeatActiveCall", () => {
  const accepted = {
    reservedUserId: "agent-1",
    phase: "accepted" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("verified: renews the control TTL in one fenced CAS, preserving the fence and value", async () => {
    mocks.findByWacid.mockResolvedValue({ id: "call-1", workspaceId: "ws-1" })
    mocks.getJson.mockResolvedValue(accepted)
    mocks.compareAndSwap.mockResolvedValue(true)
    mocks.touchLivenessIfStale.mockResolvedValue(true)

    const ok = await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "agent-1",
    })

    expect(ok).toBe(true)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      { phase: "accepted", fenceToken: "fence-1" },
      accepted,
      4 * 60 * 60 * 1000,
    )
  })

  test("the durable liveness touch is always attempted — the DB's own guard is the throttle", async () => {
    mocks.findByWacid.mockResolvedValue({ id: "call-1", workspaceId: "ws-1" })
    mocks.getJson.mockResolvedValue(accepted)
    mocks.compareAndSwap.mockResolvedValue(true)
    mocks.touchLivenessIfStale.mockResolvedValue(false)

    await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "agent-1",
    })

    expect(mocks.touchLivenessIfStale).toHaveBeenCalledWith({
      id: "call-1",
      olderThan: expect.any(Date),
    })
  })

  test("a failing liveness touch never fails the heartbeat itself", async () => {
    mocks.findByWacid.mockResolvedValue({ id: "call-1", workspaceId: "ws-1" })
    mocks.getJson.mockResolvedValue(accepted)
    mocks.compareAndSwap.mockResolvedValue(true)
    mocks.touchLivenessIfStale.mockRejectedValue(new Error("db down"))

    await expect(
      whatsappVoipCallService.heartbeatActiveCall({
        wacid: "wa1",
        workspaceId: "ws-1",
        userId: "agent-1",
      }),
    ).resolves.toBe(true)
  })

  test("Redis lost the control: an accepted row owned by this agent still counts as live — liveness touched, heartbeat keeps going", async () => {
    mocks.findByWacid.mockResolvedValue({
      id: "call-1",
      workspaceId: "ws-1",
      status: "accepted",
      answeredByUserId: "agent-1",
      initiatedByUserId: null,
      updatedAt: new Date(NOW - 5 * 60 * 1000),
    })
    mocks.getJson.mockResolvedValue(null)
    mocks.touchLivenessIfStale.mockResolvedValue(undefined)

    const ok = await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "agent-1",
    })

    expect(ok).toBe(true)
    expect(mocks.touchLivenessIfStale).toHaveBeenCalledWith({
      id: "call-1",
      olderThan: expect.any(Date),
    })
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("Redis lost the control: a row this agent does not own is still a no-op", async () => {
    mocks.findByWacid.mockResolvedValue({
      id: "call-1",
      workspaceId: "ws-1",
      status: "accepted",
      answeredByUserId: "someone-else",
      initiatedByUserId: null,
      updatedAt: new Date(NOW - 5 * 60 * 1000),
    })
    mocks.getJson.mockResolvedValue(null)

    await expect(
      whatsappVoipCallService.heartbeatActiveCall({
        wacid: "wa1",
        workspaceId: "ws-1",
        userId: "agent-1",
      }),
    ).resolves.toBe(false)
    expect(mocks.touchLivenessIfStale).not.toHaveBeenCalled()
  })

  test("Redis lost the control: a row that already ended is a no-op", async () => {
    mocks.findByWacid.mockResolvedValue({
      id: "call-1",
      workspaceId: "ws-1",
      status: "completed",
      answeredByUserId: "agent-1",
      initiatedByUserId: null,
      updatedAt: new Date(NOW - 5 * 60 * 1000),
    })
    mocks.getJson.mockResolvedValue(null)

    await expect(
      whatsappVoipCallService.heartbeatActiveCall({
        wacid: "wa1",
        workspaceId: "ws-1",
        userId: "agent-1",
      }),
    ).resolves.toBe(false)
    expect(mocks.touchLivenessIfStale).not.toHaveBeenCalled()
  })

  test("false: the call does not belong to the given workspace", async () => {
    mocks.findByWacid.mockResolvedValue({ id: "call-1", workspaceId: "ws-2" })

    const ok = await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "agent-1",
    })

    expect(ok).toBe(false)
    expect(mocks.set).not.toHaveBeenCalled()
  })

  test("false: no call row for the wacid", async () => {
    mocks.findByWacid.mockResolvedValue(undefined)

    const ok = await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "agent-1",
    })

    expect(ok).toBe(false)
    expect(mocks.getJson).not.toHaveBeenCalled()
  })

  test("false: control is not phase:accepted", async () => {
    mocks.findByWacid.mockResolvedValue({ id: "call-1", workspaceId: "ws-1" })
    mocks.getJson.mockResolvedValue({ ...accepted, phase: "answering" })

    const ok = await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "agent-1",
    })

    expect(ok).toBe(false)
    expect(mocks.set).not.toHaveBeenCalled()
  })

  test("false: reservedUserId does not match the caller (wrong user)", async () => {
    mocks.findByWacid.mockResolvedValue({ id: "call-1", workspaceId: "ws-1" })
    mocks.getJson.mockResolvedValue(accepted)

    const ok = await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "someone-else",
    })

    expect(ok).toBe(false)
    expect(mocks.set).not.toHaveBeenCalled()
  })

  test("a lost renewal CAS (concurrent hangup) never fails the heartbeat itself", async () => {
    mocks.findByWacid.mockResolvedValue({ id: "call-1", workspaceId: "ws-1" })
    mocks.getJson.mockResolvedValue(accepted)
    mocks.compareAndSwap.mockResolvedValue(false)

    const ok = await whatsappVoipCallService.heartbeatActiveCall({
      wacid: "wa1",
      workspaceId: "ws-1",
      userId: "agent-1",
    })

    expect(ok).toBe(true)
    expect(mocks.compareAndSwap).toHaveBeenCalled()
  })
})

describe("isAnswerDeadlineExpired", () => {
  test("false when comfortably within the deadline", () => {
    expect(isAnswerDeadlineExpired(NOW + 10_000)).toBe(false)
  })

  test("true within the 3s safety margin of the deadline", () => {
    expect(isAnswerDeadlineExpired(NOW + 2000)).toBe(true)
  })

  test("true once the deadline has already passed", () => {
    expect(isAnswerDeadlineExpired(NOW - 1)).toBe(true)
  })
})

describe("whatsappVoipCallService.endCall", () => {
  const answering = {
    reservedUserId: "agent-1",
    phase: "answering" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("terminates a reserved call, reporting graphAction:reject (never answered)", async () => {
    const reserved = { ...answering, phase: "reserved" as const }
    mocks.getJson.mockResolvedValue(reserved)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: false,
    })

    expect(result).toEqual({
      fromPhase: "reserved",
      graphAction: "reject",
      terminalStatus: "rejected",
    })
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      reserved,
      { ...reserved, phase: "terminated" },
      60_000,
    )
  })

  test("terminates an answering call, reporting graphAction:terminate (handshake may have started)", async () => {
    mocks.getJson.mockResolvedValue(answering)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: false,
    })

    expect(result).toEqual({
      fromPhase: "answering",
      graphAction: "terminate",
      terminalStatus: "failed",
    })
  })

  test("refuses an accepted call when allowFromAccepted is false (never downgrades a live call)", async () => {
    mocks.getJson.mockResolvedValue({ ...answering, phase: "accepted" })

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: false,
    })

    expect(result).toBeNull()
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("terminates an accepted call when allowFromAccepted is true (hangup path)", async () => {
    const accepted = { ...answering, phase: "accepted" as const }
    mocks.getJson.mockResolvedValue(accepted)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: true,
    })

    expect(result).toEqual({
      fromPhase: "accepted",
      graphAction: "terminate",
      terminalStatus: "completed",
    })
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      accepted,
      { ...accepted, phase: "terminated" },
      60_000,
    )
  })

  test("beats an in-flight accept: terminate wins, a later commitAccepted CAS then loses", async () => {
    mocks.getJson.mockResolvedValueOnce(answering)
    mocks.compareAndSwap.mockResolvedValueOnce(true)

    const ended = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: false,
    })
    expect(ended).not.toBeNull()

    // The next commitAccepted call re-reads and now observes "terminated".
    mocks.getJson.mockResolvedValueOnce({ ...answering, phase: "terminated" })
    const accepted = await whatsappVoipCallService.commitAccepted({
      wacid: "wa1",
      fenceToken: "fence-1",
    })
    expect(accepted).toBe(false)
  })

  test("no-op when already in a final phase", async () => {
    mocks.getJson.mockResolvedValue({ ...answering, phase: "terminated" })

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: true,
    })

    expect(result).toBeNull()
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("no-op when there is no control record at all", async () => {
    mocks.getJson.mockResolvedValue(null)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: true,
    })

    expect(result).toBeNull()
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("no-op when the CAS is lost to a concurrent writer", async () => {
    mocks.getJson.mockResolvedValue(answering)
    mocks.compareAndSwap.mockResolvedValue(false)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: false,
    })

    expect(result).toBeNull()
  })
})

describe("whatsappVoipCallService.releaseClaim", () => {
  const answering = {
    reservedUserId: "agent-1",
    phase: "answering" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("releases on matching fence+phase: answering -> reserved, reservedUserId cleared", async () => {
    mocks.getJson.mockResolvedValue(answering)
    mocks.compareAndSwap.mockResolvedValue(true)

    const released = await whatsappVoipCallService.releaseClaim({
      wacid: "wa1",
      fenceToken: "fence-1",
    })

    expect(released).toBe(true)
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      answering,
      { ...answering, phase: "reserved", reservedUserId: "" },
      30_000,
    )
  })

  test("no-op on wrong fence", async () => {
    mocks.getJson.mockResolvedValue(answering)

    const released = await whatsappVoipCallService.releaseClaim({
      wacid: "wa1",
      fenceToken: "wrong-fence",
    })

    expect(released).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("no-op when phase is already accepted", async () => {
    mocks.getJson.mockResolvedValue({ ...answering, phase: "accepted" })

    const released = await whatsappVoipCallService.releaseClaim({
      wacid: "wa1",
      fenceToken: "fence-1",
    })

    expect(released).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("no-op when phase is already terminated", async () => {
    mocks.getJson.mockResolvedValue({ ...answering, phase: "terminated" })

    const released = await whatsappVoipCallService.releaseClaim({
      wacid: "wa1",
      fenceToken: "fence-1",
    })

    expect(released).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("no-op when there is no control record", async () => {
    mocks.getJson.mockResolvedValue(null)

    const released = await whatsappVoipCallService.releaseClaim({
      wacid: "wa1",
      fenceToken: "fence-1",
    })

    expect(released).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })
})

describe("whatsappVoipCallService.captureConnectOffer", () => {
  test("stores the offer and enqueues the connect + expiry jobs — the SDP never reaches a job payload", async () => {
    mocks.setIfAbsent.mockResolvedValue(true)

    await whatsappVoipSignalingService.captureConnectOffer({
      wacid: "wa1",
      sdp: "v=0...",
      phoneNumberId: "phone-1",
    })

    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:offer:wa1",
      { sdp: "v=0...", deadlineAt: NOW + 55_000 },
      55_000,
    )
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "handleConnect",
      {
        type: "handleConnect",
        data: {
          wacid: "wa1",
          deadlineAt: NOW + 55_000,
          phoneNumberId: "phone-1",
        },
      },
      expect.objectContaining({
        jobId: "voip-signal-wa1",
        attempts: 10,
      }),
    )
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "expireIfUnanswered",
      {
        type: "expireIfUnanswered",
        data: {
          wacid: "wa1",
          deadlineAt: NOW + 55_000,
          phoneNumberId: "phone-1",
        },
      },
      expect.objectContaining({
        jobId: "voip-expire-wa1",
        delay: 55_000,
      }),
    )
    const jobPayload = mocks.queueAdd.mock.calls[0][1]
    expect(JSON.stringify(jobPayload)).not.toContain("v=0")
  })

  test("a redelivered connect is a full no-op: no job is enqueued when storeOffer reports the offer already exists", async () => {
    mocks.setIfAbsent.mockResolvedValue(false)

    await whatsappVoipSignalingService.captureConnectOffer({
      wacid: "wa1",
      sdp: "v=0...",
      phoneNumberId: "phone-1",
    })

    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("releases the offer claim (so a redelivery can retry) if a job enqueue throws after storeOffer succeeds", async () => {
    mocks.setIfAbsent.mockResolvedValue(true)
    mocks.queueAdd.mockRejectedValueOnce(new Error("bullmq down"))

    await expect(
      whatsappVoipSignalingService.captureConnectOffer({
        wacid: "wa1",
        sdp: "v=0...",
        phoneNumberId: "phone-1",
      }),
    ).rejects.toThrow("bullmq down")

    // The SET NX claim is released so a Meta redelivery re-stores + re-enqueues
    // rather than early-returning forever on a stranded offer key.
    expect(mocks.del).toHaveBeenCalledWith("voip:offer:wa1")
  })
})

describe("whatsappVoipCallService.rejectUnprocessableConnect", () => {
  test("enqueues ONLY the connect job (no offer stored, no expiry) so the consumer Meta-rejects", async () => {
    await whatsappVoipSignalingService.rejectUnprocessableConnect({
      wacid: "wa1",
      phoneNumberId: "phone-1",
    })

    expect(mocks.setIfAbsent).not.toHaveBeenCalled()
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "handleConnect",
      expect.objectContaining({ type: "handleConnect" }),
      expect.objectContaining({ jobId: "voip-signal-wa1" }),
    )
  })
})

describe("whatsappVoipCallService offer/control readers", () => {
  test("readOffer/deleteOffer/readControl delegate to the expected keys", async () => {
    mocks.getJson.mockResolvedValue(null)

    await whatsappVoipSignalingService.readOffer("wa1")
    expect(mocks.getJson).toHaveBeenCalledWith("voip:offer:wa1")

    await whatsappVoipSignalingService.deleteOffer("wa1")
    expect(mocks.del).toHaveBeenCalledWith("voip:offer:wa1")

    await whatsappVoipCallService.readControl("wa1")
    expect(mocks.getJson).toHaveBeenCalledWith("voip:ctrl:wa1")
  })
})

describe("whatsappVoipCallService outbound endCall outcomes", () => {
  const dialingControl = {
    reservedUserId: "agent-1",
    phase: "dialing" as const,
    direction: "businessInitiated" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("terminates a dialing call, reporting graphAction:terminate/failed (never reject)", async () => {
    mocks.getJson.mockResolvedValue(dialingControl)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: false,
    })

    expect(result).toEqual({
      fromPhase: "dialing",
      graphAction: "terminate",
      terminalStatus: "failed",
    })
  })

  test("terminates a ringing call, reporting graphAction:terminate/failed (never reject)", async () => {
    mocks.getJson.mockResolvedValue({ ...dialingControl, phase: "ringing" })
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: false,
    })

    expect(result).toEqual({
      fromPhase: "ringing",
      graphAction: "terminate",
      terminalStatus: "failed",
    })
  })

  test("terminates an accepted outbound call, reporting graphAction:terminate/completed (hangup path)", async () => {
    const accepted = { ...dialingControl, phase: "accepted" as const }
    mocks.getJson.mockResolvedValue(accepted)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.endCall({
      wacid: "wa1",
      allowFromAccepted: true,
    })

    expect(result).toEqual({
      fromPhase: "accepted",
      graphAction: "terminate",
      terminalStatus: "completed",
    })
  })
})

describe("whatsappVoipCallService.startOutboundDial", () => {
  test("creates a dialing control keyed by wacid (SAME voip:ctrl: namespace as inbound), TTL includes the margin over the expiry job's delay", async () => {
    mocks.findByWacid.mockResolvedValue(undefined)
    mocks.randomUUID.mockReturnValue("fence-out-1")
    mocks.setIfAbsent.mockResolvedValue(true)

    const control = await whatsappVoipCallService.startOutboundDial({
      wacid: "wa1",
      initiatorUserId: "agent-1",
      deadlineAt: DEADLINE,
    })

    expect(control).toEqual({
      reservedUserId: "agent-1",
      phase: "dialing",
      direction: "businessInitiated",
      deadlineAt: DEADLINE,
      fenceToken: "fence-out-1",
    })
    // remainingTtlMs(DEADLINE) is 30_000; +20_000 margin = 50_000, so the
    // control key outlives the expireOutboundDial job scheduled with the
    // same 30_000ms delay.
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      control,
      50_000,
    )
  })

  test("returns null when a control already exists for this wacid (SET NX loses)", async () => {
    mocks.findByWacid.mockResolvedValue(undefined)
    mocks.randomUUID.mockReturnValue("fence-out-1")
    mocks.setIfAbsent.mockResolvedValue(false)

    const control = await whatsappVoipCallService.startOutboundDial({
      wacid: "wa1",
      initiatorUserId: "agent-1",
      deadlineAt: DEADLINE,
    })

    expect(control).toBeNull()
  })

  test("L3: the DB row is already accepted (ACCEPTED status raced ahead of this call) — starts the control in phase accepted with the active-call TTL", async () => {
    mocks.findByWacid.mockResolvedValue({ status: "accepted" })
    mocks.randomUUID.mockReturnValue("fence-out-2")
    mocks.setIfAbsent.mockResolvedValue(true)

    const control = await whatsappVoipCallService.startOutboundDial({
      wacid: "wa1",
      initiatorUserId: "agent-1",
      deadlineAt: DEADLINE,
    })

    expect(control).toEqual({
      reservedUserId: "agent-1",
      phase: "accepted",
      direction: "businessInitiated",
      deadlineAt: DEADLINE,
      fenceToken: "fence-out-2",
    })
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      control,
      4 * 60 * 60 * 1000,
    )
  })

  test("row status other than accepted (e.g. still ringing) still starts in phase dialing", async () => {
    mocks.findByWacid.mockResolvedValue({ status: "ringing" })
    mocks.randomUUID.mockReturnValue("fence-out-3")
    mocks.setIfAbsent.mockResolvedValue(true)

    const control = await whatsappVoipCallService.startOutboundDial({
      wacid: "wa1",
      initiatorUserId: "agent-1",
      deadlineAt: DEADLINE,
    })

    expect(control?.phase).toBe("dialing")
  })
})

describe("whatsappVoipCallService.markOutboundRinging", () => {
  const dialing = {
    reservedUserId: "agent-1",
    phase: "dialing" as const,
    direction: "businessInitiated" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("CAS dialing -> ringing", async () => {
    mocks.getJson.mockResolvedValue(dialing)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.markOutboundRinging({
      wacid: "wa1",
    })

    expect(result).toBe(true)
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      dialing,
      { ...dialing, phase: "ringing" },
      30_000,
    )
  })

  test("rejects when the control is not in dialing (e.g. already accepted)", async () => {
    mocks.getJson.mockResolvedValue({ ...dialing, phase: "accepted" })

    const result = await whatsappVoipCallService.markOutboundRinging({
      wacid: "wa1",
    })

    expect(result).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("rejects when there is no control record", async () => {
    mocks.getJson.mockResolvedValue(null)

    const result = await whatsappVoipCallService.markOutboundRinging({
      wacid: "wa1",
    })

    expect(result).toBe(false)
  })
})

describe("whatsappVoipCallService.markOutboundAccepted", () => {
  const dialing = {
    reservedUserId: "agent-1",
    phase: "dialing" as const,
    direction: "businessInitiated" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
  }

  test("CAS dialing -> accepted", async () => {
    mocks.getJson.mockResolvedValue(dialing)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.markOutboundAccepted({
      wacid: "wa1",
    })

    expect(result).toBe(true)
    expect(mocks.compareAndSwap).toHaveBeenCalledWith(
      "voip:ctrl:wa1",
      dialing,
      { ...dialing, phase: "accepted" },
      4 * 60 * 60 * 1000,
    )
  })

  test("CAS ringing -> accepted", async () => {
    const ringing = { ...dialing, phase: "ringing" as const }
    mocks.getJson.mockResolvedValue(ringing)
    mocks.compareAndSwap.mockResolvedValue(true)

    const result = await whatsappVoipCallService.markOutboundAccepted({
      wacid: "wa1",
    })

    expect(result).toBe(true)
  })

  test("rejects on wrong phase (e.g. already terminated)", async () => {
    mocks.getJson.mockResolvedValue({ ...dialing, phase: "terminated" })

    const result = await whatsappVoipCallService.markOutboundAccepted({
      wacid: "wa1",
    })

    expect(result).toBe(false)
    expect(mocks.compareAndSwap).not.toHaveBeenCalled()
  })

  test("rejects when there is no control record", async () => {
    mocks.getJson.mockResolvedValue(null)

    const result = await whatsappVoipCallService.markOutboundAccepted({
      wacid: "wa1",
    })

    expect(result).toBe(false)
  })
})

describe("whatsappVoipCallService outbound answer store", () => {
  test("storeOutboundAnswer writes with SET NX PX keyed by attemptId, SDP-only payload", async () => {
    mocks.setIfAbsent.mockResolvedValue(true)

    const created = await whatsappVoipSignalingService.storeOutboundAnswer({
      attemptId: "att-1",
      sdp: "v=0...",
    })

    expect(created).toBe(true)
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:out:answer:att-1",
      { sdp: "v=0..." },
      55_000,
    )
  })

  test("storeOutboundAnswer redelivery is a no-op: false when it already exists", async () => {
    mocks.setIfAbsent.mockResolvedValue(false)

    await expect(
      whatsappVoipSignalingService.storeOutboundAnswer({
        attemptId: "att-1",
        sdp: "v=0...",
      }),
    ).resolves.toBe(false)
  })

  test("readOutboundAnswer/deleteOutboundAnswer delegate to the attemptId-keyed key", async () => {
    mocks.getJson.mockResolvedValue({ sdp: "v=0..." })

    const answer =
      await whatsappVoipSignalingService.readOutboundAnswer("att-1")
    expect(mocks.getJson).toHaveBeenCalledWith("voip:out:answer:att-1")
    expect(answer).toEqual({ sdp: "v=0..." })

    await whatsappVoipSignalingService.deleteOutboundAnswer("att-1")
    expect(mocks.del).toHaveBeenCalledWith("voip:out:answer:att-1")
  })
})

describe("whatsappVoipCallService.captureOutboundAnswer", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "call-1",
    attemptId: "att-1",
    wacid: "wa1",
    workspaceId: "ws-1",
    ...overrides,
  })

  test("resolves by attemptId, stores the answer, and enqueues handleOutboundAnswer — the SDP never reaches the job payload", async () => {
    mocks.findByAttemptId.mockResolvedValue(row())
    mocks.setIfAbsent.mockResolvedValue(true)

    await whatsappVoipSignalingService.captureOutboundAnswer({
      attemptId: "att-1",
      wacid: "wa1",
      sdp: "v=0...",
    })

    expect(mocks.findByAttemptId).toHaveBeenCalledWith("att-1")
    expect(mocks.findByWacid).not.toHaveBeenCalled()
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:out:answer:att-1",
      { sdp: "v=0..." },
      55_000,
    )
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "handleOutboundAnswer",
      {
        type: "handleOutboundAnswer",
        data: {
          attemptId: "att-1",
          whatsappCallId: "call-1",
          wacid: "wa1",
          workspaceId: "ws-1",
        },
      },
      expect.objectContaining({
        jobId: "voip-out-answer-att-1",
        attempts: 10,
      }),
    )
    const jobPayload = mocks.queueAdd.mock.calls[0][1]
    expect(JSON.stringify(jobPayload)).not.toContain("v=0")
  })

  test("falls back to findByWacid when attemptId is absent (older/edge payload)", async () => {
    mocks.findByWacid.mockResolvedValue(row())
    mocks.setIfAbsent.mockResolvedValue(true)

    await whatsappVoipSignalingService.captureOutboundAnswer({
      attemptId: "",
      wacid: "wa1",
      sdp: "v=0...",
    })

    expect(mocks.findByAttemptId).not.toHaveBeenCalled()
    expect(mocks.findByWacid).toHaveBeenCalledWith("wa1")
    // The resolved row's own attemptId is used as the storage/enqueue key.
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "voip:out:answer:att-1",
      { sdp: "v=0..." },
      55_000,
    )
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "handleOutboundAnswer",
      expect.objectContaining({
        data: expect.objectContaining({ attemptId: "att-1" }),
      }),
      expect.objectContaining({ jobId: "voip-out-answer-att-1" }),
    )
  })

  test("no matching row (neither attemptId nor wacid resolves): logs and returns without enqueueing", async () => {
    mocks.findByAttemptId.mockResolvedValue(undefined)
    mocks.findByWacid.mockResolvedValue(undefined)

    await whatsappVoipSignalingService.captureOutboundAnswer({
      attemptId: "att-missing",
      wacid: "wa-missing",
      sdp: "v=0...",
    })

    expect(mocks.setIfAbsent).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a redelivered answer is a full no-op: no job enqueued when storeOutboundAnswer reports it already exists", async () => {
    mocks.findByAttemptId.mockResolvedValue(row())
    mocks.setIfAbsent.mockResolvedValue(false)

    await whatsappVoipSignalingService.captureOutboundAnswer({
      attemptId: "att-1",
      wacid: "wa1",
      sdp: "v=0...",
    })

    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("releases the stored answer if the job enqueue throws, so a redelivery can retry", async () => {
    mocks.findByAttemptId.mockResolvedValue(row())
    mocks.setIfAbsent.mockResolvedValue(true)
    mocks.queueAdd.mockRejectedValueOnce(new Error("bullmq down"))

    await expect(
      whatsappVoipSignalingService.captureOutboundAnswer({
        attemptId: "att-1",
        wacid: "wa1",
        sdp: "v=0...",
      }),
    ).rejects.toThrow("bullmq down")

    expect(mocks.del).toHaveBeenCalledWith("voip:out:answer:att-1")
  })
})

describe("whatsappVoipCallService.captureNativeRecordingAvailable", () => {
  test("resolves the row by wacid and enqueues whatsappCallNativeRecordingFetch with a wacid-keyed jobId", async () => {
    mocks.findByWacid.mockResolvedValue({
      id: "call-1",
      wacid: "wa1",
      workspaceId: "ws-1",
    })

    await whatsappVoipSignalingService.captureNativeRecordingAvailable({
      wacid: "wa1",
      audioMediaId: "media-1",
      audioUrl: "https://graph.example/media-1",
      mimeType: "audio/ogg; codecs=opus",
    })

    expect(mocks.findByWacid).toHaveBeenCalledWith("wa1")
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "whatsappCallNativeRecordingFetch",
        data: {
          whatsappCallId: "call-1",
          wacid: "wa1",
          workspaceId: "ws-1",
          audioMediaId: "media-1",
          audioUrl: "https://graph.example/media-1",
          mimeType: "audio/ogg; codecs=opus",
        },
      },
      { jobId: "native-rec-fetch-wa1" },
    )
  })

  test("R8: no matching row yet still enqueues, keyed by wacid, without whatsappCallId/workspaceId", async () => {
    mocks.findByWacid.mockResolvedValue(undefined)

    await whatsappVoipSignalingService.captureNativeRecordingAvailable({
      wacid: "wa-missing",
      audioMediaId: "media-1",
      audioUrl: "https://graph.example/media-1",
      mimeType: "audio/ogg; codecs=opus",
    })

    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "whatsappCallNativeRecordingFetch",
        data: {
          wacid: "wa-missing",
          audioMediaId: "media-1",
          audioUrl: "https://graph.example/media-1",
          mimeType: "audio/ogg; codecs=opus",
        },
      },
      { jobId: "native-rec-fetch-wa-missing" },
    )
  })
})

describe("whatsappVoipCallService.captureNativeTranscriptAvailable", () => {
  test("resolves the row by wacid and enqueues whatsappCallNativeTranscriptFetch with a wacid-keyed jobId", async () => {
    mocks.findByWacid.mockResolvedValue({
      id: "call-1",
      wacid: "wa1",
      workspaceId: "ws-1",
    })

    await whatsappVoipSignalingService.captureNativeTranscriptAvailable({
      wacid: "wa1",
      documentMediaId: "doc-1",
      documentUrl: "https://graph.example/doc-1",
    })

    expect(mocks.findByWacid).toHaveBeenCalledWith("wa1")
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "whatsappCallNativeTranscriptFetch",
        data: {
          whatsappCallId: "call-1",
          wacid: "wa1",
          workspaceId: "ws-1",
          documentMediaId: "doc-1",
          documentUrl: "https://graph.example/doc-1",
        },
      },
      { jobId: "native-transcript-fetch-wa1" },
    )
  })

  test("R8: no matching row yet still enqueues, keyed by wacid, without whatsappCallId/workspaceId", async () => {
    mocks.findByWacid.mockResolvedValue(undefined)

    await whatsappVoipSignalingService.captureNativeTranscriptAvailable({
      wacid: "wa-missing",
      documentMediaId: "doc-1",
      documentUrl: "https://graph.example/doc-1",
    })

    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "whatsappCallNativeTranscriptFetch",
        data: {
          wacid: "wa-missing",
          documentMediaId: "doc-1",
          documentUrl: "https://graph.example/doc-1",
        },
      },
      { jobId: "native-transcript-fetch-wa-missing" },
    )
  })
})

describe("whatsappVoipCallService.enqueueOutboundDialExpiry", () => {
  test("enqueues expireOutboundDial with a deadline-derived delay and deterministic jobId", async () => {
    await whatsappVoipSignalingService.enqueueOutboundDialExpiry({
      attemptId: "att-1",
      whatsappCallId: "call-1",
      wacid: "wa1",
      workspaceId: "ws-1",
      deadlineAt: DEADLINE,
    })

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "expireOutboundDial",
      {
        type: "expireOutboundDial",
        data: {
          attemptId: "att-1",
          whatsappCallId: "call-1",
          wacid: "wa1",
          workspaceId: "ws-1",
          deadlineAt: DEADLINE,
        },
      },
      expect.objectContaining({
        jobId: "voip-out-expire-att-1",
        delay: 30_000,
        attempts: 10,
      }),
    )
  })

  test("floors the delay at 0 for a past deadline", async () => {
    await whatsappVoipSignalingService.enqueueOutboundDialExpiry({
      attemptId: "att-1",
      whatsappCallId: "call-1",
      wacid: "wa1",
      workspaceId: "ws-1",
      deadlineAt: NOW - 1,
    })

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "expireOutboundDial",
      expect.anything(),
      expect.objectContaining({ delay: 0 }),
    )
  })
})

describe("whatsappVoipCallService.assertNoActiveCallForContact", () => {
  test("resolves when no active call exists for the contact", async () => {
    mocks.findActiveByContactInbox.mockResolvedValue(undefined)

    await expect(
      whatsappVoipCallService.assertNoActiveCallForContact({
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.findActiveByContactInbox).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
    })
  })

  test("throws WhatsappCallInProgressError when an active call (either direction) exists", async () => {
    mocks.findActiveByContactInbox.mockResolvedValue({ id: "call-1" })

    await expect(
      whatsappVoipCallService.assertNoActiveCallForContact({
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
      }),
    ).rejects.toThrow(CALL_IN_PROGRESS_RE)
  })

  describe("dial-time recovery of a stranded accepted call", () => {
    const strandedRow = (overrides: Record<string, unknown> = {}) => ({
      id: "call-1",
      wacid: "wacid.ABC",
      status: "accepted",
      ...overrides,
    })

    const dial = () =>
      whatsappVoipCallService.assertNoActiveCallForContact({
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
      })

    test("closes the row and allows the dial when the control is gone and liveness is stale", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(strandedRow())
      mocks.getJson.mockResolvedValue(null)
      mocks.recoverStrandedAccepted.mockResolvedValue({ id: "call-1" })

      await expect(dial()).resolves.toBeUndefined()

      // One guarded statement: the staleness cutoff and the terminal write
      // travel together, so a heartbeat can never land in between.
      expect(mocks.recoverStrandedAccepted).toHaveBeenCalledWith({
        id: "call-1",
        olderThan: new Date(NOW - ACTIVE_CALL_LIVENESS_STALE_MS),
        lastError: "stranded-accepted-recovered-on-dial",
      })
      expect(mocks.findById).not.toHaveBeenCalled()
    })

    test("recovers a connected call as completed, never failed — reaching accepted means it connected", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(strandedRow())
      mocks.getJson.mockResolvedValue(null)
      mocks.recoverStrandedAccepted.mockResolvedValue({ id: "call-1" })

      await expect(dial()).resolves.toBeUndefined()
      // Neither `status` nor `endedAt` is a parameter: the repository always
      // writes `completed`, and the end time stays unknown rather than guessed.
      expect(mocks.recoverStrandedAccepted).toHaveBeenCalledWith(
        expect.not.objectContaining({
          endedAt: expect.anything(),
          status: expect.anything(),
        }),
      )
    })

    test("refuses the dial when a live control record still exists", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(strandedRow())
      mocks.getJson.mockResolvedValue({
        reservedUserId: "user-1",
        phase: "connected",
        deadlineAt: DEADLINE,
        fenceToken: "fence-1",
      })

      await expect(dial()).rejects.toThrow(CALL_IN_PROGRESS_RE)
      expect(mocks.recoverStrandedAccepted).not.toHaveBeenCalled()
    })

    test("still recovers when the leftover control is already terminated", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(strandedRow())
      mocks.getJson.mockResolvedValue({
        reservedUserId: "user-1",
        phase: "terminated",
        deadlineAt: DEADLINE,
        fenceToken: "fence-1",
      })
      mocks.recoverStrandedAccepted.mockResolvedValue({ id: "call-1" })

      await expect(dial()).resolves.toBeUndefined()
      expect(mocks.recoverStrandedAccepted).toHaveBeenCalled()
    })

    test("refuses the dial when a concurrent heartbeat wins: the row is still accepted", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(strandedRow())
      mocks.getJson.mockResolvedValue(null)
      mocks.recoverStrandedAccepted.mockResolvedValue(undefined)
      mocks.findById.mockResolvedValue(strandedRow())

      await expect(dial()).rejects.toThrow(CALL_IN_PROGRESS_RE)
      expect(mocks.findById).toHaveBeenCalledWith("call-1")
    })

    test("allows the dial when a real terminate won the race and left the row terminal", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(strandedRow())
      mocks.getJson.mockResolvedValue(null)
      mocks.recoverStrandedAccepted.mockResolvedValue(undefined)
      mocks.findById.mockResolvedValue(strandedRow({ status: "completed" }))

      await expect(dial()).resolves.toBeUndefined()
    })

    test("allows the dial when the row vanished entirely (retention purge)", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(strandedRow())
      mocks.getJson.mockResolvedValue(null)
      mocks.recoverStrandedAccepted.mockResolvedValue(undefined)
      mocks.findById.mockResolvedValue(undefined)

      await expect(dial()).resolves.toBeUndefined()
    })

    test("never recovers a ringing call — only accepted rows can be stranded", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(
        strandedRow({ status: "ringing" }),
      )

      await expect(dial()).rejects.toThrow(CALL_IN_PROGRESS_RE)
      expect(mocks.getJson).not.toHaveBeenCalled()
      expect(mocks.recoverStrandedAccepted).not.toHaveBeenCalled()
    })

    test("skips the Redis read for a row that never got a wacid", async () => {
      mocks.findActiveByContactInbox.mockResolvedValue(
        strandedRow({ wacid: null }),
      )
      mocks.recoverStrandedAccepted.mockResolvedValue({ id: "call-1" })

      await expect(dial()).resolves.toBeUndefined()
      expect(mocks.getJson).not.toHaveBeenCalled()
    })
  })
})

describe("whatsappVoipCallService.listResumableIncoming", () => {
  const callRow = (overrides: Record<string, unknown> = {}) => ({
    id: "call-1",
    wacid: "wacid.ABC",
    conversationId: "conv-1",
    contactInboxId: "ci-1",
    workspaceId: "ws-1",
    ...overrides,
  })

  const unclaimedControl = (
    overrides: Record<string, unknown> = {},
  ): {
    reservedUserId: string
    phase: "reserved"
    deadlineAt: number
    fenceToken: string
  } => ({
    reservedUserId: "",
    phase: "reserved" as const,
    deadlineAt: DEADLINE,
    fenceToken: "fence-1",
    ...overrides,
  })
  const offer = { sdp: "v=0...", deadlineAt: DEADLINE }

  test("returns the single unclaimed+offer-present ringing call, shaped for addIncoming, with the contact name resolved", async () => {
    mocks.findRingingByWorkspace.mockResolvedValue([callRow()])
    mocks.getJson.mockImplementation((key: string) =>
      key.startsWith("voip:ctrl:")
        ? Promise.resolve(unclaimedControl())
        : Promise.resolve(offer),
    )
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "c-9",
    })
    mocks.contactFindById.mockResolvedValue({ fullName: "Hung Phan" })

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(mocks.findRingingByWorkspace).toHaveBeenCalledWith("ws-1")
    expect(result).toEqual([
      {
        whatsappCallId: "call-1",
        wacid: "wacid.ABC",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contactName: "Hung Phan",
        offer: { sdpType: "offer", sdp: "v=0..." },
        deadlineAt: new Date(DEADLINE).toISOString(),
      },
    ])
  })

  test("returns every qualifying candidate, in the same order findRingingByWorkspace returned them", async () => {
    const rows = [
      callRow({ id: "call-1", wacid: "wacid.ONE" }),
      callRow({ id: "call-2", wacid: "wacid.TWO", contactInboxId: "ci-2" }),
      callRow({ id: "call-3", wacid: "wacid.THREE", contactInboxId: "ci-3" }),
    ]
    mocks.findRingingByWorkspace.mockResolvedValue(rows)
    mocks.getJson.mockImplementation((key: string) => {
      if (key.startsWith("voip:ctrl:")) {
        return Promise.resolve(unclaimedControl())
      }
      return Promise.resolve(offer)
    })
    mocks.contactInboxFindBy.mockResolvedValue(null)

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result.map((entry) => entry.whatsappCallId)).toEqual([
      "call-1",
      "call-2",
      "call-3",
    ])
    expect(result.map((entry) => entry.wacid)).toEqual([
      "wacid.ONE",
      "wacid.TWO",
      "wacid.THREE",
    ])
  })

  test("excludes only the row missing a control record; its siblings still qualify", async () => {
    const rows = [
      callRow({ id: "call-1", wacid: "wacid.ONE" }),
      callRow({ id: "call-2", wacid: "wacid.TWO" }),
      callRow({ id: "call-3", wacid: "wacid.THREE" }),
    ]
    mocks.findRingingByWorkspace.mockResolvedValue(rows)
    mocks.getJson.mockImplementation((key: string) => {
      if (key === "voip:ctrl:wacid.TWO") {
        return Promise.resolve(null)
      }
      if (key.startsWith("voip:ctrl:")) {
        return Promise.resolve(unclaimedControl())
      }
      return Promise.resolve(offer)
    })

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result.map((entry) => entry.whatsappCallId)).toEqual([
      "call-1",
      "call-3",
    ])
  })

  test('excludes only the row whose control has phase !== "reserved"; its siblings still qualify', async () => {
    const rows = [
      callRow({ id: "call-1", wacid: "wacid.ONE" }),
      callRow({ id: "call-2", wacid: "wacid.TWO" }),
      callRow({ id: "call-3", wacid: "wacid.THREE" }),
    ]
    mocks.findRingingByWorkspace.mockResolvedValue(rows)
    mocks.getJson.mockImplementation((key: string) => {
      if (key === "voip:ctrl:wacid.TWO") {
        return Promise.resolve(unclaimedControl({ phase: "answering" }))
      }
      if (key.startsWith("voip:ctrl:")) {
        return Promise.resolve(unclaimedControl())
      }
      return Promise.resolve(offer)
    })

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result.map((entry) => entry.whatsappCallId)).toEqual([
      "call-1",
      "call-3",
    ])
  })

  test('excludes only the row whose control is already claimed (reservedUserId !== ""); its siblings still qualify', async () => {
    const rows = [
      callRow({ id: "call-1", wacid: "wacid.ONE" }),
      callRow({ id: "call-2", wacid: "wacid.TWO" }),
      callRow({ id: "call-3", wacid: "wacid.THREE" }),
    ]
    mocks.findRingingByWorkspace.mockResolvedValue(rows)
    mocks.getJson.mockImplementation((key: string) => {
      if (key === "voip:ctrl:wacid.TWO") {
        return Promise.resolve(unclaimedControl({ reservedUserId: "agent-1" }))
      }
      if (key.startsWith("voip:ctrl:")) {
        return Promise.resolve(unclaimedControl())
      }
      return Promise.resolve(offer)
    })

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result.map((entry) => entry.whatsappCallId)).toEqual([
      "call-1",
      "call-3",
    ])
  })

  test("excludes only the row missing an offer; its siblings still qualify", async () => {
    const rows = [
      callRow({ id: "call-1", wacid: "wacid.ONE" }),
      callRow({ id: "call-2", wacid: "wacid.TWO" }),
      callRow({ id: "call-3", wacid: "wacid.THREE" }),
    ]
    mocks.findRingingByWorkspace.mockResolvedValue(rows)
    mocks.getJson.mockImplementation((key: string) => {
      if (key === "voip:offer:wacid.TWO") {
        return Promise.resolve(null)
      }
      if (key.startsWith("voip:ctrl:")) {
        return Promise.resolve(unclaimedControl())
      }
      return Promise.resolve(offer)
    })

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result.map((entry) => entry.whatsappCallId)).toEqual([
      "call-1",
      "call-3",
    ])
  })

  test("returns an empty array, not null, when no candidate qualifies", async () => {
    mocks.findRingingByWorkspace.mockResolvedValue([callRow()])
    mocks.getJson.mockResolvedValue(null)

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([])
  })

  test("returns an empty array, not null, when the workspace has no ringing calls", async () => {
    mocks.findRingingByWorkspace.mockResolvedValue([])

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([])
  })

  test("falls back to a null contact name when contact lookup fails", async () => {
    mocks.findRingingByWorkspace.mockResolvedValue([callRow()])
    mocks.getJson.mockImplementation((key: string) =>
      key.startsWith("voip:ctrl:")
        ? Promise.resolve(unclaimedControl())
        : Promise.resolve(offer),
    )
    mocks.contactInboxFindBy.mockRejectedValue(new Error("db unreachable"))

    const result = await whatsappVoipCallService.listResumableIncoming({
      workspaceId: "ws-1",
    })

    expect(result[0]?.contactName).toBeNull()
  })
})

describe("whatsappVoipCallService.finalizeEndedCall", () => {
  test("maps the call id and forwards every provided outcome field", async () => {
    const startedAt = new Date("2026-09-16T10:00:00.000Z")
    const endedAt = new Date("2026-09-16T10:01:30.000Z")
    mocks.finalizeById.mockResolvedValue({ id: "call-1", status: "completed" })

    await expect(
      whatsappVoipCallService.finalizeEndedCall({
        whatsappCallId: "call-1",
        status: "completed",
        startedAt,
        endedAt,
        durationSeconds: 90,
        messageId: "msg-1",
      }),
    ).resolves.toEqual({ id: "call-1", status: "completed" })
    expect(mocks.finalizeById).toHaveBeenCalledWith({
      id: "call-1",
      status: "completed",
      startedAt,
      endedAt,
      durationSeconds: 90,
      messageId: "msg-1",
    })
  })

  test("never adds an omitted field, so a set column is not cleared", async () => {
    mocks.finalizeById.mockResolvedValue(undefined)

    await expect(
      whatsappVoipCallService.finalizeEndedCall({
        whatsappCallId: "call-1",
        status: "failed",
        endedAt: new Date("2026-09-16T10:00:00.000Z"),
      }),
    ).resolves.toBeUndefined()
    const [finalization] = mocks.finalizeById.mock.calls[0]
    expect(finalization).not.toHaveProperty("lastError")
    expect(finalization).not.toHaveProperty("startedAt")
  })
})

describe("whatsappVoipCallService.attachMetaCallId", () => {
  test("resolves to the bound row", async () => {
    mocks.attachWacid.mockResolvedValue({ id: "call-1", wacid: "wacid.1" })

    await expect(
      whatsappVoipCallService.attachMetaCallId({
        whatsappCallId: "call-1",
        wacid: "wacid.1",
      }),
    ).resolves.toEqual({ id: "call-1", wacid: "wacid.1" })
    expect(mocks.attachWacid).toHaveBeenCalledWith({
      id: "call-1",
      wacid: "wacid.1",
    })
  })
})

describe("whatsappVoipCallService.isCallEnded", () => {
  test.each([
    ["ringing", false],
    ["accepted", false],
    ["completed", true],
    ["failed", true],
    ["rejected", true],
  ] as const)("%s -> %s", (status, expected) => {
    expect(whatsappVoipCallService.isCallEnded({ status })).toBe(expected)
  })
})

describe("whatsappVoipCallService.resolveEndOutcomeWithoutControl", () => {
  test.each([
    [
      "an outbound call still ringing is terminated as failed",
      { status: "ringing", direction: "businessInitiated" },
      {
        fromPhase: "dialing",
        graphAction: "terminate",
        terminalStatus: "failed",
      },
    ],
    [
      "an inbound call nobody answered is rejected",
      { status: "ringing", direction: "userInitiated" },
      {
        fromPhase: "reserved",
        graphAction: "reject",
        terminalStatus: "rejected",
      },
    ],
    [
      "a live call is terminated as completed",
      { status: "accepted", direction: "userInitiated" },
      {
        fromPhase: "accepted",
        graphAction: "terminate",
        terminalStatus: "completed",
      },
    ],
  ] as const)("%s", (_, call, expected) => {
    expect(
      whatsappVoipCallService.resolveEndOutcomeWithoutControl(call),
    ).toEqual(expected)
  })

  test.each([
    "completed",
    "failed",
    "rejected",
  ] as const)("is null for a %s row", (status) => {
    expect(
      whatsappVoipCallService.resolveEndOutcomeWithoutControl({
        status,
        direction: "businessInitiated",
      }),
    ).toBeNull()
  })
})
