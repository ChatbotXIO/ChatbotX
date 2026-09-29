import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createIfAbsent: vi.fn(),
  updateInterimStatus: vi.fn(),
  attachRecording: vi.fn(),
  markRecordingArrangement: vi.fn(),
  attachTranscript: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: mocks,
}))

const { whatsappCallLifecycleService } = await import(
  "../src/whatsapp-call/call-lifecycle-service"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("whatsappCallLifecycleService", () => {
  test("recordIncomingCall reports whether this delivery won the insert", async () => {
    const input = {
      wacid: "wacid.1",
      direction: "userInitiated" as const,
      status: "ringing" as const,
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
    }
    mocks.createIfAbsent.mockResolvedValue({
      call: { id: "call-1" },
      isNew: false,
    })

    await expect(
      whatsappCallLifecycleService.recordIncomingCall(input),
    ).resolves.toEqual({ call: { id: "call-1" }, isNew: false })
    expect(mocks.createIfAbsent).toHaveBeenCalledWith(input)
  })

  test("advanceInterimStatus resolves to the previous status only when it transitioned", async () => {
    mocks.updateInterimStatus.mockResolvedValueOnce({
      previousStatus: "failed",
    })
    mocks.updateInterimStatus.mockResolvedValueOnce(undefined)
    const input = { wacid: "wacid.1", status: "rejected" as const }

    await expect(
      whatsappCallLifecycleService.advanceInterimStatus(input),
    ).resolves.toEqual({ previousStatus: "failed" })
    await expect(
      whatsappCallLifecycleService.advanceInterimStatus(input),
    ).resolves.toBeUndefined()
    expect(mocks.updateInterimStatus).toHaveBeenCalledWith(input)
  })

  test("attachRecording is undefined when another delivery already stamped it", async () => {
    mocks.attachRecording.mockResolvedValue(undefined)
    const input = {
      id: "call-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
      recordedAt: new Date("2026-09-16T00:00:00.000Z"),
    }

    await expect(
      whatsappCallLifecycleService.attachRecording(input),
    ).resolves.toBeUndefined()
    expect(mocks.attachRecording).toHaveBeenCalledWith(input)
  })

  test("attachTranscript forwards diarized segments", async () => {
    mocks.attachTranscript.mockResolvedValue({ id: "call-1" })
    const input = {
      id: "call-1",
      transcript: "hello",
      transcribedAt: new Date("2026-09-16T00:00:00.000Z"),
      segments: [],
    }

    await expect(
      whatsappCallLifecycleService.attachTranscript(input),
    ).resolves.toEqual({ id: "call-1" })
    expect(mocks.attachTranscript).toHaveBeenCalledWith(input)
  })

  test("markRecordingArrangement forwards the call's recording outcome", async () => {
    mocks.markRecordingArrangement.mockResolvedValue({ id: "call-1" })
    const input = {
      id: "call-1",
      recordingRequested: false,
      recordingFailureReason: "meta-rejected-recording-announcement",
    }

    await expect(
      whatsappCallLifecycleService.markRecordingArrangement(input),
    ).resolves.toEqual({ id: "call-1" })
    expect(mocks.markRecordingArrangement).toHaveBeenCalledWith(input)
  })
})
