// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { provisionInstagramCapiDatasetAction } from "../src/features/integration-instagram/actions/provision-capi-dataset.action"
import { setInstagramCapiDatasetAction } from "../src/features/integration-instagram/actions/set-capi-dataset.action"
import { provisionMessengerCapiDatasetAction } from "../src/features/integration-messenger/actions/provision-capi-dataset.action"
import { setMessengerCapiDatasetAction } from "../src/features/integration-messenger/actions/set-capi-dataset.action"

type SetDatasetHandler = (args: {
  parsedInput: { datasetId: string }
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

type ProvisionHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

const {
  mockAssertWorkspaceSuperAdmin,
  mockMessengerFindByIdForWorkspace,
  mockInstagramFindByIdForWorkspace,
  mockSaveDatasetId,
  mockProvisionDatasetNow,
  mockReconnectCapi,
  mockGetDataset,
  mockEnsureDataset,
} = vi.hoisted(() => ({
  mockAssertWorkspaceSuperAdmin: vi.fn(),
  mockMessengerFindByIdForWorkspace: vi.fn(),
  mockInstagramFindByIdForWorkspace: vi.fn(),
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
  messengerIntegrationService: {
    findByIdForWorkspace: mockMessengerFindByIdForWorkspace,
  },
  instagramIntegrationService: {
    findByIdForWorkspace: mockInstagramFindByIdForWorkspace,
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

const messengerIntegration = {
  id: "im-1",
  workspaceId: "ws-1",
  pageId: "page-1",
}

const instagramIntegration = {
  id: "ig-1",
  workspaceId: "ws-1",
  igId: "ig-user-1",
  type: "facebook",
}

describe("messenger/instagram set-dataset + provision actions clear a user-intent disconnect on success", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMessengerFindByIdForWorkspace.mockResolvedValue(messengerIntegration)
    mockInstagramFindByIdForWorkspace.mockResolvedValue(instagramIntegration)
    mockGetDataset.mockResolvedValue("123456789")
    mockSaveDatasetId.mockResolvedValue(messengerIntegration)
    mockProvisionDatasetNow.mockResolvedValue("dataset-1")
    mockReconnectCapi.mockResolvedValue(undefined)
  })

  test("messenger set-dataset saves the dataset id and clears the disconnect flag", async () => {
    await call<SetDatasetHandler>(setMessengerCapiDatasetAction)({
      parsedInput: { datasetId: "123456789" },
      bindArgsParsedInputs: ["ws-1", "im-1"],
    })

    expect(mockSaveDatasetId).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        integration: messengerIntegration,
        datasetId: "123456789",
      }),
    )
    expect(mockReconnectCapi).toHaveBeenCalledWith({
      channel: "messenger",
      integration: messengerIntegration,
    })
  })

  test("messenger provision creates the dataset and clears the disconnect flag", async () => {
    await call<ProvisionHandler>(provisionMessengerCapiDatasetAction)({
      bindArgsParsedInputs: ["ws-1", "im-1"],
    })

    expect(mockProvisionDatasetNow).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        integration: messengerIntegration,
      }),
    )
    expect(mockReconnectCapi).toHaveBeenCalledWith({
      channel: "messenger",
      integration: messengerIntegration,
    })
  })

  test("instagram set-dataset saves the dataset id and clears the disconnect flag", async () => {
    await call<SetDatasetHandler>(setInstagramCapiDatasetAction)({
      parsedInput: { datasetId: "123456789" },
      bindArgsParsedInputs: ["ws-1", "ig-1"],
    })

    expect(mockSaveDatasetId).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        integration: instagramIntegration,
        datasetId: "123456789",
      }),
    )
    expect(mockReconnectCapi).toHaveBeenCalledWith({
      channel: "instagram",
      integration: instagramIntegration,
    })
  })

  test("instagram provision creates the dataset and clears the disconnect flag", async () => {
    await call<ProvisionHandler>(provisionInstagramCapiDatasetAction)({
      bindArgsParsedInputs: ["ws-1", "ig-1"],
    })

    expect(mockProvisionDatasetNow).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        integration: instagramIntegration,
      }),
    )
    expect(mockReconnectCapi).toHaveBeenCalledWith({
      channel: "instagram",
      integration: instagramIntegration,
    })
  })

  test("does not clear the disconnect flag when dataset validation fails", async () => {
    mockSaveDatasetId.mockRejectedValueOnce(new Error("invalid dataset"))

    await expect(
      call<SetDatasetHandler>(setMessengerCapiDatasetAction)({
        parsedInput: { datasetId: "123456789" },
        bindArgsParsedInputs: ["ws-1", "im-1"],
      }),
    ).rejects.toThrow()

    expect(mockReconnectCapi).not.toHaveBeenCalled()
  })
})
