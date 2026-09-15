import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  putObject: vi.fn(),
  getPresignedDownload: vi.fn(),
  deleteObject: vi.fn(),
  listRecordingsPastRetention: vi.fn(),
  clearRecording: vi.fn(),
  findById: vi.fn(),
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
    findById: mocks.findById,
  },
}))

const {
  callRecordingService,
  isAllowedRecordingContentType,
  resolveRecordingExtension,
  UnsupportedRecordingContentTypeError,
} = await import("../src/whatsapp-call/call-recording-service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteObject.mockResolvedValue(undefined)
})

describe("callRecordingService.uploadRecording", () => {
  test("uploads to the private space/<ws>/calls/<callId>.ogg key by default (SIP path)", async () => {
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

  test.each([
    ["audio/ogg", "ogg"],
    ["audio/webm", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/mpeg", "mp3"],
  ] as const)("derives the %s extension and passes it as ContentType", async (contentType, extension) => {
    const result = await callRecordingService.uploadRecording({
      callId: "call-1",
      workspaceId: "ws-1",
      body: new Uint8Array([1, 2, 3]),
      contentType,
    })
    expect(result).toEqual({
      recordingPath: `space/ws-1/calls/call-1.${extension}`,
    })
    expect(mocks.putObject).toHaveBeenCalledWith(
      `space/ws-1/calls/call-1.${extension}`,
      expect.anything(),
      expect.objectContaining({ ContentType: contentType }),
    )
  })

  test("throws UnsupportedRecordingContentTypeError for an unknown mime type", async () => {
    await expect(
      callRecordingService.uploadRecording({
        callId: "call-1",
        workspaceId: "ws-1",
        body: new Uint8Array([1, 2, 3]),
        contentType: "video/mp4" as unknown as Parameters<
          typeof callRecordingService.uploadRecording
        >[0]["contentType"],
      }),
    ).rejects.toThrow(UnsupportedRecordingContentTypeError)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })
})

describe("isAllowedRecordingContentType / resolveRecordingExtension", () => {
  test("accepts every allowed mime type", () => {
    for (const [mime, extension] of [
      ["audio/ogg", "ogg"],
      ["audio/webm", "webm"],
      ["audio/mp4", "m4a"],
      ["audio/mpeg", "mp3"],
    ] as const) {
      expect(isAllowedRecordingContentType(mime)).toBe(true)
      expect(resolveRecordingExtension(mime)).toBe(extension)
    }
  })

  test("rejects an unknown mime type", () => {
    expect(isAllowedRecordingContentType("video/mp4")).toBe(false)
    expect(() => resolveRecordingExtension("video/mp4")).toThrow(
      UnsupportedRecordingContentTypeError,
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

describe("callRecordingService.getRecordingUrlForCall", () => {
  test("returns a fresh signed URL for a call belonging to the caller's workspace", async () => {
    mocks.findById.mockResolvedValue({
      id: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
    mocks.getPresignedDownload.mockResolvedValueOnce(
      "https://signed.example/fresh",
    )

    const url = await callRecordingService.getRecordingUrlForCall({
      callId: "call-1",
      workspaceId: "ws-1",
    })

    expect(url).toBe("https://signed.example/fresh")
    expect(mocks.getPresignedDownload).toHaveBeenCalledWith(
      "space/ws-1/calls/call-1.ogg",
      15 * 60,
    )
  })

  test("rejects a call that belongs to a different workspace", async () => {
    mocks.findById.mockResolvedValue({
      id: "call-1",
      workspaceId: "ws-other",
      recordingPath: "space/ws-other/calls/call-1.ogg",
    })

    await expect(
      callRecordingService.getRecordingUrlForCall({
        callId: "call-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Call recording not found")
    expect(mocks.getPresignedDownload).not.toHaveBeenCalled()
  })

  test("rejects when the call has no recording yet", async () => {
    mocks.findById.mockResolvedValue({
      id: "call-1",
      workspaceId: "ws-1",
      recordingPath: null,
    })

    await expect(
      callRecordingService.getRecordingUrlForCall({
        callId: "call-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Call recording not found")
  })

  test("rejects when the call does not exist", async () => {
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      callRecordingService.getRecordingUrlForCall({
        callId: "missing",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Call recording not found")
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
