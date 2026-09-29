import { describe, expect, test } from "vitest"
import {
  canSendAudio,
  diagnoseAnswerShape,
  summarizeIceCandidates,
} from "../src/whatsapp-call/ice-candidate-summary"

/**
 * Shape taken from a real answer SDP: host candidates on every interface plus
 * one server-reflexive address, and no relay — the signature of a call that
 * connects and then stays silent.
 */
const ANSWER_WITHOUT_RELAY = [
  "v=0",
  "m=audio 8921 UDP/TLS/RTP/SAVPF 111 126",
  "a=candidate:2507929834 1 udp 2122194687 192.168.139.3 54164 typ host generation 0 network-id 1",
  "a=candidate:2045333743 1 udp 2121998079 192.168.1.5 60663 typ host generation 0 network-id 5 network-cost 10",
  "a=candidate:957555270 1 udp 1685790463 171.225.184.199 8921 typ srflx raddr 192.168.1.5 rport 60663 generation 0",
  "a=candidate:2269348987 1 tcp 1518018303 192.168.1.5 9 typ host tcptype active generation 0",
  "a=ice-ufrag:wUbR",
].join("\r\n")

const ANSWER_WITH_RELAY = `${ANSWER_WITHOUT_RELAY}\r\na=candidate:1853887674 1 udp 41885439 46.225.60.92 49210 typ relay raddr 171.225.184.199 rport 8921 generation 0`

describe("summarizeIceCandidates", () => {
  test("reports no relay when the browser never reached TURN", () => {
    const summary = summarizeIceCandidates(ANSWER_WITHOUT_RELAY)

    expect(summary.relay).toBe(0)
    expect(summary.host).toBe(3)
    expect(summary.srflx).toBe(1)
  })

  test("counts a relay candidate once TURN is working", () => {
    expect(summarizeIceCandidates(ANSWER_WITH_RELAY).relay).toBe(1)
  })

  test("returns zeroes for an SDP with no candidates at all", () => {
    expect(
      summarizeIceCandidates("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111"),
    ).toEqual({
      host: 0,
      srflx: 0,
      relay: 0,
      other: 0,
      direction: "unspecified",
    })
  })

  test("counts peer-reflexive candidates separately so the totals add up", () => {
    const sdp = `${ANSWER_WITHOUT_RELAY}\r\na=candidate:1 1 udp 1 1.2.3.4 1 typ prflx generation 0`
    const summary = summarizeIceCandidates(sdp)

    expect(summary.other).toBe(1)
    // 3 host + 1 srflx in the base SDP, plus the prflx added here.
    expect(summary.host + summary.srflx + summary.relay + summary.other).toBe(5)
  })

  test("never returns any SDP content — only counts and a fixed direction", () => {
    const summary = summarizeIceCandidates(ANSWER_WITH_RELAY)

    // Guards the logging contract: this object is spread straight into a log
    // line, so an address, ufrag or fingerprint leaking in would put it in the
    // logs. Counts are numbers; `direction` is the one string, and it can only
    // ever be one of the fixed SDP direction tokens.
    const { direction, ...counts } = summary
    expect(Object.values(counts).every((v) => typeof v === "number")).toBe(true)
    expect([
      "sendrecv",
      "sendonly",
      "recvonly",
      "inactive",
      "unspecified",
    ]).toContain(direction)
    expect(JSON.stringify(summary)).not.toContain("192.168")
    expect(JSON.stringify(summary)).not.toContain("46.225")
    expect(JSON.stringify(summary)).not.toContain("wUbR")
  })

  test("is not confused by the literal word 'relay' elsewhere in the SDP", () => {
    const sdp =
      "a=candidate:1 1 udp 1 1.2.3.4 1 typ host generation 0\r\na=label:relay-test"

    expect(summarizeIceCandidates(sdp).relay).toBe(0)
  })
})

describe("summarizeIceCandidates — media direction", () => {
  // The direction is the stronger of the two silent-call causes: a `recvonly`
  // answer means the browser committed to never sending RTP, so Meta reports
  // "no media was received from the business" no matter how good the relay is.
  test.each([
    "sendrecv",
    "sendonly",
    "recvonly",
    "inactive",
  ] as const)("reads a=%s from the answer", (direction) => {
    const sdp = `${ANSWER_WITHOUT_RELAY}\r\na=${direction}\r\na=rtcp-mux`

    expect(summarizeIceCandidates(sdp).direction).toBe(direction)
  })

  test("an absent direction attribute reads as unspecified, which RFC 4566 defines as sendrecv", () => {
    const summary = summarizeIceCandidates(ANSWER_WITHOUT_RELAY)

    expect(summary.direction).toBe("unspecified")
    // Naming the wrong cause in an incident log is worse than naming none.
    expect(canSendAudio(summary)).toBe(true)
    expect(diagnoseAnswerShape(summary)).not.toBe("cannotSendAudio")
  })

  test("is not fooled by a direction appearing inside another attribute", () => {
    const sdp = `${ANSWER_WITHOUT_RELAY}\r\na=msid-semantic: WMS recvonly-stream`

    expect(summarizeIceCandidates(sdp).direction).toBe("unspecified")
  })
})

describe("diagnoseAnswerShape", () => {
  const shape = (
    over: Partial<ReturnType<typeof summarizeIceCandidates>>,
  ): ReturnType<typeof summarizeIceCandidates> => ({
    host: 4,
    srflx: 1,
    relay: 1,
    other: 0,
    direction: "sendrecv",
    ...over,
  })

  test("a healthy answer reports healthy", () => {
    expect(diagnoseAnswerShape(shape({}))).toBe("healthy")
  })

  test("a missing relay is reported when audio can still be sent", () => {
    expect(diagnoseAnswerShape(shape({ relay: 0 }))).toBe("noRelay")
  })

  test("a recvonly answer outranks a missing relay — no relay can carry unsent audio", () => {
    expect(
      diagnoseAnswerShape(shape({ direction: "recvonly", relay: 0 })),
    ).toBe("cannotSendAudio")
  })

  test.each([
    "recvonly",
    "inactive",
  ] as const)("%s cannot send audio", (direction) => {
    expect(canSendAudio(shape({ direction }))).toBe(false)
  })

  // `unspecified` belongs here: RFC 4566 §6 makes an absent direction
  // attribute mean `sendrecv`.
  test.each([
    "sendrecv",
    "sendonly",
    "unspecified",
  ] as const)("%s can send audio", (direction) => {
    expect(canSendAudio(shape({ direction }))).toBe(true)
  })
})

describe("summarizeIceCandidates — direction is read from the audio section", () => {
  // A direction attribute is legal at session level and applies as a default to
  // every media section, so a session-level `sendrecv` must not mask an
  // `a=recvonly` on the audio line — that is the exact case this helper exists
  // to name correctly.
  test("a session-level direction does not mask the audio section's own", () => {
    const sdp = [
      "v=0",
      "o=- 0 0 IN IP4 127.0.0.1",
      "a=sendrecv",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=recvonly",
    ].join("\r\n")

    const summary = summarizeIceCandidates(sdp)

    expect(summary.direction).toBe("recvonly")
    expect(diagnoseAnswerShape(summary)).toBe("cannotSendAudio")
  })

  test("a later media section's direction does not override the audio one", () => {
    const sdp = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=sendrecv",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "a=inactive",
    ].join("\r\n")

    expect(summarizeIceCandidates(sdp).direction).toBe("sendrecv")
  })
})
