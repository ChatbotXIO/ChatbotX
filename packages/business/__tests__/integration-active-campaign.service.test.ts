import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteWhere: vi.fn(),
  encryptObject: vi.fn(),
  findFirst: vi.fn(),
  transaction: vi.fn(),
  txDelete: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  updateWhere: vi.fn(),
}))

const updateChain = {
  set: vi.fn(() => ({
    where: mocks.updateWhere,
  })),
}

vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationActiveCampaignModel: { findFirst: mocks.findFirst },
    },
    update: vi.fn(() => updateChain),
    transaction: mocks.transaction,
  },
  eq: vi.fn(),
  isDatabaseError: vi.fn().mockReturnValue(false),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationActiveCampaignModel: {
    id: "active-campaign-id",
    workspaceId: "workspace-id",
  },
  integrationModel: { id: "integration-id" },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptObject: mocks.encryptObject },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { integrationActiveCampaignService } = await import(
  "../src/integration-active-campaign/service"
)

const uniqueError = (constraint: string) =>
  Object.assign(new Error("unique violation"), {
    cause: { code: "23505", constraint },
  })

describe("IntegrationActiveCampaignService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.encryptObject.mockResolvedValue({ encrypted: true })
    mocks.updateWhere.mockResolvedValue(undefined)
    mocks.txInsert.mockImplementation(() => ({ values: mocks.txInsertValues }))
    mocks.txDelete.mockImplementation(() => ({ where: mocks.deleteWhere }))
  })

  test("finds a workspace integration and fails when missing", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "active-campaign-1" })
    mocks.findFirst.mockResolvedValueOnce(undefined)

    await expect(
      integrationActiveCampaignService.findByWorkspaceIdOrFail("workspace-1"),
    ).resolves.toEqual({ id: "active-campaign-1" })
    await expect(
      integrationActiveCampaignService.findByWorkspaceIdOrFail("workspace-1"),
    ).rejects.toThrow("ActiveCampaign integration not found")
  })

  test("encrypts and updates an existing workspace integration", async () => {
    mocks.findFirst.mockResolvedValue({ id: "active-campaign-1" })

    await expect(
      integrationActiveCampaignService.upsert({
        workspaceId: "workspace-1",
        auth: {
          authType: "custom",
          apiUrl: "https://example.api-us1.com",
          apiKey: "secret",
        },
      }),
    ).resolves.toBe("active-campaign-1")

    expect(mocks.encryptObject).toHaveBeenCalledWith({
      authType: "custom",
      apiUrl: "https://example.api-us1.com",
      apiKey: "secret",
    })
    expect(mocks.updateWhere).toHaveBeenCalledTimes(1)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("creates parent and encrypted child atomically when absent", async () => {
    mocks.findFirst.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(
      async (run: (tx: unknown) => unknown) => run({ insert: mocks.txInsert }),
    )

    await expect(
      integrationActiveCampaignService.upsert({
        workspaceId: "workspace-1",
        auth: {
          authType: "custom",
          apiUrl: "https://example.api-us1.com",
          apiKey: "secret",
        },
      }),
    ).resolves.toBeTypeOf("string")

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: "workspace-1",
        integrationType: "activeCampaign",
      }),
    )
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: "workspace-1",
        auth: { encrypted: true },
      }),
    )
  })

  test("recovers only from the workspace unique race", async () => {
    const error = uniqueError("IntegrationActiveCampaign_workspaceId_key")
    const { isDatabaseError } = await import("@chatbotx.io/database/client")
    vi.mocked(isDatabaseError).mockImplementation(
      (caught: unknown) => caught === error,
    )
    mocks.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "winner-id" })
    mocks.transaction.mockRejectedValue(error)

    await expect(
      integrationActiveCampaignService.upsert({
        workspaceId: "workspace-1",
        auth: {
          authType: "custom",
          apiUrl: "https://example.api-us1.com",
          apiKey: "secret",
        },
      }),
    ).resolves.toBe("winner-id")
  })

  test("propagates unrelated unique errors and a missing race winner", async () => {
    const unrelated = uniqueError("IntegrationActiveCampaign_integrationId_key")
    const winnerMissing = uniqueError(
      "IntegrationActiveCampaign_workspaceId_key",
    )
    const { isDatabaseError } = await import("@chatbotx.io/database/client")
    vi.mocked(isDatabaseError).mockImplementation(
      (caught: unknown) => caught === unrelated || caught === winnerMissing,
    )
    mocks.findFirst.mockResolvedValue(undefined)
    mocks.transaction
      .mockRejectedValueOnce(unrelated)
      .mockRejectedValueOnce(winnerMissing)

    const upsert = () =>
      integrationActiveCampaignService.upsert({
        workspaceId: "workspace-1",
        auth: {
          authType: "custom",
          apiUrl: "https://example.api-us1.com",
          apiKey: "secret",
        },
      })

    await expect(upsert()).rejects.toBe(unrelated)
    await expect(upsert()).rejects.toBe(winnerMissing)
  })

  test("disconnects parent and child atomically and is a no-op when absent", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({
        id: "active-campaign-1",
        integrationId: "integration-1",
      })
      .mockResolvedValueOnce(undefined)
    mocks.transaction.mockImplementation(
      async (run: (tx: unknown) => unknown) => run({ delete: mocks.txDelete }),
    )

    await integrationActiveCampaignService.disconnect("workspace-1")
    await integrationActiveCampaignService.disconnect("workspace-1")

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.txDelete).toHaveBeenCalledTimes(2)
  })
})
