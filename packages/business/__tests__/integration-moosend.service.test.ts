import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteWhere: vi.fn(),
  encryptObject: vi.fn(),
  findFirst: vi.fn(),
  transaction: vi.fn(),
  txDelete: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  updateReturning: vi.fn(),
}))

const updateChain = {
  set: vi.fn(() => ({
    where: vi.fn(() => ({ returning: mocks.updateReturning })),
  })),
}

vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationMoosendModel: { findFirst: mocks.findFirst },
    },
    update: vi.fn(() => updateChain),
    transaction: mocks.transaction,
  },
  eq: vi.fn(),
  isDatabaseError: vi.fn().mockReturnValue(false),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationModel: { id: "integration-id" },
  integrationMoosendModel: {
    id: "moosend-id",
    workspaceId: "workspace-id",
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptObject: mocks.encryptObject },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { integrationMoosendService } = await import(
  "../src/integration-moosend/service"
)

const uniqueError = (constraint: string) =>
  Object.assign(new Error("unique violation"), {
    cause: { code: "23505", constraint },
  })

describe("IntegrationMoosendService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.encryptObject.mockResolvedValue({ encrypted: true })
    mocks.txInsert.mockImplementation(() => ({ values: mocks.txInsertValues }))
    mocks.txDelete.mockImplementation(() => ({ where: mocks.deleteWhere }))
  })

  test("finds a workspace integration and fails when missing", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "moosend-1" })
    mocks.findFirst.mockResolvedValueOnce(undefined)

    await expect(
      integrationMoosendService.findByWorkspaceIdOrFail("workspace-1"),
    ).resolves.toEqual({ id: "moosend-1" })
    await expect(
      integrationMoosendService.findByWorkspaceIdOrFail("workspace-1"),
    ).rejects.toThrow("Moosend integration not found")
  })

  test("encrypts and updates an existing workspace integration", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: "moosend-1" }])

    await expect(
      integrationMoosendService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBe("moosend-1")

    expect(mocks.encryptObject).toHaveBeenCalledWith({
      authType: "custom",
      apiKey: "secret",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("creates parent and encrypted child atomically when absent", async () => {
    mocks.updateReturning.mockResolvedValue([])
    mocks.transaction.mockImplementation(
      async (run: (tx: unknown) => unknown) => run({ insert: mocks.txInsert }),
    )

    await expect(
      integrationMoosendService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBeTypeOf("string")

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: "workspace-1",
        integrationType: "moosend",
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
    const error = uniqueError("IntegrationMoosend_workspaceId_key")
    const { isDatabaseError } = await import("@chatbotx.io/database/client")
    vi.mocked(isDatabaseError).mockImplementation(
      (caught: unknown) => caught === error,
    )
    mocks.updateReturning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "winner-id" }])
    mocks.transaction.mockRejectedValue(error)

    await expect(
      integrationMoosendService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBe("winner-id")
  })

  test("propagates unrelated unique errors and a missing race winner", async () => {
    const unrelated = uniqueError("IntegrationMoosend_integrationId_key")
    const winnerMissing = uniqueError("IntegrationMoosend_workspaceId_key")
    const { isDatabaseError } = await import("@chatbotx.io/database/client")
    vi.mocked(isDatabaseError).mockImplementation(
      (caught: unknown) => caught === unrelated || caught === winnerMissing,
    )
    mocks.updateReturning.mockResolvedValue([])
    mocks.transaction
      .mockRejectedValueOnce(unrelated)
      .mockRejectedValueOnce(winnerMissing)

    const upsert = () =>
      integrationMoosendService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      })

    await expect(upsert()).rejects.toBe(unrelated)
    await expect(upsert()).rejects.toBe(winnerMissing)
  })

  test("disconnects parent and child atomically and is a no-op when absent", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({
        id: "moosend-1",
        integrationId: "integration-1",
      })
      .mockResolvedValueOnce(undefined)
    mocks.transaction.mockImplementation(
      async (run: (tx: unknown) => unknown) => run({ delete: mocks.txDelete }),
    )

    await integrationMoosendService.disconnect("workspace-1")
    await integrationMoosendService.disconnect("workspace-1")

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.txDelete).toHaveBeenCalledTimes(2)
  })
})
