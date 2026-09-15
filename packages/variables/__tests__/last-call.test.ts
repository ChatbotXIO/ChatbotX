import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindLatestRecordedByContactId,
  mockFindLatestTranscribedByContactId,
  mockGetRecordingSignedUrl,
} = vi.hoisted(() => ({
  mockFindLatestRecordedByContactId: vi.fn(),
  mockFindLatestTranscribedByContactId: vi.fn(),
  mockGetRecordingSignedUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findLatestRecordedByContactId: mockFindLatestRecordedByContactId,
    findLatestTranscribedByContactId: mockFindLatestTranscribedByContactId,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  callRecordingService: {
    getRecordingSignedUrl: mockGetRecordingSignedUrl,
  },
}))

const { getContactLastCallRecording, getContactLastCallTranscript } =
  await import("../src/helpers/last-call")

describe("last call helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getContactLastCallRecording", () => {
    test("returns a presigned recording URL, never the public storage URL", async () => {
      mockFindLatestRecordedByContactId.mockResolvedValue({
        recordingPath: "space/ws-1/calls/call-1.ogg",
        workspaceId: "ws-1",
      })
      mockGetRecordingSignedUrl.mockResolvedValue(
        "https://storage.example.com/space/ws-1/calls/call-1.ogg?X-Signed=1",
      )

      const result = await getContactLastCallRecording("contact-1")

      expect(mockGetRecordingSignedUrl).toHaveBeenCalledWith({
        recordingPath: "space/ws-1/calls/call-1.ogg",
      })
      expect(result).toBe(
        "https://storage.example.com/space/ws-1/calls/call-1.ogg?X-Signed=1",
      )
      expect(result).not.toBe("space/ws-1/calls/call-1.ogg")
    })

    test("a presign failure degrades to null instead of aborting the whole render", async () => {
      mockFindLatestRecordedByContactId.mockResolvedValue({
        id: "call-1",
        recordingPath: "space/ws-1/calls/call-1.ogg",
        workspaceId: "ws-1",
      })
      mockGetRecordingSignedUrl.mockRejectedValue(new Error("storage down"))

      await expect(getContactLastCallRecording("contact-1")).resolves.toBeNull()
    })

    test("returns null when the contact has no recorded call", async () => {
      mockFindLatestRecordedByContactId.mockResolvedValue(undefined)

      const result = await getContactLastCallRecording("contact-1")

      expect(result).toBeNull()
      expect(mockGetRecordingSignedUrl).not.toHaveBeenCalled()
    })

    test("returns null when the call has no recording path", async () => {
      mockFindLatestRecordedByContactId.mockResolvedValue({
        recordingPath: null,
        workspaceId: "ws-1",
      })

      const result = await getContactLastCallRecording("contact-1")

      expect(result).toBeNull()
      expect(mockGetRecordingSignedUrl).not.toHaveBeenCalled()
    })
  })

  describe("getContactLastCallTranscript", () => {
    test("returns the transcript text of the latest transcribed call", async () => {
      mockFindLatestTranscribedByContactId.mockResolvedValue({
        transcript: "hello from the call",
      })

      const result = await getContactLastCallTranscript("contact-1")

      expect(result).toBe("hello from the call")
    })

    test("returns null when there is no transcribed call", async () => {
      mockFindLatestTranscribedByContactId.mockResolvedValue(undefined)

      const result = await getContactLastCallTranscript("contact-1")

      expect(result).toBeNull()
    })
  })
})
