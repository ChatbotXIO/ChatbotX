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
  getCallingSettingsMock,
  updateCallSettingsMock,
  updateSipProvisioningMock,
} = vi.hoisted(() => ({
  findWorkspaceIntegrationMock: vi.fn(),
  runActionMock: vi.fn(),
  getCallingSettingsMock: vi.fn(),
  updateCallSettingsMock: vi.fn(),
  updateSipProvisioningMock: vi.fn(),
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

const FREESWITCH_NODES = {
  "node-a": {
    sipDomain: "sip.example.com",
    wssUrl: "wss://sip.example.com:7443",
    turnUrl: "turn:sip.example.com:3478",
  },
}

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async () => ({})),
  integrationWhatsappService: {
    findWorkspaceIntegration: findWorkspaceIntegrationMock,
  },
  assertSipProvisioningTransition: vi.fn(),
  parseFreeswitchNodes: () => FREESWITCH_NODES,
  resolveFreeswitchNode: (
    nodes: Record<string, { sipDomain: string }>,
    nodeId: string,
  ) => {
    const node = nodes[nodeId]
    if (!node) {
      throw new Error(`unknown-freeswitch-node: ${nodeId}`)
    }
    return node
  },
}))

vi.mock("@/env", () => ({
  env: { FS_NODES: undefined, FS_SIP_DOMAIN: "sip.example.com" },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    updateCallSettings: updateCallSettingsMock,
    updateSipProvisioning: updateSipProvisioningMock,
  },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallingSettings: getCallingSettingsMock,
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
      sipProvisioningStatus: "provisioned",
      sipProvisioningClaim: "claim-1",
      sipNodeId: "node-a",
    })
    updateCallSettingsMock.mockResolvedValue({})
    updateSipProvisioningMock.mockResolvedValue({
      id: "integration-1",
      sipProvisioningStatus: "enabled",
    })
    runActionMock.mockResolvedValue(undefined)
    getCallingSettingsMock.mockResolvedValue({
      status: "ENABLED",
      sip: { status: "ENABLED" },
    })
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

  test("refuses to enable SIP calling unless provisioned", async () => {
    findWorkspaceIntegrationMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      sipProvisioningStatus: "none",
      sipProvisioningClaim: null,
      sipNodeId: null,
    })

    await expect(call({ sipEnabled: true })).rejects.toThrow(
      "whatsapp.calls.sip.errors.notProvisioned",
    )
    expect(runActionMock).not.toHaveBeenCalled()
  })

  test("enabling SIP with an unknown node id fails before touching Meta", async () => {
    findWorkspaceIntegrationMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      sipProvisioningStatus: "provisioned",
      sipProvisioningClaim: "claim-1",
      sipNodeId: "node-that-does-not-exist",
    })

    await expect(call({ sipEnabled: true })).rejects.toThrow(
      "unknown-freeswitch-node",
    )
    expect(runActionMock).not.toHaveBeenCalled()
  })

  test("enabling SIP sends SDES + codecs + the node's public SIP hostname (not the node id)", async () => {
    await call({ sipEnabled: true })

    expect(runActionMock).toHaveBeenCalledWith(
      "updateCallingSettings",
      expect.objectContaining({
        data: expect.objectContaining({
          sip: {
            status: "ENABLED",
            webhook_delivery: "ENABLED",
            servers: [{ hostname: "sip.example.com", port: 5061 }],
          },
          srtp_key_exchange_protocol: "SDES",
          audio: { additional_codecs: ["PCMA", "PCMU"] },
        }),
      }),
    )
  })

  test("read-back mismatch after enabling surfaces an error and never advances the state machine", async () => {
    getCallingSettingsMock.mockResolvedValue({
      status: "ENABLED",
      sip: { status: "DISABLED" },
    })

    await expect(call({ sipEnabled: true })).rejects.toThrow(
      "whatsapp.calls.sip.errors.readBackMismatch",
    )
    expect(updateSipProvisioningMock).not.toHaveBeenCalled()
  })

  test("enabling SIP transitions provisioned -> enabled after a matching read-back", async () => {
    await call({ sipEnabled: true })

    expect(updateSipProvisioningMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "integration-1",
        workspaceId: "workspace-1",
        claim: "claim-1",
        values: { sipProvisioningStatus: "enabled" },
      }),
    )
  })

  test("disabling SIP sends sip.status DISABLED and transitions enabled -> provisioned", async () => {
    findWorkspaceIntegrationMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      sipProvisioningStatus: "enabled",
      sipProvisioningClaim: "claim-1",
      sipNodeId: "node-a",
    })
    getCallingSettingsMock.mockResolvedValue({
      status: "ENABLED",
      sip: { status: "DISABLED" },
    })

    await call({ sipEnabled: false })

    expect(runActionMock).toHaveBeenCalledWith(
      "updateCallingSettings",
      expect.objectContaining({ data: { sip: { status: "DISABLED" } } }),
    )
    expect(updateSipProvisioningMock).toHaveBeenCalledWith(
      expect.objectContaining({
        values: { sipProvisioningStatus: "provisioned" },
      }),
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
})
