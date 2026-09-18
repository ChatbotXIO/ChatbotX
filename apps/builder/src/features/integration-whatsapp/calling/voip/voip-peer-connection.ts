/**
 * Deadline for `RTCPeerConnection.iceGatheringState === "complete"` before
 * sending the answer SDP with whatever local candidates have gathered so far —
 * bounds how long a slow/blocked ICE gatherer can hold up answering within
 * Meta's 30-60s accept window.
 */
const ICE_GATHERING_TIMEOUT_MS = 4000
/**
 * How long `pc.connectionState === "disconnected"` is tolerated before treating
 * the call as lost — long enough to absorb a brief network blip without tearing
 * down a recoverable call, short enough that the agent isn't left staring at a
 * dead "active" panel.
 */
const CONNECTION_DISCONNECTED_GRACE_MS = 8000
/**
 * Outbound counterpart to `ICE_GATHERING_TIMEOUT_MS` — longer because the OFFER
 * side has no incoming-call urgency and Meta's `connect` round-trip can
 * tolerate a few extra seconds; still strictly under the 60s user-accept
 * deadline (`OUTBOUND_DIAL_DEADLINE_MS`).
 */
const OUTBOUND_ICE_GATHERING_TIMEOUT_MS = 9000

export const VOIP_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
}

/**
 * Resolves once `pc.iceGatheringState` reaches `"complete"` or the timeout
 * elapses, whichever first. Never rejects — a partial candidate set is still
 * usable.
 */
export function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      pc.removeEventListener("icegatheringstatechange", onStateChange)
      clearTimeout(timeoutId)
      resolve()
    }
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        finish()
      }
    }
    pc.addEventListener("icegatheringstatechange", onStateChange)
    const timeoutId = setTimeout(finish, ICE_GATHERING_TIMEOUT_MS)
  })
}

/**
 * Outbound counterpart to `waitForIceGatheringComplete`: resolves on
 * `"complete"`, on the timeout, or — when a TURN server is configured — as soon
 * as one `relay` candidate has been seen, so a dial isn't held up waiting for
 * host/srflx candidates once a usable relay path exists. Falls back to the
 * plain timeout otherwise. Never rejects.
 */
export function waitForOutboundIceGatheringComplete(
  pc: RTCPeerConnection,
  options: { timeoutMs: number; preferRelay: boolean },
): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      pc.removeEventListener("icegatheringstatechange", onStateChange)
      pc.removeEventListener("icecandidate", onIceCandidate)
      clearTimeout(timeoutId)
      resolve()
    }
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        finish()
      }
    }
    const onIceCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (
        options.preferRelay &&
        event.candidate?.candidate.includes("typ relay")
      ) {
        finish()
      }
    }
    pc.addEventListener("icegatheringstatechange", onStateChange)
    pc.addEventListener("icecandidate", onIceCandidate)
    const timeoutId = setTimeout(finish, options.timeoutMs)
  })
}

/**
 * `"failed"` fires `onUnrecoverable` immediately; `"disconnected"` may
 * self-heal so it only fires after `CONNECTION_DISCONNECTED_GRACE_MS`, and
 * any other state observed meanwhile cancels the pending grace timer.
 */
export function registerConnectionHealthHandlers(
  pc: RTCPeerConnection,
  onUnrecoverable: () => void,
): void {
  let disconnectedTimeoutId: ReturnType<typeof setTimeout> | null = null
  const clearDisconnectedTimer = () => {
    if (disconnectedTimeoutId !== null) {
      clearTimeout(disconnectedTimeoutId)
      disconnectedTimeoutId = null
    }
  }
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState
    if (state === "failed") {
      clearDisconnectedTimer()
      onUnrecoverable()
      return
    }
    if (state === "disconnected") {
      if (disconnectedTimeoutId === null) {
        disconnectedTimeoutId = setTimeout(() => {
          disconnectedTimeoutId = null
          onUnrecoverable()
        }, CONNECTION_DISCONNECTED_GRACE_MS)
      }
      return
    }
    // "connected" / "new" / "connecting" / "closed" — recovery (or an
    // intentional close, a harmless no-op here) cancels any pending grace
    // timer.
    clearDisconnectedTimer()
  }
}

/** Why a microphone could not be captured, mapped to the dial outcomes the UI understands. */
export type MicrophoneCaptureFailure =
  | "micPermissionDenied"
  | "micNotFound"
  | "callFailed"

/**
 * Captures the agent's microphone for a call. Returns the failure reason
 * instead of throwing, so callers map it straight onto a dial outcome. An
 * unexpected failure carries its `error` so the caller can log it only when it
 * actually reports the failure.
 */
export async function captureMicrophoneStream(): Promise<
  | { stream: MediaStream }
  | { failure: MicrophoneCaptureFailure; error?: unknown }
> {
  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia(VOIP_AUDIO_CONSTRAINTS),
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return { failure: "micPermissionDenied" }
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return { failure: "micNotFound" }
    }
    return { failure: "callFailed", error }
  }
}

/**
 * Must run before the SDP for that side is created (`createAnswer` inbound,
 * `createOffer` outbound), or Meta reports error 138021 "no media was received
 * from the business": a track-less `addTransceiver` produces an `a=recvonly`
 * answer since only `addTrack` sets the spec's `[[AddTrackMagic]]` slot, and
 * deferring the attach ties audio to Meta's best-effort ACCEPTED event.
 * Exactly one track is attached: a second would add a second audio m-line,
 * which Meta rejects. Returns false when the stream carries no audio track.
 */
export function attachMicrophone(
  peerConnection: RTCPeerConnection,
  microphone: MediaStream,
): boolean {
  const [audioTrack] = microphone.getAudioTracks()
  if (!audioTrack) {
    return false
  }
  peerConnection.addTrack(audioTrack, microphone)
  return true
}

/**
 * Builds the outbound SDP offer and waits for ICE gathering (preferring a relay
 * candidate when TURN is configured) before reading the local description back.
 */
export async function createOutboundOffer(
  pc: RTCPeerConnection,
  options: { preferRelay: boolean },
): Promise<string> {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitForOutboundIceGatheringComplete(pc, {
    timeoutMs: OUTBOUND_ICE_GATHERING_TIMEOUT_MS,
    preferRelay: options.preferRelay,
  })
  const sdpOffer = pc.localDescription?.sdp
  if (!sdpOffer) {
    throw new Error("voip-outbound-local-description-missing")
  }
  return sdpOffer
}
