// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const {
  findByIdForWorkspaceMock,
  provisionMock,
  deprovisionMock,
  getCallingSettingsMock,
} = vi.hoisted(() => ({
  findByIdForWorkspaceMock: vi.fn(),
  provisionMock: vi.fn(),
  deprovisionMock: vi.fn(),
  getCallingSettingsMock: vi.fn(),
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

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/env", () => ({
  env: {
    FS_NODES: undefined,
    FS_SIP_DOMAIN: "sip.example.com",
    FS_WSS_URL: "wss://sip.example.com",
    TURN_URL: "turn:sip.example.com",
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  sipProvisioningService: {
    provision: provisionMock,
    deprovision: deprovisionMock,
  },
  parseFreeswitchNodes: (json: string | undefined, fallback: unknown) =>
    json ? JSON.parse(json) : { default: fallback },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByIdForWorkspace: findByIdForWorkspaceMock,
  },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallingSettings: getCallingSettingsMock,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { provisionWhatsappSipAction, deprovisionWhatsappSipAction } =
  await import(
    "../src/features/integration-whatsapp/calling/actions/whatsapp-sip-provisioning.action"
  )
const provisionAction = provisionWhatsappSipAction as unknown as ActionHandler
const deprovisionAction =
  deprovisionWhatsappSipAction as unknown as ActionHandler

const call = (action: ActionHandler) =>
  action({
    bindArgsParsedInputs: ["workspace-1", "integration-1"],
    parsedInput: {},
  })

describe("provisionWhatsappSipAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
    })
    getCallingSettingsMock.mockResolvedValue({
      sip: { servers: [{ sip_user_password: "secret-pass" }] },
    })
  })

  test("throws when the integration is not found", async () => {
    findByIdForWorkspaceMock.mockResolvedValue(null)
    await expect(call(provisionAction)).rejects.toThrow(
      "whatsapp.calls.errors.notFound",
    )
    expect(provisionMock).not.toHaveBeenCalled()
  })

  test("provisions using the resolved node ids and injected password fetcher", async () => {
    provisionMock.mockResolvedValue({ sipProvisioningStatus: "provisioned" })

    const result = await call(provisionAction)

    expect(provisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        nodeIds: ["default"],
      }),
    )
    const fetchSipPassword = provisionMock.mock.calls[0][0].fetchSipPassword
    await expect(fetchSipPassword({ auth: {} })).resolves.toBe("secret-pass")
    expect(result).toEqual({ sipProvisioningStatus: "provisioned" })
  })

  test("wraps a provisioning failure in a localized error", async () => {
    provisionMock.mockRejectedValue(new Error("gateway never came up"))
    await expect(call(provisionAction)).rejects.toThrow(
      "whatsapp.calls.sip.errors.provisionFailed",
    )
  })
})

describe("deprovisionWhatsappSipAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the cleared provisioning status", async () => {
    deprovisionMock.mockResolvedValue({ sipProvisioningStatus: "none" })
    const result = await call(deprovisionAction)
    expect(result).toEqual({ sipProvisioningStatus: "none" })
  })

  test("throws not-found when the service returns null", async () => {
    deprovisionMock.mockResolvedValue(null)
    await expect(call(deprovisionAction)).rejects.toThrow(
      "whatsapp.calls.errors.notFound",
    )
  })

  test("wraps an unexpected deprovisioning failure in a localized error", async () => {
    deprovisionMock.mockRejectedValue(new Error("esl timeout"))
    await expect(call(deprovisionAction)).rejects.toThrow(
      "whatsapp.calls.sip.errors.deprovisionFailed",
    )
  })
})
