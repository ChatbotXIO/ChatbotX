import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  putObject: vi.fn(),
  getPresignedDownload: vi.fn(),
  deleteObject: vi.fn(),
  listRecordingsPastRetention: vi.fn(),
  clearRecording: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    putObject: mocks.putObject,
    getPresignedDownload: mocks.getPresignedDownload,
    deleteObject: mocks.deleteObject,
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    listRecordingsPastRetention: mocks.listRecordingsPastRetention,
    clearRecording: mocks.clearRecording,
  },
}))

const { callRecordingService } = await import(
  "../src/whatsapp-call/call-recording-service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteObject.mockResolvedValue(undefined)
})

describe("callRecordingService.uploadRecording", () => {
  test("uploads to the private space/<ws>/calls/<callId>.ogg key", async () => {
    const result = await callRecordingService.uploadRecording({
      callId: "call-1",
      workspaceId: "ws-1",
      body: new Uint8Array([1, 2, 3]),
    })
    expect(result).toEqual({ recordingPath: "space/ws-1/calls/call-1.ogg" })
    expect(mocks.putObject).toHaveBeenCalledWith(
      "space/ws-1/calls/call-1.ogg",
      expect.anything(),
      expect.objectContaining({ ContentType: "audio/ogg" }),
    )
  })
})

describe("callRecordingService.getRecordingSignedUrl", () => {
  test("requests a 15-minute signed URL, never a public one", async () => {
    mocks.getPresignedDownload.mockResolvedValueOnce("https://signed.example/x")
    const url = await callRecordingService.getRecordingSignedUrl({
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
    expect(url).toBe("https://signed.example/x")
    expect(mocks.getPresignedDownload).toHaveBeenCalledWith(
      "space/ws-1/calls/call-1.ogg",
      15 * 60,
    )
  })
})

describe("callRecordingService.purgeExpiredRecordings", () => {
  test("deletes the object and clears the row for every expired recording", async () => {
    mocks.listRecordingsPastRetention.mockResolvedValueOnce([
      { id: "call-1", recordingPath: "space/ws-1/calls/call-1.ogg" },
      { id: "call-2", recordingPath: "space/ws-1/calls/call-2.ogg" },
    ])

    const purged = await callRecordingService.purgeExpiredRecordings({
      batchSize: 10,
    })

    expect(purged).toBe(2)
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      "space/ws-1/calls/call-1.ogg",
    )
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      "space/ws-1/calls/call-2.ogg",
    )
    expect(mocks.clearRecording).toHaveBeenCalledWith({ id: "call-1" })
    expect(mocks.clearRecording).toHaveBeenCalledWith({ id: "call-2" })
  })

  test("a missing S3 object does not block clearing the DB columns", async () => {
    mocks.listRecordingsPastRetention.mockResolvedValueOnce([
      { id: "call-1", recordingPath: "space/ws-1/calls/call-1.ogg" },
    ])
    mocks.deleteObject.mockRejectedValueOnce(new Error("NoSuchKey"))

    const purged = await callRecordingService.purgeExpiredRecordings({})
    expect(purged).toBe(1)
    expect(mocks.clearRecording).toHaveBeenCalledWith({ id: "call-1" })
  })

  test("skips rows without a recordingPath", async () => {
    mocks.listRecordingsPastRetention.mockResolvedValueOnce([
      { id: "call-1", recordingPath: null },
    ])
    const purged = await callRecordingService.purgeExpiredRecordings({})
    expect(purged).toBe(0)
    expect(mocks.clearRecording).not.toHaveBeenCalled()
  })
})
