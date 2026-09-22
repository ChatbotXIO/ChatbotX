import { DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { UseWhatsappVoipCallResult } from "@/features/integration-whatsapp/calling/voip/use-whatsapp-voip-call"
import { useWhatsappVoipCall } from "@/features/integration-whatsapp/calling/voip/use-whatsapp-voip-call"
import {
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
  type WhatsappVoipIncomingData,
} from "@/features/integration-whatsapp/calling/voip/voip-call-store"

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }))
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

const {
  answerActionMock,
  hangupActionMock,
  turnCredentialsActionMock,
  pendingIncomingActionMock,
  startCallRecorderMock,
  initiateOutboundActionMock,
  outboundTurnCredentialsActionMock,
  heartbeatActiveVoipCallActionMock,
} = vi.hoisted(() => ({
  answerActionMock: vi.fn(),
  hangupActionMock: vi.fn().mockResolvedValue({ data: { hungUp: true } }),
  turnCredentialsActionMock: vi.fn().mockResolvedValue({
    data: {
      iceServers: [{ urls: "stun:stun.example.com" }],
      turnConfigured: true,
    },
  }),
  pendingIncomingActionMock: vi.fn().mockResolvedValue({ data: null }),
  startCallRecorderMock: vi.fn(),
  initiateOutboundActionMock: vi.fn(),
  outboundTurnCredentialsActionMock: vi.fn().mockResolvedValue({
    data: {
      iceServers: [{ urls: "stun:stun.example.com" }],
      turnConfigured: true,
    },
  }),
  heartbeatActiveVoipCallActionMock: vi
    .fn()
    .mockResolvedValue({ data: { ok: true } }),
}))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/answer-voip-call.action",
  () => ({ answerWhatsappVoipCallAction: answerActionMock }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/actions/hangup-voip-call.action",
  () => ({ hangupWhatsappVoipCallAction: hangupActionMock }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/actions/voip-turn-credentials.action",
  () => ({ getWhatsappVoipTurnCredentialsAction: turnCredentialsActionMock }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/actions/get-pending-incoming-voip-call.action",
  () => ({ getPendingIncomingVoipCallAction: pendingIncomingActionMock }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/actions/initiate-outbound-voip-call.action",
  () => ({ initiateOutboundVoipCallAction: initiateOutboundActionMock }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/actions/outbound-voip-turn-credentials.action",
  () => ({
    outboundVoipTurnCredentialsAction: outboundTurnCredentialsActionMock,
  }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/actions/heartbeat-active-voip-call.action",
  () => ({
    heartbeatActiveVoipCallAction: heartbeatActiveVoipCallActionMock,
  }),
)
vi.mock("@/features/integration-whatsapp/calling/voip/call-recorder", () => ({
  startCallRecorder: startCallRecorderMock,
}))

type MockTrack = { stop: ReturnType<typeof vi.fn>; enabled: boolean }

const makeMockStream = () => {
  const track: MockTrack = { stop: vi.fn(), enabled: true }
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream
}

type MockSender = {
  track: MockTrack | null
  replaceTrack: ReturnType<typeof vi.fn>
}
type MockTransceiver = { sender: MockSender }

/** What the mock peer connection emits, mirroring real Chrome's direction rule. */
const mockSdp = (_kind: "answer" | "offer", canSendAudio: boolean) =>
  `v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=${canSendAudio ? "sendrecv" : "recvonly"}\r\n`

const ANSWER_SDP = mockSdp("answer", true)
const OFFER_SDP = mockSdp("offer", true)

const createdPeerConnections: Array<{
  iceGatheringState: string
  connectionState: string
  localDescription: RTCSessionDescriptionInit | null
  addTrack: ReturnType<typeof vi.fn>
  addTransceiver: ReturnType<typeof vi.fn>
  addTrackSenders: MockSender[]
  setRemoteDescription: ReturnType<typeof vi.fn>
  createAnswer: ReturnType<typeof vi.fn>
  createOffer: ReturnType<typeof vi.fn>
  setLocalDescription: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  ontrack: ((event: unknown) => void) | null
  onconnectionstatechange: (() => void) | null
}> = []

class MockRTCPeerConnection {
  iceGatheringState = "complete"
  connectionState = "new"
  localDescription: RTCSessionDescriptionInit | null = null
  ontrack: ((event: unknown) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  /**
   * Senders created by `addTrack`. Kept apart from the ones `addTransceiver`
   * makes, because on the ANSWERING side only these decide the negotiated
   * direction — see `createAnswer` below.
   */
  addTrackSenders: MockSender[] = []

  addTrack = vi.fn((track: MockTrack | null): MockSender => {
    const sender: MockSender = {
      track,
      replaceTrack: vi.fn(function replaceTrack(
        this: MockSender,
        next: MockTrack | null,
      ) {
        this.track = next
        return Promise.resolve()
      }),
    }
    this.addTrackSenders.push(sender)
    return sender
  })

  /** Returns a fake `RTCRtpTransceiver` whose `sender.track` starts `null`. */
  addTransceiver = vi.fn((): MockTransceiver => {
    const sender: MockSender = {
      track: null,
      replaceTrack: vi.fn(function replaceTrack(
        this: MockSender,
        track: MockTrack | null,
      ) {
        this.track = track
        return Promise.resolve()
      }),
    }
    return { sender }
  })

  setRemoteDescription = vi.fn().mockResolvedValue(undefined)

  /**
   * Real Chrome behaviour, verified against Chrome directly: when ANSWERING,
   * Chrome does not reuse a `sendrecv` transceiver from `addTransceiver` for
   * the remote offer's m-line — it makes a second, `recvonly` one instead.
   * The answer can only promise to send audio when a track was attached with
   * `addTrack` BEFORE `createAnswer`.
   */
  createAnswer = vi.fn(() => {
    const canSend = this.addTrackSenders.some((sender) => sender.track !== null)
    return Promise.resolve({
      type: "answer",
      sdp: mockSdp("answer", canSend),
    })
  })

  /**
   * Offering is laxer in real Chrome — a track-less `addTransceiver` still
   * yields `sendrecv` there — but the app deliberately does not rely on that.
   * It attaches the mic with `addTrack` before building the offer, so a
   * lost ACCEPTED event can never leave the sender track-less on a live call.
   * The mock holds the app to that stricter rule.
   */
  createOffer = vi.fn(() => {
    const canSend = this.addTrackSenders.some((sender) => sender.track !== null)
    return Promise.resolve({
      type: "offer",
      sdp: mockSdp("offer", canSend),
    })
  })
  setLocalDescription = vi.fn().mockImplementation((desc) => {
    this.localDescription = desc
    return Promise.resolve()
  })
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()

  constructor() {
    createdPeerConnections.push(this)
  }
}

const getUserMediaMock = vi.fn().mockResolvedValue(makeMockStream())

const incomingData = {
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer" as const, sdp: "v=0 offer" },
  // Must stay in the future relative to the real clock: the client-side
  // deadline-backstop effect arms a real `setTimeout` off this value while
  // `phase === incomingRinging` and clears the store the instant it lapses.
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
}

/**
 * Seeds the slot with a ringing inbound call, the way production does it:
 * into the basket first, then promoted. Throws if promotion did not
 * actually happen, so a test that seeds against an already-occupied slot
 * fails loudly instead of silently asserting against an unchanged slot.
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

let hookResult: UseWhatsappVoipCallResult | null = null

describe("useWhatsappVoipCall", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    createdPeerConnections.length = 0
    vi.clearAllMocks()
    getUserMediaMock.mockResolvedValue(makeMockStream())
    turnCredentialsActionMock.mockResolvedValue({
      data: {
        iceServers: [{ urls: "stun:stun.example.com" }],
        turnConfigured: true,
      },
    })
    pendingIncomingActionMock.mockResolvedValue({ data: null })
    startCallRecorderMock.mockReturnValue({ stop: vi.fn() })
    initiateOutboundActionMock.mockReset()
    outboundTurnCredentialsActionMock.mockResolvedValue({
      data: {
        iceServers: [{ urls: "stun:stun.example.com" }],
        turnConfigured: true,
      },
    })
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection)
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: { getUserMedia: getUserMediaMock },
      sendBeacon: vi.fn(),
    })

    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingOutboundAnswer: null,
    })
    hookResult = null

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  function TestHarness() {
    hookResult = useWhatsappVoipCall()
    return null
  }

  const render = () =>
    act(() => {
      root.render(<TestHarness />)
    })

  test("answer() gathers a peer connection, answers, and marks the call active on accepted", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.answer()
    })

    expect(turnCredentialsActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    expect(createdPeerConnections).toHaveLength(1)
    expect(
      createdPeerConnections[0]?.setRemoteDescription,
    ).toHaveBeenCalledWith({ type: "offer", sdp: "v=0 offer" })
    expect(answerActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
      sdpAnswer: ANSWER_SDP,
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
  })

  test("unmounting the provider while a call is ACCEPTED/active tears down the peer connection and stops the mic tracks", async () => {
    const stream = makeMockStream()
    getUserMediaMock.mockResolvedValue(stream)
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.answer()
    })

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
    expect(createdPeerConnections[0]?.close).not.toHaveBeenCalled()
    const track = stream.getTracks()[0] as unknown as MockTrack
    expect(track.stop).not.toHaveBeenCalled()

    act(() => {
      root.unmount()
    })

    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalled()
  })

  /**
   * Every way answering can fail must end on screen with a reason, never by
   * clearing the slot — a ring that simply vanishes tells the agent nothing.
   */
  const answerAndReadEndedCall = async () => {
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })
    return useWhatsappVoipCallStore.getState().call
  }

  test.each([
    ["cannotAnswer", "cannotAnswer"],
    ["callEnded", "callEnded"],
  ])("a %s answer outcome tears down and says why instead of clearing the panel", async (outcome, endedStatus) => {
    answerActionMock.mockResolvedValue({ data: { outcome } })

    const call = await answerAndReadEndedCall()

    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.endedStatus).toBe(endedStatus)
  })

  test.each([
    ["NotFoundError", "micNotFound"],
    ["NotAllowedError", "micPermissionDenied"],
  ])("a microphone %s names the device problem and never reaches the answer action", async (errorName, endedStatus) => {
    getUserMediaMock.mockRejectedValue(new DOMException("mic", errorName))

    const call = await answerAndReadEndedCall()

    expect(answerActionMock).not.toHaveBeenCalled()
    expect(call?.endedStatus).toBe(endedStatus)
  })

  test("an unrecognised microphone failure points the agent at their device", async () => {
    getUserMediaMock.mockRejectedValue(new Error("device busy"))

    const call = await answerAndReadEndedCall()

    expect(answerActionMock).not.toHaveBeenCalled()
    expect(call?.endedStatus).toBe("answerFailed")
  })

  test("a specific reason from the TURN step is shown to the agent verbatim", async () => {
    turnCredentialsActionMock.mockResolvedValue({
      serverError: "This call was answered by another agent",
    })

    const call = await answerAndReadEndedCall()

    expect(getUserMediaMock).not.toHaveBeenCalled()
    expect(call?.endedStatus).toBe("answerFailed")
    expect(call?.endedMessage).toBe("This call was answered by another agent")
  })

  test("the generic server error is replaced by the check-your-microphone sentence", async () => {
    turnCredentialsActionMock.mockResolvedValue({
      serverError: DEFAULT_SERVER_ERROR_MESSAGE,
    })

    const call = await answerAndReadEndedCall()

    expect(call?.endedStatus).toBe("answerFailed")
    expect(call?.endedMessage).toBeUndefined()
  })

  test("an answer action that returns no data shows its specific reason", async () => {
    answerActionMock.mockResolvedValue({ serverError: "Access denied" })

    const call = await answerAndReadEndedCall()

    expect(call?.endedStatus).toBe("answerFailed")
    expect(call?.endedMessage).toBe("Access denied")
  })

  test("an error thrown mid-answer ends on screen instead of vanishing", async () => {
    answerActionMock.mockRejectedValue(new Error("network down"))

    const call = await answerAndReadEndedCall()

    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.endedStatus).toBe("answerFailed")
  })

  test("a failed answer stays on screen past the usual linger, until dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      getUserMediaMock.mockRejectedValue(
        new DOMException("mic", "NotFoundError"),
      )
      await answerAndReadEndedCall()

      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
        "micNotFound",
      )

      act(() => {
        hookResult?.dismissEnded()
      })
      expect(useWhatsappVoipCallStore.getState().call).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test("a second tab of the same browser that clicks answer does nothing: no TURN, no mic, no server call", async () => {
    // Another tab already holds the answer lock for this call.
    const lockRequestMock = vi.fn(
      (
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<unknown>,
      ) => callback(null),
    )
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      locks: { request: lockRequestMock },
    })
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.answer()
    })

    expect(lockRequestMock).toHaveBeenCalledWith(
      "whatsapp-voip-answer:call-1",
      { ifAvailable: true },
      expect.any(Function),
    )
    expect(turnCredentialsActionMock).not.toHaveBeenCalled()
    expect(getUserMediaMock).not.toHaveBeenCalled()
    expect(answerActionMock).not.toHaveBeenCalled()
    expect(createdPeerConnections).toHaveLength(0)
    // Silent - the tab that won shows the call.
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("the tab that wins the answer lock answers while holding it, and releases it after", async () => {
    let isLockHeld = false
    const heldDuringAnswer: boolean[] = []
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      locks: {
        request: async (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<unknown>,
        ) => {
          isLockHeld = true
          try {
            return await callback({
              name: "whatsapp-voip-answer:call-1",
              mode: "exclusive",
            })
          } finally {
            isLockHeld = false
          }
        },
      },
    })
    answerActionMock.mockImplementation(() => {
      heldDuringAnswer.push(isLockHeld)
      return Promise.resolve({ data: { outcome: "accepted" } })
    })
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.answer()
    })

    expect(heldDuringAnswer).toEqual([true])
    expect(isLockHeld).toBe(false)
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
  })

  test("a failing lock request ends on screen instead of leaving the call stuck answering", async () => {
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      locks: { request: () => Promise.reject(new Error("SecurityError")) },
    })
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.answer()
    })

    expect(answerActionMock).not.toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call).toMatchObject({
      phase: WhatsappVoipCallPhase.ended,
      endedStatus: "answerFailed",
    })
  })

  test("dismiss() silences the ring locally: resets the store, no peer, no server action", async () => {
    seedRingingSlot(incomingData)
    await render()

    act(() => {
      hookResult?.dismiss()
    })

    // Ring-all: dismissing is local only — no hangup/answer action is called,
    // so the call keeps ringing the other agents.
    expect(hangupActionMock).not.toHaveBeenCalled()
    expect(answerActionMock).not.toHaveBeenCalled()
    expect(createdPeerConnections).toHaveLength(0)
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("L-ts1: hangup() is a no-op while the call is still incomingRinging (never fires against an unanswered call)", async () => {
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.hangup()
    })

    expect(hangupActionMock).not.toHaveBeenCalled()
    expect(createdPeerConnections).toHaveLength(0)
    expect(useWhatsappVoipCallStore.getState().call).not.toBeNull()
  })

  test("hangup() closes the peer and calls the hangup action", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })

    await act(async () => {
      await hookResult?.hangup()
    })

    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("the transport-ended realtime event (handleEnded) closes an active peer", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })
    expect(createdPeerConnections[0]?.close).not.toHaveBeenCalled()

    act(() => {
      useWhatsappVoipCallStore.getState().handleEnded("call-1")
    })

    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
  })

  test("toggleMute disables the local audio track and flips store state", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })

    act(() => {
      hookResult?.toggleMute()
    })

    expect(useWhatsappVoipCallStore.getState().call?.isMuted).toBe(true)
  })

  test("resumes a still-ringing call fetched on mount into the basket, not the slot", async () => {
    pendingIncomingActionMock.mockResolvedValue({ data: [incomingData] })

    await render()
    await act(async () => {
      await pendingIncomingActionMock.mock.results.at(-1)?.value
    })

    expect(pendingIncomingActionMock).toHaveBeenCalledWith("workspace-1")
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })

  test("resumes EVERY still-ringing call, reversed into oldest-first basket order", async () => {
    // The service returns newest-created-first (`desc(createdAt)`), while a
    // live realtime ring always appends oldest-first — reversing here keeps
    // both paths producing the same basket order.
    const callA = { ...incomingData, whatsappCallId: "call-a" }
    const callB = { ...incomingData, whatsappCallId: "call-b" }
    pendingIncomingActionMock.mockResolvedValue({ data: [callB, callA] })

    await render()
    await act(async () => {
      await pendingIncomingActionMock.mock.results.at(-1)?.value
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-a", "call-b"])
  })

  test("resumes into the basket even while the slot already holds a different call — ring-all means both stay live", async () => {
    pendingIncomingActionMock.mockResolvedValue({ data: [incomingData] })
    seedRingingSlot({
      ...incomingData,
      whatsappCallId: "already-engaged",
    })

    await render()
    await act(async () => {
      await pendingIncomingActionMock.mock.results.at(-1)?.value
    })

    expect(pendingIncomingActionMock).toHaveBeenCalledWith("workspace-1")
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "already-engaged",
    )
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })

  test("sends a compensating hangup and does not markActive when the store's call was cleared while answer() was in flight", async () => {
    answerActionMock.mockImplementation(() => {
      // Simulate the call being dismissed/cleared by the user (or a
      // conflicting event) WHILE the answer round-trip is still in flight.
      useWhatsappVoipCallStore.setState({ call: null })
      return Promise.resolve({ data: { outcome: "accepted" } })
    })
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.answer()
    })

    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("FIX 1: a late 'accepted' outcome must not resurrect a call Meta already ended mid-flight (same id, terminal ended phase)", async () => {
    let resolveAnswer: ((value: unknown) => void) | undefined
    answerActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve
        }),
    )
    seedRingingSlot(incomingData)
    await render()

    let answerPromise: Promise<void> | undefined
    await act(async () => {
      answerPromise = hookResult?.answer()
      for (let i = 0; i < 20 && !resolveAnswer; i++) {
        await Promise.resolve()
      }
    })

    // The realtime `whatsappCallTransportEnded` handler runs while the
    // accept round-trip is still in flight — same `whatsappCallId`, moved to
    // the terminal `ended` phase.
    act(() => {
      useWhatsappVoipCallStore.getState().handleEnded("call-1", "rejected")
    })

    await act(async () => {
      resolveAnswer?.({ data: { outcome: "accepted" } })
      await answerPromise
    })

    // Never resurrected: still `ended`, never bounced to `active`.
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.ended,
    )
    expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
      "rejected",
    )
    // Teardown ran and a compensating hangup was sent for the accept Meta
    // just confirmed.
    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
  })

  test("FIX 2: the provider unmounting while getUserMedia is pending tears down the peer and stops the mic — no compensating hangup since nothing was accepted yet", async () => {
    let resolveMic: ((value: MediaStream) => void) | undefined
    getUserMediaMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMic = resolve
        }),
    )
    seedRingingSlot(incomingData)
    await render()

    let answerPromise: Promise<void> | undefined
    await act(async () => {
      answerPromise = hookResult?.answer()
      for (let i = 0; i < 20 && !resolveMic; i++) {
        await Promise.resolve()
      }
    })

    act(() => {
      root.unmount()
    })

    const stream = makeMockStream()
    await act(async () => {
      resolveMic?.(stream)
      await answerPromise
    })

    const track = stream.getTracks()[0] as unknown as MockTrack
    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalled()
    expect(answerActionMock).not.toHaveBeenCalled()
    expect(hangupActionMock).not.toHaveBeenCalled()
  })

  test("FIX 2: the provider unmounting after the accept already resolved sends a compensating hangup and tears down", async () => {
    let resolveAnswer: ((value: unknown) => void) | undefined
    answerActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve
        }),
    )
    seedRingingSlot(incomingData)
    await render()

    let answerPromise: Promise<void> | undefined
    await act(async () => {
      answerPromise = hookResult?.answer()
      for (let i = 0; i < 20 && !resolveAnswer; i++) {
        await Promise.resolve()
      }
    })

    act(() => {
      root.unmount()
    })

    await act(async () => {
      resolveAnswer?.({ data: { outcome: "accepted" } })
      await answerPromise
    })

    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
  })

  test("FIX 2 control: a slow-but-still-mounted answer (TURN + mic) still succeeds", async () => {
    let resolveTurn:
      | ((value: {
          data: { iceServers: RTCIceServer[]; turnConfigured: boolean }
        }) => void)
      | undefined
    turnCredentialsActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTurn = resolve
        }),
    )
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()

    let answerPromise: Promise<void> | undefined
    await act(async () => {
      answerPromise = hookResult?.answer()
      for (let i = 0; i < 20 && !resolveTurn; i++) {
        await Promise.resolve()
      }
    })

    // Still mounted the whole time — the slow TURN round-trip must not be
    // mistaken for an abandoned attempt.
    await act(async () => {
      resolveTurn?.({
        data: {
          iceServers: [{ urls: "stun:stun.example.com" }],
          turnConfigured: true,
        },
      })
      await answerPromise
    })

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
    expect(hangupActionMock).not.toHaveBeenCalled()
  })

  test("does not fetch the resume lookup again on a re-render (mount-only)", async () => {
    pendingIncomingActionMock.mockResolvedValue({ data: [] })

    await render()
    await act(async () => {
      await pendingIncomingActionMock.mock.results.at(-1)?.value
    })
    expect(pendingIncomingActionMock).toHaveBeenCalledTimes(1)

    await render()

    expect(pendingIncomingActionMock).toHaveBeenCalledTimes(1)
  })

  test("starts the recorder with the local+remote streams once accepted with browserRecordingEnabled", async () => {
    answerActionMock.mockResolvedValue({
      data: {
        outcome: "accepted",
        browserRecordingEnabled: true,
        recordingRequested: true,
      },
    })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })

    const remoteStream = makeMockStream()
    act(() => {
      createdPeerConnections[0]?.ontrack?.({ streams: [remoteStream] })
    })

    expect(startCallRecorderMock).toHaveBeenCalledWith({
      whatsappCallId: "call-1",
      localStream: expect.anything(),
      remoteStream,
    })
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(true)
  })

  test("does not start the recorder when browserRecordingEnabled is false", async () => {
    answerActionMock.mockResolvedValue({
      data: {
        outcome: "accepted",
        browserRecordingEnabled: false,
        recordingRequested: false,
      },
    })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })

    act(() => {
      createdPeerConnections[0]?.ontrack?.({ streams: [makeMockStream()] })
    })

    expect(startCallRecorderMock).not.toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(false)
  })

  test("metaNative mode never starts the browser recorder, but isRecording still reflects recordingRequested", async () => {
    answerActionMock.mockResolvedValue({
      data: {
        outcome: "accepted",
        browserRecordingEnabled: false,
        recordingRequested: true,
      },
    })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })

    act(() => {
      createdPeerConnections[0]?.ontrack?.({ streams: [makeMockStream()] })
    })

    expect(startCallRecorderMock).not.toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(true)
  })

  test("teardown() stops the recorder before the mic track, so the final chunk is never lost", async () => {
    const callOrder: string[] = []
    startCallRecorderMock.mockReturnValue({
      stop: vi.fn(() => callOrder.push("recorder-stop")),
    })
    const track: MockTrack = {
      stop: vi.fn(() => callOrder.push("track-stop")),
      enabled: true,
    }
    const customStream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream
    getUserMediaMock.mockResolvedValueOnce(customStream)

    answerActionMock.mockResolvedValue({
      data: {
        outcome: "accepted",
        browserRecordingEnabled: true,
        recordingRequested: true,
      },
    })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })
    act(() => {
      createdPeerConnections[0]?.ontrack?.({ streams: [makeMockStream()] })
    })
    expect(startCallRecorderMock).toHaveBeenCalled()

    await act(async () => {
      await hookResult?.hangup()
    })

    expect(callOrder).toEqual(["recorder-stop", "track-stop"])
  })

  test("the remote-hangup path (handleEnded) still stops the recorder", async () => {
    const stopRecorderMock = vi.fn()
    startCallRecorderMock.mockReturnValue({ stop: stopRecorderMock })
    answerActionMock.mockResolvedValue({
      data: {
        outcome: "accepted",
        browserRecordingEnabled: true,
        recordingRequested: true,
      },
    })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })
    act(() => {
      createdPeerConnections[0]?.ontrack?.({ streams: [makeMockStream()] })
    })
    expect(startCallRecorderMock).toHaveBeenCalled()

    act(() => {
      useWhatsappVoipCallStore.getState().handleEnded("call-1")
    })

    expect(stopRecorderMock).toHaveBeenCalled()
  })

  test("sends a best-effort hangup beacon on pagehide only while the call is active", async () => {
    answerActionMock.mockResolvedValue({
      data: {
        outcome: "accepted",
        browserRecordingEnabled: false,
        recordingRequested: false,
      },
    })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })

    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/whatsapp-voip-call-hangup",
      expect.any(Blob),
    )
  })

  const makeCall = (
    phase: WhatsappVoipCallPhase,
  ): ReturnType<typeof useWhatsappVoipCallStore.getState>["call"] => ({
    transport: "voip",
    whatsappCallId: "call-1",
    wacid: "wacid-1",
    phase,
    direction: "inbound",
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    contactName: "Ada Lovelace",
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    isMuted: false,
    isRecording: false,
  })

  const dispatchBeforeUnload = () => {
    const event = new Event("beforeunload", { cancelable: true })
    let notCancelled = true
    act(() => {
      notCancelled = window.dispatchEvent(event)
    })
    return notCancelled
  }

  test.each([
    WhatsappVoipCallPhase.answering,
    WhatsappVoipCallPhase.outboundDialing,
    WhatsappVoipCallPhase.outboundRinging,
    WhatsappVoipCallPhase.active,
  ])("D7: beforeunload is cancelled while the call phase is %s", async (phase) => {
    await render()
    act(() => {
      useWhatsappVoipCallStore.setState({ call: makeCall(phase) })
    })

    expect(dispatchBeforeUnload()).toBe(false)
  })

  test.each([
    WhatsappVoipCallPhase.incomingRinging,
    WhatsappVoipCallPhase.ended,
  ])("D7: beforeunload is NOT cancelled while the call phase is %s", async (phase) => {
    await render()
    act(() => {
      useWhatsappVoipCallStore.setState({ call: makeCall(phase) })
    })

    expect(dispatchBeforeUnload()).toBe(true)
  })

  test("beforeunload is NOT cancelled with no call in the slot", async () => {
    await render()

    expect(dispatchBeforeUnload()).toBe(true)
  })

  // Under ring-all an offer reaches every online agent, so warning on a
  // merely-ringing basket blocked navigation for agents who never intended to
  // answer — and guarded nothing, since the resume fetch re-discovers every
  // unanswered offer on the next mount.
  test("beforeunload is NOT cancelled by a ringing basket alone", async () => {
    await render()
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
    })

    expect(dispatchBeforeUnload()).toBe(true)
  })

  test("an engaged call still warns even while the basket is also ringing", async () => {
    await render()
    act(() => {
      useWhatsappVoipCallStore.setState({
        call: makeCall(WhatsappVoipCallPhase.active),
      })
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
    })

    expect(dispatchBeforeUnload()).toBe(false)
  })

  test("answer() attaches the mic with addTrack BEFORE the answer, so the SDP is sendrecv", async () => {
    // The regression this pins: a `sendrecv` transceiver with no track makes
    // Chrome answer `recvonly`, no RTP ever leaves the browser, and Meta ends
    // the answered call with 138021. Asserting the SDP — not that
    // `addTransceiver` was called — is what makes this test able to fail.
    let resolveAnswer: ((value: unknown) => void) | undefined
    answerActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve
        }),
    )
    seedRingingSlot(incomingData)
    await render()

    let answerPromise: Promise<void> | undefined
    await act(async () => {
      answerPromise = hookResult?.answer()
      for (let i = 0; i < 20 && !resolveAnswer; i++) {
        await Promise.resolve()
      }
    })

    const pc = createdPeerConnections[0]
    expect(pc?.addTrack).toHaveBeenCalled()
    // Answering must NOT use addTransceiver: Chrome does not reuse it for the
    // remote offer's m-line, so the mic would attach to a transceiver that is
    // not in the session at all.
    expect(pc?.addTransceiver).not.toHaveBeenCalled()
    expect(pc?.addTrackSenders[0]?.track).not.toBeNull()

    const submitted = answerActionMock.mock.calls[0]?.[1] as {
      sdpAnswer: string
    }
    expect(submitted.sdpAnswer).toContain("a=sendrecv")
    expect(submitted.sdpAnswer).not.toContain("a=recvonly")

    await act(async () => {
      resolveAnswer?.({
        data: {
          outcome: "accepted",
          browserRecordingEnabled: false,
          recordingRequested: false,
        },
      })
      await answerPromise
    })

    // Accept resolving changes nothing about the media path — it was already
    // negotiated, and the sender still holds the same track.
    expect(pc?.addTrackSenders).toHaveLength(1)
    expect(pc?.addTrackSenders[0]?.track).not.toBeNull()
  })

  test("the mic track is attached before the remote offer is applied", async () => {
    // Order matters, not just presence: addTrack after setRemoteDescription
    // still answers recvonly.
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })

    const pc = createdPeerConnections[0]
    // Read without a `?? 0` fallback: defaulting a never-invoked spy to 0 would
    // make "addTrack was never called" pass this ordering assertion.
    expect(pc?.addTrack).toHaveBeenCalled()
    expect(pc?.setRemoteDescription).toHaveBeenCalled()
    expect(pc?.createAnswer).toHaveBeenCalled()

    const [addTrackOrder] = pc?.addTrack.mock.invocationCallOrder ?? []
    const [setRemoteOrder] =
      pc?.setRemoteDescription.mock.invocationCallOrder ?? []
    const [createAnswerOrder] = pc?.createAnswer.mock.invocationCallOrder ?? []

    expect(addTrackOrder).toBeDefined()
    expect(addTrackOrder).toBeLessThan(setRemoteOrder as number)
    expect(setRemoteOrder).toBeLessThan(createAnswerOrder as number)
  })

  test("pc.connectionState 'failed' tears down and fires a compensating hangup with a translated connection-lost notice", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })
    const pc = createdPeerConnections[0]
    expect(pc).toBeDefined()

    if (pc) {
      pc.connectionState = "failed"
    }
    act(() => {
      pc?.onconnectionstatechange?.()
    })

    expect(pc?.close).toHaveBeenCalled()
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.ended,
    )
    expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
      "connectionLost",
    )
  })

  test("answering with a microphone that yields no audio track fails loudly instead of answering silently", async () => {
    // The inbound equivalent of the old failed-replaceTrack path: if nothing
    // can be attached before the answer is created, the SDP would commit to
    // `recvonly` and the call would connect and stay silent. Refuse instead.
    getUserMediaMock.mockResolvedValue({
      getTracks: () => [],
      getAudioTracks: () => [],
    })
    seedRingingSlot(incomingData)
    await render()

    await act(async () => {
      await hookResult?.answer()
    })

    expect(answerActionMock).not.toHaveBeenCalled()
    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    // A stream without an audio track is a device problem, not a lost
    // connection, so the agent is pointed at their microphone.
    expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
      "answerFailed",
    )
  })

  test("pc.connectionState 'disconnected' for more than the grace window tears down; recovery cancels the timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
      seedRingingSlot(incomingData)
      await render()
      await act(async () => {
        await hookResult?.answer()
      })
      const pc = createdPeerConnections[0]
      if (!pc) {
        throw new Error("expected a peer connection")
      }

      pc.connectionState = "disconnected"
      act(() => pc.onconnectionstatechange?.())

      // Recovers well before the 8s grace window elapses — must cancel the
      // pending timer rather than tearing down later.
      await act(async () => {
        vi.advanceTimersByTime(4000)
        await Promise.resolve()
      })
      pc.connectionState = "connected"
      act(() => pc.onconnectionstatechange?.())
      await act(async () => {
        vi.advanceTimersByTime(10_000)
        await Promise.resolve()
      })
      expect(pc.close).not.toHaveBeenCalled()
      expect(hangupActionMock).not.toHaveBeenCalled()

      // A second disconnect that is never recovered from DOES tear down
      // once the grace window elapses.
      pc.connectionState = "disconnected"
      act(() => pc.onconnectionstatechange?.())
      await act(async () => {
        vi.advanceTimersByTime(8000)
        await Promise.resolve()
      })
      expect(pc.close).toHaveBeenCalled()
      expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
        whatsappCallId: "call-1",
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test("heartbeats every 20s while active, and a ok:false response stops the interval WITHOUT tearing the call down", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
      seedRingingSlot(incomingData)
      await render()
      await act(async () => {
        await hookResult?.answer()
      })

      expect(heartbeatActiveVoipCallActionMock).toHaveBeenCalledWith(
        "workspace-1",
        { wacid: "wacid-1" },
      )
      heartbeatActiveVoipCallActionMock.mockClear()

      await act(async () => {
        vi.advanceTimersByTime(20_000)
        await Promise.resolve()
      })
      expect(heartbeatActiveVoipCallActionMock).toHaveBeenCalledTimes(1)

      heartbeatActiveVoipCallActionMock.mockResolvedValueOnce({
        data: { ok: false },
      })
      await act(async () => {
        vi.advanceTimersByTime(20_000)
        await Promise.resolve()
        await Promise.resolve()
      })
      heartbeatActiveVoipCallActionMock.mockClear()

      await act(async () => {
        vi.advanceTimersByTime(40_000)
        await Promise.resolve()
      })
      expect(heartbeatActiveVoipCallActionMock).not.toHaveBeenCalled()
      // ok:false only stops the ping — it must never tear the local call
      // down (WebRTC media may still be flowing fine).
      expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
        WhatsappVoipCallPhase.active,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  test("stops heartbeating once the call ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
      seedRingingSlot(incomingData)
      await render()
      await act(async () => {
        await hookResult?.answer()
      })
      heartbeatActiveVoipCallActionMock.mockClear()

      await act(async () => {
        await hookResult?.hangup()
      })

      await act(async () => {
        vi.advanceTimersByTime(60_000)
        await Promise.resolve()
      })
      expect(heartbeatActiveVoipCallActionMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

const incomingData2 = {
  ...incomingData,
  whatsappCallId: "call-2",
  contactName: "Grace Hopper",
}

describe("useWhatsappVoipCall — basket / multi-ring", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    createdPeerConnections.length = 0
    vi.clearAllMocks()
    getUserMediaMock.mockResolvedValue(makeMockStream())
    turnCredentialsActionMock.mockResolvedValue({
      data: {
        iceServers: [{ urls: "stun:stun.example.com" }],
        turnConfigured: true,
      },
    })
    pendingIncomingActionMock.mockResolvedValue({ data: [] })
    startCallRecorderMock.mockReturnValue({ stop: vi.fn() })
    hangupActionMock.mockResolvedValue({ data: { hungUp: true } })
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection)
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: { getUserMedia: getUserMediaMock },
      sendBeacon: vi.fn(),
    })

    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingOutboundAnswer: null,
    })
    hookResult = null

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  function TestHarness() {
    hookResult = useWhatsappVoipCall()
    return null
  }

  const render = () =>
    act(() => {
      root.render(<TestHarness />)
    })

  test("answer(id) reaches the answer action for a basket entry — fails against a naive implementation reusing the stale call closure", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    await render()
    // The hook's `call` selector closure was `null` at the time this render
    // committed — populate the basket via a DIRECT store mutation (not a
    // re-render channel this component has necessarily observed yet) so a
    // stale-closure implementation of `answer` would see `call === null`
    // and no-op instead of resolving the target from `getState()`.
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
    })

    await act(async () => {
      await hookResult?.answer("call-1")
    })

    expect(turnCredentialsActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
    expect(answerActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
      sdpAnswer: ANSWER_SDP,
    })
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(0)
  })

  test("answer(id) promotes and answers exactly the targeted basket entry among several", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    await render()
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData2)
    })

    await act(async () => {
      await hookResult?.answer("call-2")
    })

    expect(turnCredentialsActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-2",
    })
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-2",
    )
    // The untouched offer stays in the basket, unaffected.
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })

  test("the replacement path awaits a confirmed hangup before promoting the basket entry", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    let resolveHangup: ((value: unknown) => void) | undefined
    hangupActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHangup = resolve
        }),
    )
    seedRingingSlot(incomingData)
    await render()
    // Get the first call to `active` so the slot is genuinely ENGAGED.
    await act(async () => {
      await hookResult?.answer()
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData2)
    })

    let answerPromise: Promise<void> | undefined
    await act(async () => {
      answerPromise = hookResult?.answer("call-2")
      // Flush microtasks so the replacement hangup call is issued before we
      // assert on it, without resolving it yet.
      for (let i = 0; i < 10 && !resolveHangup; i++) {
        await Promise.resolve()
      }
    })

    // Still the FIRST call — nothing was promoted while the hangup is
    // pending, so the first customer is never dropped mid-await.
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])

    await act(async () => {
      resolveHangup?.({ data: { hungUp: true } })
      await answerPromise
    })

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-2",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(0)
  })

  test("the replacement path aborts without promoting when the hangup fails, and surfaces an error", async () => {
    hangupActionMock.mockResolvedValue({ data: { hungUp: false } })
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData2)
    })
    // Only care about calls made from the replacement attempt below.
    answerActionMock.mockClear()

    await act(async () => {
      await hookResult?.answer("call-2")
    })

    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "call-1",
    })
    // Never promoted: the slot still holds the ORIGINAL call, and the
    // offer stays fully intact in the basket.
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])
    // Never even reached the answer flow — the replacement was aborted
    // before `promoteRinging` was ever called.
    expect(answerActionMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalled()
  })

  test("FIX 5: replacing a call still `preparing` never calls the hangup action with the client nonce — cancels locally and promotes the ring", async () => {
    await render()
    let resolveInitiate: ((value: unknown) => void) | undefined
    initiateOutboundActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitiate = resolve
        }),
    )

    let startOutboundPromise: Promise<unknown> | undefined
    await act(async () => {
      startOutboundPromise = hookResult?.startOutbound({
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
      })
      for (let i = 0; i < 20 && !resolveInitiate; i++) {
        await Promise.resolve()
      }
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.preparing,
    )

    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
    })
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })

    await act(async () => {
      await hookResult?.answer("call-1")
    })

    // The client nonce is a UUID, not the `/^\d+$/` shape the hangup
    // action's schema demands — sending it would fail validation and
    // surface a false "hangup failed" toast. It must never be sent.
    expect(hangupActionMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )

    // The cancel token set by the shared `cancelPreparingAttempt` helper
    // still does its job: once the abandoned dial resolves to a real server
    // call anyway, `startOutbound` fires its OWN compensating hangup with
    // the real server id — never the malformed nonce-based one this fix
    // removes.
    await act(async () => {
      resolveInitiate?.({
        data: {
          outcome: "dialing",
          whatsappCallId: "999",
          wacid: "wacid-999",
          attemptId: "attempt-1",
          deadlineAt: new Date(Date.now() + 30_000).toISOString(),
          browserRecordingEnabled: false,
          recordingRequested: false,
        },
      })
      await startOutboundPromise
    })
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "999",
    })
  })

  test("FIX 5: replacing a call still `outboundDialing` sends the real server id to the hangup action", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: {
        outcome: "dialing",
        whatsappCallId: "out-call-1",
        wacid: "out-wacid-1",
        attemptId: "attempt-1",
        deadlineAt: new Date(Date.now() + 30_000).toISOString(),
        browserRecordingEnabled: false,
        recordingRequested: false,
      },
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
      })
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.outboundDialing,
    )

    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
    })
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })

    await act(async () => {
      await hookResult?.answer("call-1")
    })

    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
  })

  test("FIX 5: replacing a call still `outboundRinging` sends the real server id to the hangup action", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: {
        outcome: "dialing",
        whatsappCallId: "out-call-1",
        wacid: "out-wacid-1",
        attemptId: "attempt-1",
        deadlineAt: new Date(Date.now() + 30_000).toISOString(),
        browserRecordingEnabled: false,
        recordingRequested: false,
      },
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
      })
    })
    act(() => {
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "ringing")
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.outboundRinging,
    )

    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
    })
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })

    await act(async () => {
      await hookResult?.answer("call-1")
    })

    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  test("a double-click cannot end the call being answered — the second answer() call for a different id is rejected while the first is in flight", async () => {
    answerActionMock.mockResolvedValue({ data: { outcome: "accepted" } })
    let resolveHangup: ((value: unknown) => void) | undefined
    hangupActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHangup = resolve
        }),
    )
    seedRingingSlot(incomingData)
    await render()
    await act(async () => {
      await hookResult?.answer()
    })
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData2)
    })

    let firstAnswer: Promise<void> | undefined
    let secondAnswer: Promise<void> | undefined
    await act(async () => {
      // Two rapid clicks on the SAME offer while the first replacement is
      // still awaiting the server's confirmed hangup.
      firstAnswer = hookResult?.answer("call-2")
      secondAnswer = hookResult?.answer("call-2")
      for (let i = 0; i < 10 && !resolveHangup; i++) {
        await Promise.resolve()
      }
    })

    // Only ONE hangup was ever issued for the call being replaced — a
    // second attempt reaching this point would either hang it up again or
    // race the first attempt's own freshly-promoted slot.
    expect(hangupActionMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveHangup?.({ data: { hungUp: true } })
      await Promise.all([firstAnswer, secondAnswer])
    })

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-2",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
  })

  test("one basket entry's expiry removes only its own id, leaving other offers untouched", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const soon = {
        ...incomingData,
        deadlineAt: new Date(Date.now() + 5000).toISOString(),
      }
      const later = {
        ...incomingData2,
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      }
      await render()
      act(() => {
        useWhatsappVoipCallStore.getState().enqueueRinging(soon)
        useWhatsappVoipCallStore.getState().enqueueRinging(later)
      })

      await act(async () => {
        vi.advanceTimersByTime(5000)
        await Promise.resolve()
      })

      expect(
        useWhatsappVoipCallStore
          .getState()
          .ringingCalls.map((entry) => entry.whatsappCallId),
      ).toEqual(["call-2"])
    } finally {
      vi.useRealTimers()
    }
  })

  test("clears the whole basket on unmount", async () => {
    await render()
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData2)
    })
    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(2)

    act(() => root.unmount())

    expect(useWhatsappVoipCallStore.getState().ringingCalls).toHaveLength(0)
  })

  test("dismiss(id) drops only that basket entry and never touches teardown/hangup", async () => {
    await render()
    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData2)
    })

    act(() => {
      hookResult?.dismiss("call-1")
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])
    expect(hangupActionMock).not.toHaveBeenCalled()
    expect(answerActionMock).not.toHaveBeenCalled()
  })
})

const outboundDialingResult = {
  outcome: "dialing" as const,
  whatsappCallId: "out-call-1",
  wacid: "out-wacid-1",
  attemptId: "attempt-1",
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  browserRecordingEnabled: false,
  recordingRequested: false,
}

describe("useWhatsappVoipCall — startOutbound", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    createdPeerConnections.length = 0
    vi.clearAllMocks()
    getUserMediaMock.mockResolvedValue(makeMockStream())
    outboundTurnCredentialsActionMock.mockResolvedValue({
      data: {
        iceServers: [{ urls: "stun:stun.example.com" }],
        turnConfigured: true,
      },
    })
    pendingIncomingActionMock.mockResolvedValue({ data: null })
    startCallRecorderMock.mockReturnValue({ stop: vi.fn() })
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection)
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: { getUserMedia: getUserMediaMock },
      sendBeacon: vi.fn(),
    })
    vi.stubGlobal("crypto", {
      ...globalThis.crypto,
      randomUUID: () => "nonce-1",
    })

    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingOutboundAnswer: null,
    })
    hookResult = null

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  function TestHarness() {
    hookResult = useWhatsappVoipCall()
    return null
  }

  const render = () =>
    act(() => {
      root.render(<TestHarness />)
    })

  test("dialing: builds an audio-only offer, calls the action, and moves the store to outboundDialing", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()

    let outcome: string | undefined
    await act(async () => {
      outcome = await hookResult?.startOutbound({
        conversationId: "conversation-1",
        contactName: "Ada Lovelace",
      })
    })

    expect(outboundTurnCredentialsActionMock).toHaveBeenCalledWith(
      "workspace-1",
      { attemptId: "nonce-1" },
    )
    expect(getUserMediaMock).toHaveBeenCalled()
    expect(createdPeerConnections).toHaveLength(1)
    // The mic track is added up front, so `createOffer` needs no
    // `offerToReceiveAudio`/`offerToReceiveVideo` — the audio track alone
    // declares the m-line, and no video track exists, so no video m-line is
    // ever offered.
    expect(createdPeerConnections[0]?.addTrack).toHaveBeenCalled()
    expect(createdPeerConnections[0]?.addTransceiver).not.toHaveBeenCalled()
    expect(createdPeerConnections[0]?.createOffer).toHaveBeenCalledWith()
    expect(initiateOutboundActionMock).toHaveBeenCalledWith("workspace-1", {
      conversationId: "conversation-1",
      contactInboxId: undefined,
      sdpOffer: OFFER_SDP,
    })
    expect(outcome).toBe("dialing")
    expect(useWhatsappVoipCallStore.getState().call).toMatchObject({
      whatsappCallId: "out-call-1",
      direction: "outbound",
      phase: "outboundDialing",
    })
  })

  test("occupied: no-ops and never touches the network when the slot is already busy", async () => {
    useWhatsappVoipCallStore.setState({
      call: {
        transport: "voip",
        whatsappCallId: "existing-call",
        wacid: "existing-wacid",
        direction: "inbound",
        phase: "incomingRinging",
        conversationId: "c",
        contactInboxId: "ci",
        offer: { sdpType: "offer", sdp: "v=0" },
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
        isMuted: false,
        isRecording: false,
      },
    })
    await render()

    let outcome: string | undefined
    await act(async () => {
      outcome = await hookResult?.startOutbound({
        conversationId: "conversation-1",
      })
    })

    expect(outcome).toBe("occupied")
    expect(outboundTurnCredentialsActionMock).not.toHaveBeenCalled()
    expect(createdPeerConnections).toHaveLength(0)
  })

  test("needsPermission: tears the unused peer down and returns the outcome without touching the store", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: { outcome: "needsPermission" },
    })
    await render()

    let outcome: string | undefined
    await act(async () => {
      outcome = await hookResult?.startOutbound({
        conversationId: "conversation-1",
      })
    })

    expect(outcome).toBe("needsPermission")
    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("callFailed: a thrown error during setup tears down and resolves callFailed", async () => {
    getUserMediaMock.mockRejectedValueOnce(new Error("mic denied"))
    await render()

    let outcome: string | undefined
    await act(async () => {
      outcome = await hookResult?.startOutbound({
        conversationId: "conversation-1",
      })
    })

    expect(outcome).toBe("callFailed")
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("applies a matching pending outbound answer to the live peer, then clears it", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })

    act(() => {
      useWhatsappVoipCallStore.getState().setPendingOutboundAnswer({
        whatsappCallId: "out-call-1",
        sdp: "v=0 answer-from-meta",
      })
    })

    expect(
      createdPeerConnections[0]?.setRemoteDescription,
    ).toHaveBeenCalledWith({ type: "answer", sdp: "v=0 answer-from-meta" })
    expect(useWhatsappVoipCallStore.getState().pendingOutboundAnswer).toBeNull()
  })

  test("buffers a pending outbound answer that arrives before addOutbound, then applies it once the matching call appears", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()

    // The Call-Connect webhook lands while the store's call slot is still
    // empty (before `initiateOutboundVoipCallAction` even resolves) — must
    // not be dropped.
    act(() => {
      useWhatsappVoipCallStore.getState().setPendingOutboundAnswer({
        whatsappCallId: "out-call-1",
        sdp: "v=0 answer-from-meta",
      })
    })
    expect(
      useWhatsappVoipCallStore.getState().pendingOutboundAnswer,
    ).not.toBeNull()

    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })

    expect(
      createdPeerConnections[0]?.setRemoteDescription,
    ).toHaveBeenCalledWith({ type: "answer", sdp: "v=0 answer-from-meta" })
    expect(useWhatsappVoipCallStore.getState().pendingOutboundAnswer).toBeNull()
  })

  test("drops a pending outbound answer for a call with no live peer (e.g. matching call resumed after a reload)", async () => {
    useWhatsappVoipCallStore.setState({
      call: {
        transport: "voip",
        whatsappCallId: "out-call-1",
        wacid: "out-wacid-1",
        direction: "outbound",
        phase: "outboundDialing",
        conversationId: "conversation-1",
        contactInboxId: "",
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
        isMuted: false,
        isRecording: false,
      },
    })
    await render()

    act(() => {
      useWhatsappVoipCallStore.getState().setPendingOutboundAnswer({
        whatsappCallId: "out-call-1",
        sdp: "v=0 answer-from-meta",
      })
    })

    expect(createdPeerConnections).toHaveLength(0)
    expect(useWhatsappVoipCallStore.getState().pendingOutboundAnswer).toBeNull()
  })

  test("drops a pending outbound answer once a DIFFERENT call occupies the slot", async () => {
    useWhatsappVoipCallStore.setState({
      call: {
        transport: "voip",
        whatsappCallId: "some-other-call",
        wacid: "some-other-wacid",
        direction: "inbound",
        phase: "incomingRinging",
        conversationId: "c",
        contactInboxId: "ci",
        offer: { sdpType: "offer", sdp: "v=0" },
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
        isMuted: false,
        isRecording: false,
      },
    })
    await render()

    act(() => {
      useWhatsappVoipCallStore.getState().setPendingOutboundAnswer({
        whatsappCallId: "out-call-1",
        sdp: "v=0 answer-from-meta",
      })
    })

    expect(createdPeerConnections).toHaveLength(0)
    expect(useWhatsappVoipCallStore.getState().pendingOutboundAnswer).toBeNull()
  })

  test("status-driven phase: setOutboundStatus moves outboundDialing -> outboundRinging -> active without touching pc.connectionState", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })

    act(() => {
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "ringing")
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      "outboundRinging",
    )

    act(() => {
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "accepted")
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe("active")
  })

  test("starts the recorder once the outbound call goes active, when browserRecordingEnabled", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: {
        ...outboundDialingResult,
        browserRecordingEnabled: true,
        recordingRequested: true,
      },
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })
    act(() => {
      createdPeerConnections[0]?.ontrack?.({ streams: [makeMockStream()] })
    })

    act(() => {
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "accepted")
    })

    expect(startCallRecorderMock).toHaveBeenCalledWith({
      whatsappCallId: "out-call-1",
      localStream: expect.anything(),
      remoteStream: expect.anything(),
    })
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(true)
  })

  test("outbound metaNative recording never starts the browser recorder, but isRecording reflects recordingRequested immediately from upgradeToDialing", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: {
        ...outboundDialingResult,
        browserRecordingEnabled: false,
        recordingRequested: true,
      },
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })

    // Set immediately, even before any track arrives — no MediaRecorder
    // capture ever starts under metaNative.
    expect(useWhatsappVoipCallStore.getState().call?.isRecording).toBe(true)

    act(() => {
      createdPeerConnections[0]?.ontrack?.({ streams: [makeMockStream()] })
    })
    act(() => {
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "accepted")
    })

    expect(startCallRecorderMock).not.toHaveBeenCalled()
  })

  test("hangup() cancels an outbound call still outboundDialing/outboundRinging, lingering as a 'No answer' ended call rather than vanishing", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })

    await act(async () => {
      await hookResult?.hangup()
    })

    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    // Lingers in `ended` (never reached active -> no `startedAt`, so the
    // panel renders "No answer") rather than a bare reset().
    const { call } = useWhatsappVoipCallStore.getState()
    expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
    expect(call?.whatsappCallId).toBe("out-call-1")
    expect(call?.startedAt).toBeUndefined()
  })

  test("the ended linger auto-clears after ~2s, and only if the slot still holds the same call", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      initiateOutboundActionMock.mockResolvedValue({
        data: outboundDialingResult,
      })
      await render()
      await act(async () => {
        await hookResult?.startOutbound({ conversationId: "conversation-1" })
      })

      await act(async () => {
        await hookResult?.hangup()
      })
      expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
        WhatsappVoipCallPhase.ended,
      )

      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
      })

      expect(useWhatsappVoipCallStore.getState().call).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test("an inbound ring during preparing lands in the BASKET — the slot stays ours, the ring stays answerable", async () => {
    let resolveInitiate: ((value: unknown) => void) | undefined
    initiateOutboundActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitiate = resolve
        }),
    )
    await render()

    let outcome: string | undefined
    await act(async () => {
      const startPromise = hookResult?.startOutbound({
        conversationId: "conversation-1",
      })

      // Flush the getUserMedia/createOffer/ICE-gather microtasks so
      // `startOutbound` reaches the (still-pending) initiate call before the
      // inbound ring lands, without relying on real timers.
      for (let i = 0; i < 20 && !resolveInitiate; i++) {
        await Promise.resolve()
      }

      // An inbound ring arrives while this dial is still `preparing` — the
      // slot is already ours (claimed instantly on click, before the
      // initiate round-trip even started), so `chat-realtime.tsx` calling
      // `enqueueRinging` for it lands the offer in the basket rather than
      // the slot. It stays fully answerable there — `startOutbound` never
      // blocks on the basket (see the deliberate comment on that check in
      // `use-whatsapp-voip-call.ts`).
      useWhatsappVoipCallStore.getState().enqueueRinging(incomingData)

      resolveInitiate?.({ data: outboundDialingResult })
      outcome = await startPromise
    })

    expect(outcome).toBe("dialing")
    // Nothing else claimed the slot, so no compensating hangup is needed —
    // this is now just a normal successful dial.
    expect(hangupActionMock).not.toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "out-call-1",
    )
    expect(useWhatsappVoipCallStore.getState().call?.direction).toBe("outbound")
    // The ring survived in the basket rather than being dropped.
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })

  test("preparing -> cancel -> a late 'dialing' outcome fires a compensating hangup", async () => {
    let resolveInitiate: ((value: unknown) => void) | undefined
    initiateOutboundActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitiate = resolve
        }),
    )
    await render()

    let outcome: string | undefined
    await act(async () => {
      const startPromise = hookResult?.startOutbound({
        conversationId: "conversation-1",
      })

      for (let i = 0; i < 20 && !resolveInitiate; i++) {
        await Promise.resolve()
      }

      expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
        WhatsappVoipCallPhase.preparing,
      )

      // The agent hits End while still `preparing` — no server call exists
      // yet, so this is a purely local cancel.
      await hookResult?.hangup()
      expect(useWhatsappVoipCallStore.getState().call).toBeNull()
      expect(hangupActionMock).not.toHaveBeenCalled()

      // Meta ends up dialing anyway — the compensating hangup fires once
      // this resolves, and the peer built for this attempt is torn down.
      resolveInitiate?.({ data: outboundDialingResult })
      outcome = await startPromise
    })

    expect(outcome).toBe("cancelled")
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("preparing -> cancel before the initiate call ever resolves to dialing releases the slot with no server call", async () => {
    let resolveInitiate: ((value: unknown) => void) | undefined
    initiateOutboundActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitiate = resolve
        }),
    )
    await render()

    let outcome: string | undefined
    await act(async () => {
      const startPromise = hookResult?.startOutbound({
        conversationId: "conversation-1",
      })

      for (let i = 0; i < 20 && !resolveInitiate; i++) {
        await Promise.resolve()
      }

      await hookResult?.hangup()

      // Meta reports the dial never actually connected (e.g. needsPermission)
      // — no compensating hangup is needed since no live call was ever created.
      resolveInitiate?.({ data: { outcome: "needsPermission" } })
      outcome = await startPromise
    })

    expect(outcome).toBe("cancelled")
    expect(hangupActionMock).not.toHaveBeenCalled()
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("mic permission denied (NotAllowedError) maps to a specific outcome", async () => {
    class FakeDomException extends Error {
      override name = "NotAllowedError"
    }
    getUserMediaMock.mockRejectedValueOnce(
      new FakeDomException("denied") as unknown as DOMException,
    )
    vi.stubGlobal("DOMException", FakeDomException)
    await render()

    let outcome: string | undefined
    await act(async () => {
      outcome = await hookResult?.startOutbound({
        conversationId: "conversation-1",
      })
    })

    expect(outcome).toBe("micPermissionDenied")
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("no microphone device (NotFoundError) maps to a specific outcome", async () => {
    class FakeDomException extends Error {
      override name = "NotFoundError"
    }
    getUserMediaMock.mockRejectedValueOnce(
      new FakeDomException("no device") as unknown as DOMException,
    )
    vi.stubGlobal("DOMException", FakeDomException)
    await render()

    let outcome: string | undefined
    await act(async () => {
      outcome = await hookResult?.startOutbound({
        conversationId: "conversation-1",
      })
    })

    expect(outcome).toBe("micNotFound")
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("preparing times out after 30s and cancels the dial", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let resolveInitiate: ((value: unknown) => void) | undefined
      initiateOutboundActionMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveInitiate = resolve
          }),
      )
      await render()

      let startPromise: Promise<string | undefined> | undefined
      // Flush the getUserMedia/createOffer/ICE-gather microtasks so the call
      // actually reaches `preparing` before the timer is asserted.
      await act(async () => {
        startPromise = hookResult?.startOutbound({
          conversationId: "conversation-1",
        })
        for (let i = 0; i < 20 && !resolveInitiate; i++) {
          await Promise.resolve()
        }
      })
      expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
        WhatsappVoipCallPhase.preparing,
      )

      await act(async () => {
        vi.advanceTimersByTime(30_000)
        await Promise.resolve()
      })

      expect(useWhatsappVoipCallStore.getState().call).toBeNull()

      await act(async () => {
        resolveInitiate?.({ data: outboundDialingResult })
        await startPromise
      })
      expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
        whatsappCallId: "out-call-1",
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test("the outbound deadline backstop ends the call server-side via hangup(), lingering as 'No answer' rather than a bare local teardown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const deadlineAt = new Date(Date.now() + 1000).toISOString()
      initiateOutboundActionMock.mockResolvedValue({
        data: { ...outboundDialingResult, deadlineAt },
      })
      await render()
      await act(async () => {
        await hookResult?.startOutbound({ conversationId: "conversation-1" })
      })

      await act(async () => {
        vi.advanceTimersByTime(1000)
        // Flush the async `hangup()` -> `hangupWhatsappVoipCallAction` chain.
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(createdPeerConnections[0]?.close).toHaveBeenCalled()
      expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
        whatsappCallId: "out-call-1",
      })
      // Lingers as `ended` (never reached active) instead of vanishing.
      const { call } = useWhatsappVoipCallStore.getState()
      expect(call?.phase).toBe(WhatsappVoipCallPhase.ended)
      expect(call?.whatsappCallId).toBe("out-call-1")

      // The ~2s linger then auto-clears the slot.
      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
      })
      expect(useWhatsappVoipCallStore.getState().call).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test("the outbound offer attaches the mic before createOffer, so the SDP is sendrecv", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    // Regression guard for bug 138021: Meta's ACCEPTED event is best-effort,
    // so attaching the mic there via `replaceTrack` risks a lost event
    // leaving the sender track-less on a live call with zero RTP.
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })

    const pc = createdPeerConnections[0]
    expect(pc?.addTrack).toHaveBeenCalled()
    expect(pc?.addTransceiver).not.toHaveBeenCalled()
    expect(pc?.addTrackSenders[0]?.track).not.toBeNull()

    const submitted = initiateOutboundActionMock.mock.calls[0]?.[1] as {
      sdpOffer: string
    }
    expect(submitted.sdpOffer).toContain("a=sendrecv")
    expect(submitted.sdpOffer).not.toContain("a=recvonly")
  })

  test("the outbound mic is attached before the offer is built, not after", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })

    const pc = createdPeerConnections[0]
    expect(pc?.addTrack).toHaveBeenCalled()
    expect(pc?.createOffer).toHaveBeenCalled()

    const [addTrackOrder] = pc?.addTrack.mock.invocationCallOrder ?? []
    const [createOfferOrder] = pc?.createOffer.mock.invocationCallOrder ?? []

    expect(addTrackOrder).toBeDefined()
    expect(addTrackOrder).toBeLessThan(createOfferOrder as number)
  })

  test("reaching ACCEPTED does not re-touch the media path — it was negotiated at offer time", async () => {
    // The ACCEPTED effect must only start the recorder. If it ever attaches
    // media again, the call's audio depends on that best-effort event once
    // more — the outbound half of the 138021 bug.
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })
    const pc = createdPeerConnections[0]
    const attachCalls = pc?.addTrack.mock.calls.length ?? 0

    await act(async () => {
      // The id the slot actually holds — a mismatched one is merely buffered
      // by `setOutboundStatus`, so the effect under test would never run and
      // both assertions below would pass for the wrong reason.
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "accepted")
      await Promise.resolve()
    })

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.active,
    )
    expect(pc?.addTrack.mock.calls.length).toBe(attachCalls)
    expect(pc?.addTrackSenders[0]?.replaceTrack).not.toHaveBeenCalled()
  })

  test("an outbound call's pc.connectionState 'failed' tears down and fires a compensating hangup", async () => {
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })
    act(() => {
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "accepted")
    })

    const pc = createdPeerConnections[0]
    if (!pc) {
      throw new Error("expected a peer connection")
    }
    pc.connectionState = "failed"
    act(() => pc.onconnectionstatechange?.())

    expect(pc.close).toHaveBeenCalled()
    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      WhatsappVoipCallPhase.ended,
    )
    expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
      "connectionLost",
    )
  })

  test("handleConnectionLost is idempotent — two connection failures hang up only once", async () => {
    // `connectionState` can reach `failed` more than once, so the handler
    // must stay idempotent.
    initiateOutboundActionMock.mockResolvedValue({
      data: outboundDialingResult,
    })
    await render()
    await act(async () => {
      await hookResult?.startOutbound({ conversationId: "conversation-1" })
    })
    await act(async () => {
      useWhatsappVoipCallStore
        .getState()
        .setOutboundStatus("out-call-1", "accepted")
      await Promise.resolve()
    })

    const pc = createdPeerConnections[0]
    if (!pc) {
      throw new Error("expected a peer connection")
    }

    pc.connectionState = "failed"
    await act(async () => {
      pc.onconnectionstatechange?.()
      await Promise.resolve()
    })
    await act(async () => {
      pc.onconnectionstatechange?.()
      await Promise.resolve()
    })

    expect(hangupActionMock).toHaveBeenCalledTimes(1)
    expect(useWhatsappVoipCallStore.getState().call?.endedStatus).toBe(
      "connectionLost",
    )
  })

  test("a connection failure while still preparing releases the local slot immediately (before any server call exists)", async () => {
    let resolveInitiate: ((value: unknown) => void) | undefined
    initiateOutboundActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitiate = resolve
        }),
    )
    await render()

    await act(async () => {
      const startPromise = hookResult?.startOutbound({
        conversationId: "conversation-1",
      })
      for (let i = 0; i < 20 && !resolveInitiate; i++) {
        await Promise.resolve()
      }

      // The connection fails while no server call exists yet (still
      // `preparing`) — releases the slot right away, with no server call to
      // hang up against at this point.
      const pc = createdPeerConnections[0]
      if (pc) {
        pc.connectionState = "failed"
        pc.onconnectionstatechange?.()
      }
      expect(useWhatsappVoipCallStore.getState().call).toBeNull()
      expect(hangupActionMock).not.toHaveBeenCalled()

      // Meta ends up dialing anyway (a late resolution) — same defense-in-depth
      // compensating hangup as an agent-initiated cancel racing a late
      // "dialing" outcome (see the `hangup()`-during-`preparing` test above):
      // the slot is already gone, so the dial's own post-upgrade check fires
      // the compensating hangup itself.
      resolveInitiate?.({ data: outboundDialingResult })
      await startPromise
    })

    expect(hangupActionMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("heartbeats an outbound call every 20s once active, keyed by wacid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      initiateOutboundActionMock.mockResolvedValue({
        data: outboundDialingResult,
      })
      await render()
      await act(async () => {
        await hookResult?.startOutbound({ conversationId: "conversation-1" })
      })
      act(() => {
        useWhatsappVoipCallStore
          .getState()
          .setOutboundStatus("out-call-1", "accepted")
      })

      expect(heartbeatActiveVoipCallActionMock).toHaveBeenCalledWith(
        "workspace-1",
        { wacid: "out-wacid-1" },
      )
      heartbeatActiveVoipCallActionMock.mockClear()

      await act(async () => {
        vi.advanceTimersByTime(20_000)
        await Promise.resolve()
      })
      expect(heartbeatActiveVoipCallActionMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
