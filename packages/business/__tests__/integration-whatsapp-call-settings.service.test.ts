import { beforeEach, describe, expect, test, vi } from "vitest"

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    updateCallSettings: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: repositoryMock,
  whatsappSignupSessionRepository: {},
  metaCapiEventRepository: {},
  LIVE_RUN_STATUSES: [],
}))

const {
  integrationWhatsappService,
  WhatsappCallTranscriptionRequiresRecordingError,
} = await import("../src/integration-whatsapp/service")

const target = { id: "iw-1", workspaceId: "ws-1" }

describe("integrationWhatsappService.updateCallSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repositoryMock.updateCallSettings.mockResolvedValue({ id: "iw-1" })
  })

  test("turning recording off turns transcription off in the same write", async () => {
    await integrationWhatsappService.updateCallSettings({
      ...target,
      values: { callRecordingEnabled: false },
    })

    expect(repositoryMock.updateCallSettings).toHaveBeenCalledWith({
      ...target,
      values: { callRecordingEnabled: false, callTranscriptionEnabled: false },
      onlyWhileRecording: false,
    })
  })

  test("turning transcription on alone writes only while the number records calls, in the same statement", async () => {
    await integrationWhatsappService.updateCallSettings({
      ...target,
      values: { callTranscriptionEnabled: true },
    })

    expect(repositoryMock.updateCallSettings).toHaveBeenCalledWith({
      ...target,
      values: { callTranscriptionEnabled: true },
      onlyWhileRecording: true,
    })
  })

  test("refuses when that guarded write matched nothing because recording is off, including when it was just turned off", async () => {
    repositoryMock.updateCallSettings.mockResolvedValue(null)

    await expect(
      integrationWhatsappService.updateCallSettings({
        ...target,
        values: { callTranscriptionEnabled: true },
      }),
    ).rejects.toBeInstanceOf(WhatsappCallTranscriptionRequiresRecordingError)
  })

  test("turning transcription on together with recording needs no guard", async () => {
    await integrationWhatsappService.updateCallSettings({
      ...target,
      values: { callRecordingEnabled: true, callTranscriptionEnabled: true },
    })

    expect(repositoryMock.updateCallSettings).toHaveBeenCalledWith({
      ...target,
      values: { callRecordingEnabled: true, callTranscriptionEnabled: true },
      onlyWhileRecording: false,
    })
  })

  test("a change that does not turn transcription on is written unguarded", async () => {
    await integrationWhatsappService.updateCallSettings({
      ...target,
      values: { callRecordingRetentionDays: 30 },
    })

    expect(repositoryMock.updateCallSettings).toHaveBeenCalledWith({
      ...target,
      values: { callRecordingRetentionDays: 30 },
      onlyWhileRecording: false,
    })
  })

  test("an empty change writes nothing", async () => {
    await integrationWhatsappService.updateCallSettings({
      ...target,
      values: {},
    })

    expect(repositoryMock.updateCallSettings).not.toHaveBeenCalled()
  })
})
