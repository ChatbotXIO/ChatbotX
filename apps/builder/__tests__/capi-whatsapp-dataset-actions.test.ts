// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { provisionWhatsappCapiDatasetAction } from "../src/features/integration-whatsapp/actions/provision-capi-dataset.action"
import { setWhatsappCapiDatasetAction } from "../src/features/integration-whatsapp/actions/set-capi-dataset.action"

type SetDatasetHandler = (args: {
  parsedInput: { datasetId: string }
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

type ProvisionHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

const {
  mockAssertWorkspaceSuperAdmin,
  mockWhatsappFindByIdForWorkspace,
  mockSaveDatasetId,
  mockProvisionDatasetNow,
  mockReconnectCapi,
  mockGetDataset,
  mockEnsureDataset,
} = vi.hoisted(() => ({
  mockAssertWorkspaceSuperAdmin: vi.fn(),
  mockWhatsappFindByIdForWorkspace: vi.fn(),
  mockSaveDatasetId: vi.fn(),
  mockProvisionDatasetNow: vi.fn(),
  mockReconnectCapi: vi.fn(),
  mockGetDataset: vi.fn(),
  mockEnsureDataset: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: SetDatasetHandler | ProvisionHandler) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mockAssertWorkspaceSuperAdmin,
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    findByIdForWorkspace: mockWhatsappFindByIdForWorkspace,
  },
  metaConversionsService: {
    saveDatasetId: mockSaveDatasetId,
    provisionDatasetNow: mockProvisionDatasetNow,
    reconnectCapi: mockReconnectCapi,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-meta-conversions", () => ({
  getDataset: mockGetDataset,
  ensureDataset: mockEnsureDataset,
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

describe("whatsapp CAPI dataset actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhatsappFindByIdForWorkspace.mockResolvedValue(whatsappIntegration)
    mockGetDataset.mockResolvedValue("123456789")
    mockSaveDatasetId.mockResolvedValue({
      ...whatsappIntegration,
      datasetId: "123456789",
    })
    mockProvisionDatasetNow.mockResolvedValue("dataset-waba-1")
    mockReconnectCapi.mockResolvedValue(undefined)
  })

  test("set-dataset is superadmin-gated and saves via saveDatasetId with channel whatsapp", async () => {
    await call<SetDatasetHandler>(setWhatsappCapiDatasetAction)({
      parsedInput: { datasetId: "123456789" },
      bindArgsParsedInputs: ["ws-1", "wa-1"],
    })

    expect(mockAssertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mockSaveDatasetId).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        integration: whatsappIntegration,
        datasetId: "123456789",
      }),
    )
  })

  // v1.7 — whatsapp gained `capiDisconnectedAt`, so save-dataset now clears a
  // user-intent disconnect on success, mirroring messenger/instagram.
  test("set-dataset clears the disconnect flag on success", async () => {
    await call<SetDatasetHandler>(setWhatsappCapiDatasetAction)({
      parsedInput: { datasetId: "123456789" },
      bindArgsParsedInputs: ["ws-1", "wa-1"],
    })

    expect(mockReconnectCapi).toHaveBeenCalledWith({
      channel: "whatsapp",
      integration: whatsappIntegration,
    })
  })

  test("provision is superadmin-gated and creates a dataset with resourceType waba", async () => {
    await call<ProvisionHandler>(provisionWhatsappCapiDatasetAction)({
      bindArgsParsedInputs: ["ws-1", "wa-1"],
    })

    expect(mockAssertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mockProvisionDatasetNow).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        integration: whatsappIntegration,
      }),
    )

    const provisionCall = mockProvisionDatasetNow.mock.calls[0]?.[0] as {
      provisionDataset: (input: {
        accessToken: string
        resourceId: string
      }) => Promise<string>
    }
    mockEnsureDataset.mockResolvedValue("dataset-waba-1")
    await provisionCall.provisionDataset({
      accessToken: "token-1",
      resourceId: "waba-1",
    })

    expect(mockEnsureDataset).toHaveBeenCalledWith({
      resourceType: "waba",
      resourceId: "waba-1",
      accessToken: "token-1",
    })
  })

  test("provision clears the disconnect flag on success", async () => {
    await call<ProvisionHandler>(provisionWhatsappCapiDatasetAction)({
      bindArgsParsedInputs: ["ws-1", "wa-1"],
    })

    expect(mockReconnectCapi).toHaveBeenCalledWith({
      channel: "whatsapp",
      integration: whatsappIntegration,
    })
  })

  test("set-dataset raises when the integration does not belong to the workspace", async () => {
    mockWhatsappFindByIdForWorkspace.mockResolvedValueOnce(null)

    await expect(
      call<SetDatasetHandler>(setWhatsappCapiDatasetAction)({
        parsedInput: { datasetId: "123456789" },
        bindArgsParsedInputs: ["ws-1", "wa-missing"],
      }),
    ).rejects.toThrow()

    expect(mockSaveDatasetId).not.toHaveBeenCalled()
  })
})
