// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { connectWhatsappCustomCapiAction } from "../src/features/integration-whatsapp/actions/connect-custom-capi.action"
import { disconnectWhatsappCapiAction } from "../src/features/integration-whatsapp/actions/disconnect-capi.action"

type ConnectCustomHandler = (args: {
  parsedInput: { datasetId: string; accessToken: string }
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

type DisconnectHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

const {
  mockAssertWorkspaceSuperAdmin,
  mockWhatsappFindByIdForWorkspace,
  mockConnectCustomCapi,
  mockDisconnectCapi,
  mockGetDataset,
  MetaConversionsException,
} = vi.hoisted(() => {
  class HoistedMetaConversionsException extends Error {}
  return {
    mockAssertWorkspaceSuperAdmin: vi.fn(),
    mockWhatsappFindByIdForWorkspace: vi.fn(),
    mockConnectCustomCapi: vi.fn(),
    mockDisconnectCapi: vi.fn(),
    mockGetDataset: vi.fn(),
    MetaConversionsException: HoistedMetaConversionsException,
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: ConnectCustomHandler | DisconnectHandler) => handler
  return {
    workspaceActionClient: chain,
    workspaceActionClientAllowExpired: chain,
  }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mockAssertWorkspaceSuperAdmin,
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    findByIdForWorkspace: mockWhatsappFindByIdForWorkspace,
  },
  metaConversionsService: {
    connectCustomCapi: mockConnectCustomCapi,
    disconnectCapi: mockDisconnectCapi,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-meta-conversions", () => ({
  getDataset: mockGetDataset,
  MetaConversionsException,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

const call = <T>(action: unknown) => action as T

const whatsappIntegration = {
  id: "wa-1",
  workspaceId: "ws-1",
  wabaId: "waba-1",
}

describe("whatsapp CAPI connect/disconnect actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhatsappFindByIdForWorkspace.mockResolvedValue(whatsappIntegration)
    mockGetDataset.mockResolvedValue("123456789")
    mockConnectCustomCapi.mockResolvedValue({
      ...whatsappIntegration,
      datasetId: "123456789",
      capiAccessToken: { encrypted: true },
    })
    mockDisconnectCapi.mockResolvedValue({
      ...whatsappIntegration,
      capiDisconnectedAt: new Date("2026-08-14T00:00:00.000Z"),
    })
  })

  test("connect-custom is superadmin-gated and connects via connectCustomCapi with channel whatsapp", async () => {
    await call<ConnectCustomHandler>(connectWhatsappCustomCapiAction)({
      parsedInput: { datasetId: "123456789", accessToken: "manual-token" },
      bindArgsParsedInputs: ["ws-1", "wa-1"],
    })

    expect(mockAssertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mockConnectCustomCapi).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        integration: whatsappIntegration,
        accessToken: "manual-token",
        datasetId: "123456789",
      }),
    )
  })

  test("connect-custom raises when the integration does not belong to the workspace", async () => {
    mockWhatsappFindByIdForWorkspace.mockResolvedValueOnce(null)

    await expect(
      call<ConnectCustomHandler>(connectWhatsappCustomCapiAction)({
        parsedInput: { datasetId: "123456789", accessToken: "manual-token" },
        bindArgsParsedInputs: ["ws-1", "wa-missing"],
      }),
    ).rejects.toThrow()

    expect(mockConnectCustomCapi).not.toHaveBeenCalled()
  })

  test("connect-custom surfaces the Meta error message when validation fails", async () => {
    mockConnectCustomCapi.mockRejectedValueOnce(
      new MetaConversionsException(
        "(#200) App does not have whatsapp_business_manage_events permission",
      ),
    )

    await expect(
      call<ConnectCustomHandler>(connectWhatsappCustomCapiAction)({
        parsedInput: { datasetId: "123456789", accessToken: "bad-token" },
        bindArgsParsedInputs: ["ws-1", "wa-1"],
      }),
    ).rejects.toThrow(
      "(#200) App does not have whatsapp_business_manage_events permission",
    )
  })

  test("connect-custom falls back to a translated error for a non-Meta failure", async () => {
    mockConnectCustomCapi.mockRejectedValueOnce(new Error("network error"))

    await expect(
      call<ConnectCustomHandler>(connectWhatsappCustomCapiAction)({
        parsedInput: { datasetId: "123456789", accessToken: "bad-token" },
        bindArgsParsedInputs: ["ws-1", "wa-1"],
      }),
    ).rejects.toThrow("invalidToken")
  })

  test("disconnect is superadmin-gated, takes no input, and disconnects via disconnectCapi", async () => {
    await call<DisconnectHandler>(disconnectWhatsappCapiAction)({
      bindArgsParsedInputs: ["ws-1", "wa-1"],
    })

    expect(mockAssertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mockDisconnectCapi).toHaveBeenCalledWith({
      channel: "whatsapp",
      integration: whatsappIntegration,
    })
  })

  test("disconnect raises when the integration does not belong to the workspace", async () => {
    mockWhatsappFindByIdForWorkspace.mockResolvedValueOnce(null)

    await expect(
      call<DisconnectHandler>(disconnectWhatsappCapiAction)({
        bindArgsParsedInputs: ["ws-1", "wa-missing"],
      }),
    ).rejects.toThrow()

    expect(mockDisconnectCapi).not.toHaveBeenCalled()
  })
})
