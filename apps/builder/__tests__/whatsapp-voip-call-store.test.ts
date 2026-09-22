import { beforeEach, describe, expect, test } from "vitest"
import {
  PENDING_CONVERSATION_OPEN_MAX_AGE_MS,
  STICKY_ENDED_STATUSES,
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
  type WhatsappVoipIncomingData,
} from "@/features/integration-whatsapp/calling/voip/voip-call-store"

const incomingData = {
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer" as const, sdp: "v=0 offer" },
  deadlineAt: "2026-01-01T00:00:00.000Z",
}

/**
 * Seeds the slot with a ringing inbound call the way production does:
 * into the basket first, then promoted (`enqueueRinging` + `promoteRinging`).
 * Throws if promotion did not happen, so a test seeding against an
 * already-occupied slot fails loudly instead of silently asserting nothing.
 */
const seedRingingSlot = (data: WhatsappVoipIncomingData) => {
  const store = useWhatsappVoipCallStore.getState()
  store.enqueueRinging(data)
  const promoted = store.promoteRinging(data.whatsappCallId)
  if (!promoted) {
    throw new Error(
      `seedRingingSlot: promoteRinging failed for "${data.whatsappCallId}" — the slot was already occupied`,
    )
  }
}

describe("useWhatsappVoipCallStore", () => {
  beforeEach(() => {
    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingConversationOpen: null,
    })
  })

  test("setPhase transitions the matching call and ignores a mismatched id", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-other", WhatsappVoipCallPhase.answering)
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )

    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-1", WhatsappVoipCallPhase.answering)
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.answering,
    )
  })

  test("markActive sets phase active and stamps startedAt", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-1", WhatsappVoipCallPhase.answering)

    useWhatsappVoipCallStore.getState().markActive("call-1")

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
    expect(typeof call?.startedAt).toBe("number")
  })

  test("markActive ignores a mismatched id and reports false", () => {
    seedRingingSlot(incomingData)
    const result = useWhatsappVoipCallStore.getState().markActive("call-other")
    expect(result).toBe(false)
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
  })

  test("markActive reports true on success", () => {
    seedRingingSlot(incomingData)
    const result = useWhatsappVoipCallStore.getState().markActive("call-1")
    expect(result).toBe(true)
  })

  test("markActive is a no-op (and reports false) against a call already in the terminal ended phase", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore.getState().handleEnded("call-1")

    const result = useWhatsappVoipCallStore.getState().markActive("call-1")

    expect(result).toBe(false)
    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.startedAt).toBeUndefined()
  })

  test("setMuted toggles isMuted on the current call", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore.getState().setMuted(true)
    expect(useWhatsappVoipCallStore.getState().call?.isMuted).toBe(true)
  })

  test("setRecording toggles isRecording on the current call", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore.getState().setRecording(true)
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(true)

    useWhatsappVoipCallStore.getState().setRecording(false)
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(false)
  })

  test("reset clears the call unconditionally", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore.getState().reset()
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("handleEnded ignores a mismatched id", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore.getState().handleEnded("call-other")

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
  })

  test("handleEnded moves the matching call to the LINGERING ended phase (never a bare null)", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore.getState().handleEnded("call-1", "rejected")

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call).not.toBeNull()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.endedStatus).toBe("rejected")
  })

  test("handleEnded keeps the server's own reason alongside the status", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore
      .getState()
      .handleEnded("call-1", "answerFailed", "Access denied")

    const call = useWhatsappVoipCallStore.getState().call
    expect(call?.endedStatus).toBe("answerFailed")
    expect(call?.endedMessage).toBe("Access denied")
  })

  test("only answer failures are sticky - normal endings keep the short linger", () => {
    for (const status of [
      "cannotAnswer",
      "callEnded",
      "micPermissionDenied",
      "micNotFound",
      "answerFailed",
    ] as const) {
      expect(STICKY_ENDED_STATUSES.has(status)).toBe(true)
    }
    for (const status of [
      "completed",
      "rejected",
      "failed",
      "connectionLost",
    ] as const) {
      expect(STICKY_ENDED_STATUSES.has(status)).toBe(false)
    }
  })

  test("handleEnded defaults endedStatus to 'completed' when omitted", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore.getState().handleEnded("call-1")

    expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
      "completed",
    )
  })
})

describe("useWhatsappVoipCallStore — preparing", () => {
  beforeEach(() => {
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
  })

  const preparingData = {
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    contactName: "Ada Lovelace",
  }

  test("startPreparing claims the slot instantly, keyed by the nonce", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call).toMatchObject({
      whatsappCallId: "nonce-1",
      attemptId: "nonce-1",
      phase: WhatsappVoipCallPhase.preparing,
      direction: "outbound",
      isMuted: false,
      isRecording: false,
      ...preparingData,
    })
  })

  test("startPreparing is a no-op while the slot is already occupied", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
  })

  test("startPreparing treats a lingering ended call as FREE and claims the slot", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore.getState().handleEnded("call-1")

    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "nonce-1",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.preparing,
    )
  })

  test("setPreparingStage updates the stage only for the matching preparing nonce", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    useWhatsappVoipCallStore.getState().setPreparingStage("nonce-other", "mic")
    expect(
      useWhatsappVoipCallStore.getState().call?.preparingStage,
    ).toBeUndefined()

    useWhatsappVoipCallStore.getState().setPreparingStage("nonce-1", "mic")
    expect(useWhatsappVoipCallStore.getState().call?.preparingStage).toBe("mic")
  })

  test("upgradeToDialing transitions the matching preparing nonce to outboundDialing", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    useWhatsappVoipCallStore.getState().upgradeToDialing("nonce-1", {
      whatsappCallId: "out-call-1",
      wacid: "out-wacid-1",
      attemptId: "attempt-1",
      ...preparingData,
      deadlineAt: "2026-01-01T00:00:00.000Z",
      browserRecordingEnabled: false,
      recordingRequested: false,
    })

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.whatsappCallId).toBe("out-call-1")
    expect(call?.phase).toBe(WhatsappVoipCallPhase.outboundDialing)
    expect(call?.direction).toBe("outbound")
  })

  test("upgradeToDialing is a no-op once the preparing slot was released/cancelled", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)
    useWhatsappVoipCallStore.getState().releasePreparing("nonce-1")

    useWhatsappVoipCallStore.getState().upgradeToDialing("nonce-1", {
      whatsappCallId: "out-call-1",
      wacid: "out-wacid-1",
      attemptId: "attempt-1",
      ...preparingData,
      deadlineAt: "2026-01-01T00:00:00.000Z",
      browserRecordingEnabled: false,
      recordingRequested: false,
    })

    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("upgradeToDialing is a no-op for a mismatched nonce", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    useWhatsappVoipCallStore.getState().upgradeToDialing("nonce-other", {
      whatsappCallId: "out-call-1",
      wacid: "out-wacid-1",
      attemptId: "attempt-1",
      ...preparingData,
      deadlineAt: "2026-01-01T00:00:00.000Z",
      browserRecordingEnabled: false,
      recordingRequested: false,
    })

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.preparing,
    )
  })

  test("releasePreparing clears the slot only for the matching preparing nonce", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    useWhatsappVoipCallStore.getState().releasePreparing("nonce-other")
    expect(useWhatsappVoipCallStore.getState().call).not.toBeNull()

    useWhatsappVoipCallStore.getState().releasePreparing("nonce-1")
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("releasePreparing never clears a call that has already been upgraded past preparing", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)
    useWhatsappVoipCallStore.getState().upgradeToDialing("nonce-1", {
      whatsappCallId: "out-call-1",
      wacid: "out-wacid-1",
      attemptId: "attempt-1",
      ...preparingData,
      deadlineAt: "2026-01-01T00:00:00.000Z",
      browserRecordingEnabled: false,
      recordingRequested: false,
    })

    useWhatsappVoipCallStore.getState().releasePreparing("nonce-1")

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "out-call-1",
    )
  })
})

const outboundData = {
  whatsappCallId: "out-call-1",
  wacid: "out-wacid-1",
  attemptId: "attempt-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  deadlineAt: "2026-01-01T00:00:00.000Z",
  browserRecordingEnabled: false,
  recordingRequested: true,
}

describe("useWhatsappVoipCallStore — outbound", () => {
  beforeEach(() => {
    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingOutboundAnswer: null,
      pendingOutboundStatus: null,
    })
  })

  test("addOutbound starts the call in outboundDialing with direction outbound, isRecording from recordingRequested", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call).toMatchObject({
      ...outboundData,
      transport: "voip",
      direction: "outbound",
      phase: WhatsappVoipCallPhase.outboundDialing,
      isMuted: false,
      isRecording: true,
    })
  })

  test("addOutbound is a no-op when the slot is already occupied (mutual exclusion with inbound)", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore.getState().addOutbound(outboundData)

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.whatsappCallId).toBe("call-1")
    expect(call?.direction).toBe("inbound")
  })

  test("addOutbound treats a lingering ended call as FREE and overwrites it", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)
    useWhatsappVoipCallStore.getState().handleEnded("out-call-1")

    useWhatsappVoipCallStore.getState().addOutbound({
      ...outboundData,
      whatsappCallId: "out-call-2",
      wacid: "out-wacid-2",
      attemptId: "attempt-2",
    })

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "out-call-2",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.outboundDialing,
    )
  })

  test("addOutbound is a no-op when another outbound call is already dialing", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)

    useWhatsappVoipCallStore.getState().addOutbound({
      ...outboundData,
      whatsappCallId: "out-call-2",
      wacid: "out-wacid-2",
      attemptId: "attempt-2",
    })

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "out-call-1",
    )
  })

  test("setOutboundStatus('ringing') moves outboundDialing to outboundRinging", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "ringing")

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.outboundRinging,
    )
  })

  test("setOutboundStatus('accepted') moves to active and stamps startedAt", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)
    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "ringing")

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "accepted")

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
    expect(typeof call?.startedAt).toBe("number")
  })

  test("setOutboundStatus ignores a mismatched call id", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-other", "ringing")

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.outboundDialing,
    )
  })

  test("setOutboundStatus ignores an inbound call in the slot (direction guard)", () => {
    seedRingingSlot(incomingData)

    useWhatsappVoipCallStore.getState().setOutboundStatus("call-1", "ringing")

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
  })

  // Ordering guards on setOutboundStatus: Meta does not order these events,
  // so a delayed status must never regress an active call or resurrect an
  // ended one.

  test("a normal outboundDialing -> outboundRinging -> active progression still works", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.outboundDialing,
    )

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "ringing")
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.outboundRinging,
    )

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "accepted")
    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
    expect(typeof call?.startedAt).toBe("number")
  })

  test("a 'ringing' status arriving AFTER the call is already active does not regress it to outboundRinging", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)
    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "accepted")
    const activeStartedAt = useWhatsappVoipCallStore.getState().call?.startedAt

    // A late RINGING for the same call, arriving after ACCEPTED already
    // landed — must be ignored, or the deadline backstop could hang up a
    // live, mid-conversation call.
    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "ringing")

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
    expect(call?.startedAt).toBe(activeStartedAt)
  })

  test("any status arriving after the call reached ended is ignored (no phantom resurrection)", () => {
    useWhatsappVoipCallStore.getState().addOutbound(outboundData)
    useWhatsappVoipCallStore.getState().handleEnded("out-call-1", "completed")

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "accepted")

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.startedAt).toBeUndefined()
  })

  // Buffered early ACCEPTED/RINGING: while an outbound dial is `preparing`,
  // the slot holds the client nonce rather than the real server id, so a
  // status Meta emits before `initiateOutboundVoipCallAction` returns has
  // nowhere to land — `setOutboundStatus` buffers it into
  // `pendingOutboundStatus`, and `upgradeToDialing` applies it.

  test("a buffered ACCEPTED for an id the slot does not hold yet lands the call directly in active once upgradeToDialing runs", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", {
      conversationId: outboundData.conversationId,
      contactInboxId: outboundData.contactInboxId,
      contactName: outboundData.contactName,
    })

    // Meta's ACCEPTED arrives before the initiate action resolves — the slot
    // still holds the nonce, not "out-call-1".
    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "accepted")
    expect(useWhatsappVoipCallStore.getState().pendingOutboundStatus).toEqual({
      whatsappCallId: "out-call-1",
      status: "accepted",
    })
    // The still-preparing slot itself must be untouched.
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.preparing,
    )

    useWhatsappVoipCallStore
      .getState()
      .upgradeToDialing("nonce-1", outboundData)

    const { call, pendingOutboundStatus } = useWhatsappVoipCallStore.getState()
    expect(call?.whatsappCallId).toBe("out-call-1")
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
    expect(typeof call?.startedAt).toBe("number")
    expect(pendingOutboundStatus).toBeNull()
  })

  test("a buffered RINGING for an id the slot does not hold yet lands the call in outboundRinging once upgradeToDialing runs", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", {
      conversationId: outboundData.conversationId,
      contactInboxId: outboundData.contactInboxId,
      contactName: outboundData.contactName,
    })

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "ringing")

    useWhatsappVoipCallStore
      .getState()
      .upgradeToDialing("nonce-1", outboundData)

    const { call, pendingOutboundStatus } = useWhatsappVoipCallStore.getState()
    expect(call?.whatsappCallId).toBe("out-call-1")
    expect(call?.phase).toBe(WhatsappVoipCallPhase.outboundRinging)
    expect(call?.startedAt).toBeUndefined()
    expect(pendingOutboundStatus).toBeNull()
  })

  test("a buffered accepted is NOT downgraded by a later ringing for the same not-yet-slotted id", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", {
      conversationId: outboundData.conversationId,
      contactInboxId: outboundData.contactInboxId,
      contactName: outboundData.contactName,
    })

    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "accepted")
    // Meta does not order these — a later RINGING for the same id must not
    // overwrite the buffered ACCEPTED.
    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-1", "ringing")

    expect(useWhatsappVoipCallStore.getState().pendingOutboundStatus).toEqual({
      whatsappCallId: "out-call-1",
      status: "accepted",
    })

    useWhatsappVoipCallStore
      .getState()
      .upgradeToDialing("nonce-1", outboundData)

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
  })

  test("with no buffered status, upgradeToDialing still lands in outboundDialing exactly as before", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", {
      conversationId: outboundData.conversationId,
      contactInboxId: outboundData.contactInboxId,
      contactName: outboundData.contactName,
    })

    useWhatsappVoipCallStore
      .getState()
      .upgradeToDialing("nonce-1", outboundData)

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.outboundDialing)
    expect(call?.startedAt).toBeUndefined()
  })

  test("a buffered status for a DIFFERENT id does not leak into this call", () => {
    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", {
      conversationId: outboundData.conversationId,
      contactInboxId: outboundData.contactInboxId,
      contactName: outboundData.contactName,
    })

    // Buffered for a call that will never be this attempt's real id.
    useWhatsappVoipCallStore
      .getState()
      .setOutboundStatus("out-call-other", "accepted")

    useWhatsappVoipCallStore
      .getState()
      .upgradeToDialing("nonce-1", outboundData)

    const { call, pendingOutboundStatus } = useWhatsappVoipCallStore.getState()
    // Unrelated buffered status must not apply to this call, and must
    // survive untouched for whichever call it actually belongs to.
    expect(call?.whatsappCallId).toBe("out-call-1")
    expect(call?.phase).toBe(WhatsappVoipCallPhase.outboundDialing)
    expect(call?.startedAt).toBeUndefined()
    expect(pendingOutboundStatus).toEqual({
      whatsappCallId: "out-call-other",
      status: "accepted",
    })
  })

  test("setPendingOutboundAnswer / clearPendingOutboundAnswer are immutable and independent of call", () => {
    useWhatsappVoipCallStore.getState().setPendingOutboundAnswer({
      whatsappCallId: "out-call-1",
      sdp: "v=0 answer",
    })

    expect(useWhatsappVoipCallStore.getState().pendingOutboundAnswer).toEqual({
      whatsappCallId: "out-call-1",
      sdp: "v=0 answer",
    })

    useWhatsappVoipCallStore.getState().clearPendingOutboundAnswer()

    expect(useWhatsappVoipCallStore.getState().pendingOutboundAnswer).toBeNull()
  })
})

describe("useWhatsappVoipCallStore — ringing basket", () => {
  beforeEach(() => {
    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingConversationOpen: null,
    })
  })

  const ringA = incomingData
  const ringB = {
    ...incomingData,
    whatsappCallId: "call-2",
    wacid: "wacid-2",
    contactName: "Grace Hopper",
  }

  test("enqueueRinging appends distinct rings in arrival order", () => {
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)
    useWhatsappVoipCallStore.getState().enqueueRinging(ringB)

    const { ringingCalls } = useWhatsappVoipCallStore.getState()
    expect(ringingCalls.map((ringing) => ringing.whatsappCallId)).toEqual([
      "call-1",
      "call-2",
    ])
    expect(ringingCalls[0]).toMatchObject(ringA)
  })

  test("enqueueRinging is idempotent against a redelivered offer for an id already in the basket", () => {
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(1)
  })

  test("enqueueRinging is a no-op for an id already occupying the call slot", () => {
    seedRingingSlot(ringA)

    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(0)
  })

  test("removeRinging drops only the matching entry", () => {
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)
    useWhatsappVoipCallStore.getState().enqueueRinging(ringB)

    useWhatsappVoipCallStore.getState().removeRinging("call-1")

    const { ringingCalls } = useWhatsappVoipCallStore.getState()
    expect(ringingCalls.map((ringing) => ringing.whatsappCallId)).toEqual([
      "call-2",
    ])
  })

  test("removeRinging is a no-op when the id is absent", () => {
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    useWhatsappVoipCallStore.getState().removeRinging("call-missing")

    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(1)
  })

  // `conversationAssigned` drops every basket entry for a reassigned
  // conversation in one store update.
  test("dismissRinging stops a ringing slot and its basket entry", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore.getState().enqueueRinging({
      ...incomingData,
      whatsappCallId: "call-2",
    })

    useWhatsappVoipCallStore.getState().dismissRinging("call-1")
    useWhatsappVoipCallStore.getState().dismissRinging("call-2")

    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
    expect(useWhatsappVoipCallStore.getState().ringingCalls).toEqual([])
  })

  test("dismissRinging leaves the tab that is answering alone", () => {
    seedRingingSlot(incomingData)
    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-1", WhatsappVoipCallPhase.answering)

    useWhatsappVoipCallStore.getState().dismissRinging("call-1")

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.answering,
    )
  })

  test("dismissRinging is a no-op for a call this tab does not hold", () => {
    seedRingingSlot(incomingData)
    const before = useWhatsappVoipCallStore.getState()

    useWhatsappVoipCallStore.getState().dismissRinging("call-missing")

    expect(useWhatsappVoipCallStore.getState()).toBe(before)
  })

  test("removeRingingByConversationIds drops every entry for the given conversation ids in one update", () => {
    const ringC = {
      ...incomingData,
      whatsappCallId: "call-3",
      wacid: "wacid-3",
      conversationId: "conversation-2",
    }
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA) // conversation-1
    useWhatsappVoipCallStore.getState().enqueueRinging(ringB) // conversation-1
    useWhatsappVoipCallStore.getState().enqueueRinging(ringC) // conversation-2

    useWhatsappVoipCallStore
      .getState()
      .removeRingingByConversationIds(["conversation-1"])

    const { ringingCalls } = useWhatsappVoipCallStore.getState()
    expect(ringingCalls.map((ringing) => ringing.whatsappCallId)).toEqual([
      "call-3",
    ])
  })

  test("removeRingingByConversationIds is a no-op when none of the ids match", () => {
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)
    useWhatsappVoipCallStore.getState().enqueueRinging(ringB)

    useWhatsappVoipCallStore
      .getState()
      .removeRingingByConversationIds(["conversation-missing"])

    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(2)
  })

  test("promoteRinging on a free slot moves the entry into the call slot at incomingRinging and drops it from the basket", () => {
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    const result = useWhatsappVoipCallStore.getState().promoteRinging("call-1")

    expect(result).toBe(true)
    const { call, ringingCalls } = useWhatsappVoipCallStore.getState()
    expect(call).toMatchObject({
      ...ringA,
      transport: "voip",
      direction: "inbound",
      phase: WhatsappVoipCallPhase.incomingRinging,
      isMuted: false,
      isRecording: false,
    })
    expect(ringingCalls).toHaveLength(0)
  })

  test("promoteRinging is rejected while the slot holds an active call, leaving the slot and basket untouched", () => {
    seedRingingSlot(ringB)
    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-2", WhatsappVoipCallPhase.active)
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    const result = useWhatsappVoipCallStore.getState().promoteRinging("call-1")

    expect(result).toBe(false)
    const { call, ringingCalls } = useWhatsappVoipCallStore.getState()
    expect(call?.whatsappCallId).toBe("call-2")
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
    expect(ringingCalls.map((ringing) => ringing.whatsappCallId)).toEqual([
      "call-1",
    ])
  })

  test("promoteRinging succeeds over a lingering ended call (a free slot)", () => {
    seedRingingSlot(ringB)
    useWhatsappVoipCallStore.getState().handleEnded("call-2")
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    const result = useWhatsappVoipCallStore.getState().promoteRinging("call-1")

    expect(result).toBe(true)
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
  })

  test("promoteRinging returns false for an id that is not in the basket", () => {
    const result = useWhatsappVoipCallStore
      .getState()
      .promoteRinging("call-missing")

    expect(result).toBe(false)
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("clearRinging empties the basket and leaves the call slot alone", () => {
    seedRingingSlot(ringB)
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    useWhatsappVoipCallStore.getState().clearRinging()

    const { call, ringingCalls } = useWhatsappVoipCallStore.getState()
    expect(ringingCalls).toHaveLength(0)
    expect(call?.whatsappCallId).toBe("call-2")
  })

  describe("pendingConversationOpen — cross-boundary bridge to the chat store", () => {
    test("starts null", () => {
      expect(
        useWhatsappVoipCallStore.getState().pendingConversationOpen,
      ).toBeNull()
    })

    test("setPendingConversationOpen stores the requested conversation id, stamped with requestedAt", () => {
      const before = Date.now()
      useWhatsappVoipCallStore
        .getState()
        .setPendingConversationOpen("conversation-9")
      const after = Date.now()

      const pending =
        useWhatsappVoipCallStore.getState().pendingConversationOpen
      expect(pending?.conversationId).toBe("conversation-9")
      expect(pending?.requestedAt).toBeGreaterThanOrEqual(before)
      expect(pending?.requestedAt).toBeLessThanOrEqual(after)
    })

    test("consumePendingConversationOpen returns null and clears when nothing is pending", () => {
      const result = useWhatsappVoipCallStore
        .getState()
        .consumePendingConversationOpen()

      expect(result).toBeNull()
      expect(
        useWhatsappVoipCallStore.getState().pendingConversationOpen,
      ).toBeNull()
    })

    test("consumePendingConversationOpen returns the id and clears it when fresh", () => {
      useWhatsappVoipCallStore
        .getState()
        .setPendingConversationOpen("conversation-9")

      const result = useWhatsappVoipCallStore
        .getState()
        .consumePendingConversationOpen()

      expect(result).toBe("conversation-9")
      expect(
        useWhatsappVoipCallStore.getState().pendingConversationOpen,
      ).toBeNull()
    })

    test("consumePendingConversationOpen drops (returns null for) a stale request — never reopens much later", () => {
      const requestedAt = 1_000_000
      useWhatsappVoipCallStore.setState({
        pendingConversationOpen: {
          conversationId: "conversation-stale",
          requestedAt,
        },
      })

      const result = useWhatsappVoipCallStore
        .getState()
        .consumePendingConversationOpen(
          requestedAt + PENDING_CONVERSATION_OPEN_MAX_AGE_MS + 1,
        )

      expect(result).toBeNull()
      expect(
        useWhatsappVoipCallStore.getState().pendingConversationOpen,
      ).toBeNull()
    })

    test("consumePendingConversationOpen keeps a request exactly at the age boundary", () => {
      const requestedAt = 1_000_000
      useWhatsappVoipCallStore.setState({
        pendingConversationOpen: {
          conversationId: "conversation-boundary",
          requestedAt,
        },
      })

      const result = useWhatsappVoipCallStore
        .getState()
        .consumePendingConversationOpen(
          requestedAt + PENDING_CONVERSATION_OPEN_MAX_AGE_MS,
        )

      expect(result).toBe("conversation-boundary")
    })
  })
})
