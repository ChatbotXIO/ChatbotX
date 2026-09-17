// @vitest-environment node

import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

type UpdateCallingSettingsHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const {
  findWorkspaceIntegrationMock,
  runActionMock,
  updateCallSettingsMock,
  TranscriptionRequiresRecordingError,
} = vi.hoisted(() => ({
  findWorkspaceIntegrationMock: vi.fn(),
  runActionMock: vi.fn(),
  updateCallSettingsMock: vi.fn(),
  TranscriptionRequiresRecordingError: class extends Error {},
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async () => ({})),
  integrationWhatsappService: {
    findWorkspaceIntegration: findWorkspaceIntegrationMock,
    updateCallSettings: updateCallSettingsMock,
  },
  WhatsappCallTranscriptionRequiresRecordingError:
    TranscriptionRequiresRecordingError,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallingSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  mapToChannelError: (error: unknown) => error,
  readWhatsappOriginErrorDetail: (originError: unknown) => {
    const error = (originError as { error?: Record<string, unknown> })?.error
    return {
      userTitle: error?.error_user_title,
      userMessage: error?.error_user_msg,
    }
  },
}))

vi.mock("@/integration", () => ({
  integrations: { whatsapp: { runAction: runActionMock } },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { updateWhatsappCallingSettingsAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/update-calling-settings.action"
)
const action =
  updateWhatsappCallingSettingsAction as unknown as UpdateCallingSettingsHandler

const call = (
  parsedInput: Record<string, unknown>,
  integrationId = "integration-1",
) =>
  action({
    bindArgsParsedInputs: ["workspace-1", integrationId],
    parsedInput,
  })

const enableCalling = () => call({ status: "ENABLED" })

describe("updateWhatsappCallingSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findWorkspaceIntegrationMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
    })
    updateCallSettingsMock.mockResolvedValue({})
    runActionMock.mockResolvedValue(undefined)
  })

  test("surfaces Meta's user-facing message when calling cannot be enabled", async () => {
    runActionMock.mockRejectedValueOnce(
      new ChannelError(
        "Calling cannot be enabled",
        ChannelErrorCategory.PAYLOAD_INVALID,
      ).setOriginError({
        error: {
          code: 138_015,
          error_user_title: "Calling Cannot Be Enabled",
          error_user_msg:
            "Calling APIs cannot be enabled for this phone number.",
        },
      }),
    )

    await expect(enableCalling()).rejects.toThrow(
      "Calling APIs cannot be enabled for this phone number.",
    )
  })

  test("falls back to Meta's error message when no user-facing text exists", async () => {
    runActionMock.mockRejectedValueOnce(
      new ChannelError(
        "(#141000) The phone number is not a valid Cloud API number",
        ChannelErrorCategory.PAYLOAD_INVALID,
      ),
    )

    await expect(enableCalling()).rejects.toThrow(
      "(#141000) The phone number is not a valid Cloud API number",
    )
  })

  test("falls back to the translated message when Meta sent nothing readable", async () => {
    runActionMock.mockRejectedValueOnce(
      new ChannelError("", ChannelErrorCategory.UNKNOWN),
    )

    await expect(enableCalling()).rejects.toThrow(
      "whatsapp.calls.errors.updateFailed",
    )
  })

  test("writes recording/retention/transcription settings locally without a Meta round-trip", async () => {
    await call({
      recordingEnabled: true,
      callRecordingRetentionDays: 30,
      callTranscriptionEnabled: true,
    })

    expect(updateCallSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        values: {
          callRecordingEnabled: true,
          callRecordingRetentionDays: 30,
          callTranscriptionEnabled: true,
        },
      }),
    )
    expect(runActionMock).not.toHaveBeenCalled()
  })

  test("explains, in the operator's language, that transcription needs recording", async () => {
    updateCallSettingsMock.mockRejectedValueOnce(
      new TranscriptionRequiresRecordingError("requires recording"),
    )

    await expect(call({ callTranscriptionEnabled: true })).rejects.toThrow(
      "whatsapp.calls.errors.transcriptionRequiresRecording",
    )
  })
})
