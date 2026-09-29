import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { startCallRecorder } from "@/features/integration-whatsapp/calling/voip/call-recorder"

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

type MockTrack = { kind: string }
const makeStream = (label: string): MediaStream =>
  ({
    getTracks: () => [{ kind: "audio" }] as MockTrack[],
    id: label,
  }) as unknown as MediaStream

const createdSources: Array<{
  stream: MediaStream
  connect: ReturnType<typeof vi.fn>
}> = []
const destinationStream = { id: "mixed-destination" } as unknown as MediaStream
let audioContextCloseMock: ReturnType<typeof vi.fn>

class MockAudioContext {
  createMediaStreamSource = vi.fn((stream: MediaStream) => {
    const source = { stream, connect: vi.fn() }
    createdSources.push(source)
    return source
  })
  createMediaStreamDestination = vi.fn(() => ({ stream: destinationStream }))
  close = audioContextCloseMock
}

let mediaRecorderInstances: MockMediaRecorder[] = []

class MockMediaRecorder {
  static isTypeSupportedMock = vi.fn().mockReturnValue(true)
  static isTypeSupported(mimeType: string): boolean {
    return MockMediaRecorder.isTypeSupportedMock(mimeType)
  }

  state: "inactive" | "recording" = "inactive"
  mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start = vi.fn(() => {
    this.state = "recording"
  })
  stop = vi.fn(() => {
    this.state = "inactive"
    this.ondataavailable?.({ data: new Blob(["chunk"]) })
    this.onstop?.()
  })

  constructor(_stream: MediaStream, options: { mimeType: string }) {
    this.mimeType = options.mimeType
    mediaRecorderInstances.push(this)
  }
}

beforeEach(() => {
  createdSources.length = 0
  mediaRecorderInstances = []
  audioContextCloseMock = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal("AudioContext", MockAudioContext)
  vi.stubGlobal("MediaRecorder", MockMediaRecorder)
  MockMediaRecorder.isTypeSupportedMock = vi.fn().mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("startCallRecorder", () => {
  test("mixes the local and remote streams into one destination and starts recording", () => {
    const localStream = makeStream("local")
    const remoteStream = makeStream("remote")

    const recorder = startCallRecorder({
      whatsappCallId: "call-1",
      localStream,
      remoteStream,
      upload: vi.fn().mockResolvedValue(undefined),
    })

    expect(recorder).not.toBeNull()
    expect(createdSources).toHaveLength(2)
    expect(createdSources[0]?.stream).toBe(localStream)
    expect(createdSources[1]?.stream).toBe(remoteStream)
    expect(createdSources[0]?.connect).toHaveBeenCalledWith({
      stream: destinationStream,
    })
    expect(createdSources[1]?.connect).toHaveBeenCalledWith({
      stream: destinationStream,
    })
    expect(mediaRecorderInstances).toHaveLength(1)
    expect(mediaRecorderInstances[0]?.start).toHaveBeenCalled()
  })

  test("negotiates the first supported mime type from the priority list", () => {
    MockMediaRecorder.isTypeSupportedMock = vi
      .fn()
      .mockImplementation((mimeType: string) => mimeType === "audio/mp4")

    startCallRecorder({
      whatsappCallId: "call-1",
      localStream: makeStream("local"),
      remoteStream: makeStream("remote"),
      upload: vi.fn().mockResolvedValue(undefined),
    })

    expect(mediaRecorderInstances[0]?.mimeType).toBe("audio/mp4")
  })

  test("skips recording entirely (returns null, never throws) when no mime type is supported", () => {
    MockMediaRecorder.isTypeSupportedMock = vi.fn().mockReturnValue(false)

    const recorder = startCallRecorder({
      whatsappCallId: "call-1",
      localStream: makeStream("local"),
      remoteStream: makeStream("remote"),
      upload: vi.fn().mockResolvedValue(undefined),
    })

    expect(recorder).toBeNull()
    expect(mediaRecorderInstances).toHaveLength(0)
  })

  test("stop() flushes the final chunk and uploads the assembled blob with the right fields", async () => {
    const upload = vi.fn().mockResolvedValue(undefined)
    const recorder = startCallRecorder({
      whatsappCallId: "call-42",
      localStream: makeStream("local"),
      remoteStream: makeStream("remote"),
      upload,
    })

    recorder?.stop()
    // The upload runs inside `onstop`, asynchronously — flush microtasks.
    await Promise.resolve()
    await Promise.resolve()

    expect(upload).toHaveBeenCalledTimes(1)
    const call = upload.mock.calls[0]?.[0]
    expect(call.whatsappCallId).toBe("call-42")
    expect(call.contentType).toBe("audio/webm")
    expect(call.blob).toBeInstanceOf(Blob)
    expect(audioContextCloseMock).toHaveBeenCalled()
  })

  test("stop() is a no-op the second time it is called", () => {
    const upload = vi.fn().mockResolvedValue(undefined)
    const recorder = startCallRecorder({
      whatsappCallId: "call-1",
      localStream: makeStream("local"),
      remoteStream: makeStream("remote"),
      upload,
    })

    recorder?.stop()
    recorder?.stop()

    expect(mediaRecorderInstances[0]?.stop).toHaveBeenCalledTimes(1)
  })

  test("upload failure is swallowed (logged, never thrown) and still closes the AudioContext", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("network down"))
    const recorder = startCallRecorder({
      whatsappCallId: "call-1",
      localStream: makeStream("local"),
      remoteStream: makeStream("remote"),
      upload,
    })

    expect(() => recorder?.stop()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(upload).toHaveBeenCalledTimes(1)
    expect(audioContextCloseMock).toHaveBeenCalled()
  })
})
