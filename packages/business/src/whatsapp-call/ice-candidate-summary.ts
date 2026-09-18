/**
 * Counts the ICE candidate types an SDP offers, so a call that connects but
 * stays silent can be diagnosed from the server log alone.
 *
 * Only counts are produced — never an address, a ufrag, a fingerprint or any
 * other SDP content. A relay count of zero on a deployment that has TURN
 * configured is the signal: the browser never obtained a relay address, so
 * Meta has nowhere to send audio when no direct path exists, and the call ends
 * with error 138021 ("no media was received from the business").
 */

/**
 * The media direction the answer commits to. `sendrecv` is the only value that
 * lets audio flow both ways; `recvonly` means the browser told Meta it will
 * never send RTP, which produces error 138021 ("no media was received from the
 * business") no matter how healthy the relay is.
 */
export type SdpMediaDirection =
  | "sendrecv"
  | "sendonly"
  | "recvonly"
  | "inactive"
  /** No direction attribute present. RFC 4566 §6 makes that mean `sendrecv`. */
  | "unspecified"

export type IceCandidateSummary = {
  /** Candidates on the machine's own interfaces. Always present. */
  host: number
  /** Public address discovered via STUN. Present behind most NATs. */
  srflx: number
  /** A TURN relay address. Zero means TURN was not used. */
  relay: number
  /** Anything else (`prflx`), kept so the counts always add up. */
  other: number
  /** What the answer promises to do with audio. */
  direction: SdpMediaDirection
}

const CANDIDATE_LINE = /^a=candidate:.*? typ (host|srflx|relay|prflx)\b/gm
const DIRECTION_LINE = /^a=(sendrecv|sendonly|recvonly|inactive)\s*$/m
const AUDIO_SECTION_START = /^m=audio\b/m
const NEXT_SECTION = /\r?\n(?=m=)/

/**
 * The lines belonging to the audio media section, or the whole SDP when there
 * is none. Sliced rather than matched with a regex: an `m` flag makes `$` mean
 * end-of-LINE, which silently truncates the section to its own `m=` line.
 */
function audioSection(sdp: string): string {
  const start = sdp.search(AUDIO_SECTION_START)
  if (start === -1) {
    return sdp
  }
  const rest = sdp.slice(start)
  const nextSection = rest.search(NEXT_SECTION)
  return nextSection === -1 ? rest : rest.slice(0, nextSection)
}

/**
 * Reads the direction of the AUDIO media section only. A direction attribute is
 * also legal at session level and applies as a default to every section, so
 * scanning the whole SDP would let a session-level `sendrecv` mask an
 * `a=recvonly` on the audio line — and this helper exists precisely to name
 * that case correctly.
 */
function readDirection(sdp: string): SdpMediaDirection {
  const match = DIRECTION_LINE.exec(audioSection(sdp))
  return match ? (match[1] as SdpMediaDirection) : "unspecified"
}

export function summarizeIceCandidates(sdp: string): IceCandidateSummary {
  const summary: IceCandidateSummary = {
    host: 0,
    srflx: 0,
    relay: 0,
    other: 0,
    direction: readDirection(sdp),
  }
  for (const match of sdp.matchAll(CANDIDATE_LINE)) {
    const type = match[1]
    if (type === "host" || type === "srflx" || type === "relay") {
      summary[type] += 1
    } else {
      summary.other += 1
    }
  }
  return summary
}

/**
 * Whether the answer commits to sending audio at all. `unspecified` counts as
 * sending: RFC 4566 §6 makes an absent direction attribute mean `sendrecv`, so
 * reporting it as "will never send audio" would name the wrong cause during an
 * incident — the one moment this line has to be trustworthy.
 */
export function canSendAudio(summary: IceCandidateSummary): boolean {
  return (
    summary.direction === "sendrecv" ||
    summary.direction === "sendonly" ||
    summary.direction === "unspecified"
  )
}

/**
 * Why a call is about to be silent, or that it should not be. A code rather
 * than a sentence so the log message stays constant and alertable, and so the
 * caller picks the severity.
 *
 * Ordered by how decisive each cause is: a direction that cannot send audio
 * outranks a missing relay, because no relay can carry RTP the browser never
 * emits.
 */
export type AnswerDiagnosis = "cannotSendAudio" | "noRelay" | "healthy"

export function diagnoseAnswerShape(
  summary: IceCandidateSummary,
): AnswerDiagnosis {
  if (!canSendAudio(summary)) {
    return "cannotSendAudio"
  }
  return summary.relay === 0 ? "noRelay" : "healthy"
}
