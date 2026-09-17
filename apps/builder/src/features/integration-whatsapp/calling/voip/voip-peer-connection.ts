/**
 * Deadline for `RTCPeerConnection.iceGatheringState === "complete"` before
 * sending the answer SDP with whatever local candidates have gathered so
 * far — bounds how long a slow/blocked ICE gatherer can hold up answering
 * within Meta's 30-60s accept window (see `docs/whatsapp-calling-voip.md`).
 */
const ICE_GATHERING_TIMEOUT_MS = 4000
/**
 * How long `pc.connectionState === "disconnected"` is tolerated before
 * treating the call as lost — long enough to absorb a brief network blip
 * (a Wi-Fi handoff, a momentary NAT rebind) without tearing down a call
 * that is about to recover, short enough that the agent is never left
 * staring at an "active" panel over genuine dead air for long.
 */
const CONNECTION_DISCONNECTED_GRACE_MS = 8000
/**
 * Outbound counterpart to {@link ICE_GATHERING_TIMEOUT_MS} — longer because
 * the OFFER side has no incoming-call urgency pressure and Meta's `connect`
 * round-trip can tolerate a few extra seconds; still strictly under the
 * 60s user-accept deadline (`OUTBOUND_DIAL_DEADLINE_MS` in
 * `initiate-outbound-voip-call.action.ts`).
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
 * Resolves once `pc.iceGatheringState` reaches `"complete"` (all local ICE
 * candidates gathered, including the trickle-ICE end-of-candidates signal)
 * or the timeout elapses, whichever comes first. Never rejects — a partial
 * candidate set is still usable.
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
 * Outbound counterpart to {@link waitForIceGatheringComplete}: resolves on
 * `"complete"`, on the timeout, OR — best-effort, when the caller asked for
 * it (a TURN server is actually configured) — as soon as at least one
 * `relay` candidate has been seen, so a dial is not held up the full cap
 * waiting for host/srflx candidates once a usable relay path already
 * exists. Falls back to the plain timeout when no relay candidate ever
 * shows up. Never rejects.
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
 * Wires `pc.onconnectionstatechange` so a lost transport is never
 * silently left showing an "active" call with dead audio. `connectionState`
 * aggregates ICE + DTLS health, so it is a single reliable signal without
 * also needing `oniceconnectionstatechange`. `"failed"` is unrecoverable and
 * fires `onUnrecoverable` immediately; `"disconnected"` may self-heal (a
 * brief NAT rebind), so it only fires after
 * {@link CONNECTION_DISCONNECTED_GRACE_MS} of staying disconnected — any
 * other state observed in the meantime (notably back to `"connected"`)
 * cancels the pending grace timer.
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
    // intentional close, which is a harmless no-op here) cancels any pending
    // grace timer.
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
 * actually reports the failure (a cancelled attempt reports nothing).
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
 * Attaches the agent's microphone to a peer connection, and is the ONLY
 * supported way to do it on either side of a call.
 *
 * It must run before the SDP for that side is created — `createAnswer` on the
 * inbound path, `createOffer` on the outbound one. Two independent failures
 * come from getting this wrong, both of which end an established call with
 * Meta's error 138021, "no media was received from the business":
 *
 *   - ANSWERING with `addTransceiver("audio", { direction: "sendrecv" })` and
 *     no track produces an `a=recvonly` answer. The spec only lets a remote
 *     offer's m-line reuse a transceiver whose internal [[AddTrackMagic]] slot
 *     is set, and only `addTrack` sets it — so Chrome builds a second,
 *     `recvonly` transceiver for that m-line and leaves the hand-made one
 *     unassociated. A later `replaceTrack` then attaches the microphone to a
 *     transceiver that is not in the session at all.
 *   - OFFERING with a track-less transceiver does negotiate `sendrecv`, but
 *     deferring the attach to a later signal makes the audio depend on that
 *     signal arriving. Meta documents its ACCEPTED status event as
 *     best-effort, so a lost one left the sender track-less on a live call.
 *
 * Attaching a real track up front removes both. Exactly ONE track is attached:
 * a second would add a second audio m-line, which Meta rejects. Returns false
 * when the stream carries no audio track, so callers can refuse to negotiate a
 * call that could only ever be silent.
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
 * Builds the outbound SDP offer and waits for ICE gathering (preferring a
 * relay candidate when TURN is configured) before reading the local
 * description back.
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
