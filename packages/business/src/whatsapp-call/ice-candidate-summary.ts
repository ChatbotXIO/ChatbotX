/**
 * Counts ICE candidate types from an SDP so a call that connects but stays
 * silent can be diagnosed from the server log alone. Only counts — never an
 * address, ufrag, or fingerprint. Relay count zero with TURN configured means
 * the browser never got a relay address (call ends with error 138021).
 */

/**
 * The media direction the answer commits to. `sendrecv` is the only value that
 * lets audio flow both ways; `recvonly` produces error 138021 no matter how
 * healthy the relay is.
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
 * end-of-line, which silently truncates the section to its own `m=` line.
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
 * `a=recvonly` on the audio line.
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
 * incident.
 */
export function canSendAudio(summary: IceCandidateSummary): boolean {
  return (
    summary.direction === "sendrecv" ||
    summary.direction === "sendonly" ||
    summary.direction === "unspecified"
  )
}

/**
 * Why a call is about to be silent. A code, not a sentence, so the log message
 * stays constant and alertable. Ordered by decisiveness: a direction that
 * can't send audio outranks a missing relay.
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
