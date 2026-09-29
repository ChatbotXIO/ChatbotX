import { describe, expect, test, vi } from "vitest"
import { attachMicrophone } from "@/features/integration-whatsapp/calling/voip/voip-peer-connection"

/** Only the two members `attachMicrophone` touches. */
const makePeerConnection = () => ({
  addTrack: vi.fn(),
  addTransceiver: vi.fn(),
})

const makeStream = (audioTrackCount: number) => {
  const tracks = Array.from({ length: audioTrackCount }, (_, index) => ({
    id: `audio-${index}`,
    kind: "audio",
  }))
  return {
    getAudioTracks: () => tracks,
    tracks,
  }
}

describe("attachMicrophone", () => {
  test("adds the microphone track to the peer connection", () => {
    const peerConnection = makePeerConnection()
    const stream = makeStream(1)

    const attached = attachMicrophone(
      peerConnection as unknown as RTCPeerConnection,
      stream as unknown as MediaStream,
    )

    expect(attached).toBe(true)
    expect(peerConnection.addTrack).toHaveBeenCalledWith(
      stream.tracks[0],
      stream,
    )
  })

  test("never uses addTransceiver — that is the pattern that produces a recvonly answer", () => {
    const peerConnection = makePeerConnection()

    attachMicrophone(
      peerConnection as unknown as RTCPeerConnection,
      makeStream(1) as unknown as MediaStream,
    )

    expect(peerConnection.addTransceiver).not.toHaveBeenCalled()
  })

  test("reports false for a stream with no audio track, so callers can refuse to continue", () => {
    const peerConnection = makePeerConnection()

    const attached = attachMicrophone(
      peerConnection as unknown as RTCPeerConnection,
      makeStream(0) as unknown as MediaStream,
    )

    expect(attached).toBe(false)
    expect(peerConnection.addTrack).not.toHaveBeenCalled()
  })

  test("attaches exactly one track even when the stream carries several", () => {
    // A second audio track would add a second audio m-line, which Meta rejects
    // — on the very helper whose job is producing a valid SDP.
    const peerConnection = makePeerConnection()
    const stream = makeStream(2)

    const attached = attachMicrophone(
      peerConnection as unknown as RTCPeerConnection,
      stream as unknown as MediaStream,
    )

    expect(attached).toBe(true)
    expect(peerConnection.addTrack).toHaveBeenCalledTimes(1)
    expect(peerConnection.addTrack).toHaveBeenCalledWith(
      stream.tracks[0],
      stream,
    )
  })
})
