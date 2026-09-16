import { beforeEach, describe, expect, test } from "vitest"
import {
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
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

describe("useWhatsappVoipCallStore", () => {
  beforeEach(() => {
    useWhatsappVoipCallStore.setState({ call: null })
  })

  test("addIncoming starts the call in incomingRinging with isMuted false", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call).toMatchObject({
      ...incomingData,
      transport: "voip",
      phase: WhatsappVoipCallPhase.incomingRinging,
      isMuted: false,
      isRecording: false,
    })
  })

  test("addIncoming does NOT replace a different in-progress call (would orphan its peer)", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-1", WhatsappVoipCallPhase.active)

    useWhatsappVoipCallStore.getState().addIncoming({
      ...incomingData,
      whatsappCallId: "call-2",
      wacid: "wacid-2",
    })

    // The active call is preserved; the second offer is dropped on this agent.
    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.whatsappCallId).toBe("call-1")
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
  })

  test("addIncoming for the SAME call id while still ringing is an idempotent refresh", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
  })

  test("addIncoming for the SAME call id does NOT reset the phase once it is in progress", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-1", WhatsappVoipCallPhase.active)

    // A late redelivery of the same call must not knock an active call back to
    // ringing (which would orphan its peer).
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
  })

  test("addIncoming accepts a new call once the previous slot is cleared", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore.getState().reset()

    useWhatsappVoipCallStore.getState().addIncoming({
      ...incomingData,
      whatsappCallId: "call-2",
      wacid: "wacid-2",
    })

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-2",
    )
  })

  test("setPhase transitions the matching call and ignores a mismatched id", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

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
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore
      .getState()
      .setPhase("call-1", WhatsappVoipCallPhase.answering)

    useWhatsappVoipCallStore.getState().markActive("call-1")

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.active)
    expect(typeof call?.startedAt).toBe("number")
  })

  test("markActive ignores a mismatched id and reports false", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    const result = useWhatsappVoipCallStore.getState().markActive("call-other")
    expect(result).toBe(false)
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
  })

  test("markActive reports true on success", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    const result = useWhatsappVoipCallStore.getState().markActive("call-1")
    expect(result).toBe(true)
  })

  test("markActive is a no-op (and reports false) against a call already in the terminal ended phase", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore.getState().handleEnded("call-1")

    const result = useWhatsappVoipCallStore.getState().markActive("call-1")

    expect(result).toBe(false)
    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.startedAt).toBeUndefined()
  })

  test("setMuted toggles isMuted on the current call", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore.getState().setMuted(true)
    expect(useWhatsappVoipCallStore.getState().call?.isMuted).toBe(true)
  })

  test("setRecording toggles isRecording on the current call", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore.getState().setRecording(true)
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(true)

    useWhatsappVoipCallStore.getState().setRecording(false)
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(false)
  })

  test("reset clears the call unconditionally", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore.getState().reset()
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("handleEnded ignores a mismatched id", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    useWhatsappVoipCallStore.getState().handleEnded("call-other")

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
  })

  test("handleEnded moves the matching call to the LINGERING ended phase (never a bare null)", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    useWhatsappVoipCallStore.getState().handleEnded("call-1", "rejected")

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call).not.toBeNull()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.endedStatus).toBe("rejected")
  })

  test("handleEnded defaults endedStatus to 'completed' when omitted", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    useWhatsappVoipCallStore.getState().handleEnded("call-1")

    expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
      "completed",
    )
  })

  test("addIncoming treats a lingering ended call as FREE and overwrites it with a new ring", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
    useWhatsappVoipCallStore.getState().handleEnded("call-1")

    useWhatsappVoipCallStore.getState().addIncoming({
      ...incomingData,
      whatsappCallId: "call-2",
      wacid: "wacid-2",
    })

    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.whatsappCallId).toBe("call-2")
    expect(call?.phase).toBe(WhatsappVoipCallPhase.incomingRinging)
  })
})

describe("useWhatsappVoipCallStore — preparing", () => {
  beforeEach(() => {
    useWhatsappVoipCallStore.setState({ call: null })
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
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    useWhatsappVoipCallStore.getState().startPreparing("nonce-1", preparingData)

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
  })

  test("startPreparing treats a lingering ended call as FREE and claims the slot", () => {
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)
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
      pendingOutboundAnswer: null,
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
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

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
    useWhatsappVoipCallStore.getState().addIncoming(incomingData)

    useWhatsappVoipCallStore.getState().setOutboundStatus("call-1", "ringing")

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.incomingRinging,
    )
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
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
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
    useWhatsappVoipCallStore.getState().addIncoming(ringA)

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
    useWhatsappVoipCallStore.getState().addIncoming(ringB)
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
    useWhatsappVoipCallStore.getState().addIncoming(ringB)
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
    useWhatsappVoipCallStore.getState().addIncoming(ringB)
    useWhatsappVoipCallStore.getState().enqueueRinging(ringA)

    useWhatsappVoipCallStore.getState().clearRinging()

    const { call, ringingCalls } = useWhatsappVoipCallStore.getState()
    expect(ringingCalls).toHaveLength(0)
    expect(call?.whatsappCallId).toBe("call-2")
  })
})
