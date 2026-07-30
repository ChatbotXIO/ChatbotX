import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  decryptObject: vi.fn(),
  encryptObject: vi.fn(),
  findFirst: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  isDatabaseError: vi.fn(),
  select: vi.fn(),
  selectForUpdate: vi.fn(),
  selectFrom: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  updateReturning: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}))

const transactionClient = {
  insert: (...args: unknown[]) => mocks.insert(...args),
  query: {
    integrationMetaCatalogModel: {
      findFirst: (...args: unknown[]) => mocks.findFirst(...args),
    },
  },
  select: (...args: unknown[]) => mocks.select(...args),
  update: (...args: unknown[]) => mocks.update(...args),
}

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  db: {
    query: transactionClient.query,
    transaction: (...args: unknown[]) => mocks.transaction(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
  isDatabaseError: (...args: unknown[]) => mocks.isDatabaseError(...args),
  isNull: vi.fn((column: unknown) => ({ column, isNull: true })),
  notInArray: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMetaCatalogModel: {
    deletedAt: "deletedAt",
    id: "connectionId",
    importStatus: "importStatus",
    workspaceId: "connectionWorkspaceId",
  },
  integrationModel: { id: "integrationId" },
  metaCatalogSyncRunModel: {
    error: "runError",
    finishedAt: "runFinishedAt",
    id: "runId",
    status: "runStatus",
    workspaceId: "runWorkspaceId",
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: (value: unknown) => value },
  encryptUtils: {
    decryptObject: mocks.decryptObject,
    encryptObject: mocks.encryptObject,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { integrationMetaCatalogService } = await import(
  "../src/meta-catalog/integration.service"
)

const uniqueError = (constraint: string) =>
  Object.assign(new Error("unique violation"), {
    cause: { code: "23505", constraint },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.encryptObject.mockResolvedValue({ encrypted: true })
  mocks.isDatabaseError.mockReturnValue(false)
  mocks.transaction.mockImplementation(
    async (run: (tx: typeof transactionClient) => unknown) =>
      await run(transactionClient),
  )
  mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }))
  mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }))
  mocks.selectWhere.mockImplementation(() => ({
    for: mocks.selectForUpdate,
    limit: mocks.selectLimit,
  }))
  mocks.selectForUpdate.mockResolvedValue([])
  mocks.selectLimit.mockResolvedValue([])
  mocks.update.mockImplementation(() => ({ set: mocks.updateSet }))
  mocks.updateSet.mockImplementation(() => ({ where: mocks.updateWhere }))
  mocks.updateWhere.mockImplementation(() => ({
    returning: mocks.updateReturning,
  }))
  mocks.updateReturning.mockResolvedValue([])
  mocks.insert.mockImplementation(() => ({ values: mocks.insertValues }))
  mocks.insertValues.mockResolvedValue(undefined)
})

describe("IntegrationMetaCatalogService", () => {
  test("only exposes an active workspace connection", async () => {
    mocks.findFirst.mockResolvedValue({ id: "connection-1" })

    await expect(
      integrationMetaCatalogService.findByWorkspaceId("workspace-1"),
    ).resolves.toEqual({ id: "connection-1" })

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        deletedAt: { isNull: true },
      },
    })
  })

  test("revives a deleted connection and clears stale operational state", async () => {
    mocks.selectForUpdate.mockResolvedValue([
      { id: "connection-1", deletedAt: new Date() },
    ])
    mocks.updateReturning.mockResolvedValue([{ id: "connection-1" }])

    await expect(
      integrationMetaCatalogService.upsert({
        workspaceId: "workspace-1",
        auth: {
          accessToken: "long-lived-token",
          expiresAt: "2026-08-30T00:00:00.000Z",
          version: "v23.0",
        },
        tokenExpiresAt: new Date("2026-08-30T00:00:00.000Z"),
      }),
    ).resolves.toBe("connection-1")

    expect(mocks.updateSet).toHaveBeenCalledWith({
      authMode: "oauth",
      deletedAt: null,
      encryptedAuth: { encrypted: true },
      importError: null,
      importStatus: "idle",
      status: "active",
      tokenExpiresAt: new Date("2026-08-30T00:00:00.000Z"),
    })
  })

  test("revives a deleted connection without cancelling its active run", async () => {
    mocks.selectForUpdate.mockResolvedValue([
      { id: "connection-1", deletedAt: new Date() },
    ])
    mocks.selectLimit.mockResolvedValue([{ id: "run-1" }])
    mocks.updateReturning.mockResolvedValue([{ id: "connection-1" }])

    await integrationMetaCatalogService.upsert({
      workspaceId: "workspace-1",
      auth: { accessToken: "refreshed-token" },
      tokenExpiresAt: null,
    })

    expect(mocks.updateSet).toHaveBeenCalledOnce()
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({
        importStatus: expect.anything(),
        importError: expect.anything(),
      }),
    )
  })

  test("creates the parent and connection only when the workspace has no prior row", async () => {
    await expect(
      integrationMetaCatalogService.upsert({
        workspaceId: "workspace-1",
        auth: { accessToken: "long-lived-token" },
        tokenExpiresAt: null,
      }),
    ).resolves.toBeTypeOf("string")

    expect(mocks.insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        integrationType: "metaCatalog",
        workspaceId: "workspace-1",
      }),
    )
    expect(mocks.insertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        deletedAt: null,
        encryptedAuth: { encrypted: true },
        workspaceId: "workspace-1",
      }),
    )
  })

  test("refreshes auth without resetting an active connection's import state", async () => {
    mocks.selectForUpdate.mockResolvedValue([
      { id: "connection-1", deletedAt: null },
    ])
    mocks.updateReturning.mockResolvedValue([{ id: "connection-1" }])

    await integrationMetaCatalogService.upsert({
      workspaceId: "workspace-1",
      auth: { accessToken: "refreshed-token" },
      tokenExpiresAt: null,
    })

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({
        importStatus: expect.anything(),
        importError: expect.anything(),
      }),
    )
  })

  test("uses the winning connection id when concurrent OAuth callbacks race", async () => {
    const error = uniqueError("IntegrationMetaCatalog_workspaceId_key")
    mocks.isDatabaseError.mockImplementation(
      (caught: unknown) => caught === error,
    )
    mocks.transaction
      .mockImplementationOnce(
        async (run: (tx: typeof transactionClient) => unknown) =>
          await run(transactionClient),
      )
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(
        async (run: (tx: typeof transactionClient) => unknown) =>
          await run(transactionClient),
      )
    mocks.selectForUpdate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "winner-id", deletedAt: null }])
    mocks.updateReturning.mockResolvedValue([{ id: "winner-id" }])

    await expect(
      integrationMetaCatalogService.upsert({
        workspaceId: "workspace-1",
        auth: { accessToken: "long-lived-token" },
        tokenExpiresAt: null,
      }),
    ).resolves.toBe("winner-id")
  })

  test("soft-deletes credentials only when no sync or import is active", async () => {
    mocks.selectForUpdate.mockResolvedValue([
      {
        id: "connection-1",
        importStatus: "succeeded",
      },
    ])

    await integrationMetaCatalogService.disconnect("workspace-1")

    expect(mocks.updateSet).toHaveBeenCalledWith({
      deletedAt: expect.any(Date),
      encryptedAuth: null,
      importError: "Meta Catalog was disconnected",
      importStatus: "failed",
      status: "invalid",
      tokenExpiresAt: null,
    })
  })

  test("refuses to disconnect while a sync run is active", async () => {
    mocks.selectForUpdate.mockResolvedValue([
      {
        id: "connection-1",
        importStatus: "idle",
      },
    ])
    mocks.selectLimit.mockResolvedValue([{ id: "run-1" }])

    await expect(
      integrationMetaCatalogService.disconnect("workspace-1"),
    ).rejects.toMatchObject({ code: "metaCatalogSyncAlreadyRunning" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test("refuses to disconnect while a legacy import is active", async () => {
    mocks.selectForUpdate.mockResolvedValue([
      {
        id: "connection-1",
        importStatus: "running",
      },
    ])

    await expect(
      integrationMetaCatalogService.disconnect("workspace-1"),
    ).rejects.toMatchObject({ code: "metaCatalogSyncAlreadyRunning" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test("refuses to resolve credentials that were cleared on disconnect", async () => {
    mocks.findFirst.mockResolvedValue({
      encryptedAuth: null,
      status: "active",
    })

    await expect(
      integrationMetaCatalogService.resolveAuth("connection-1"),
    ).rejects.toMatchObject({ code: "metaCatalogReconnectRequired" })

    expect(mocks.decryptObject).not.toHaveBeenCalled()
  })

  test("scrubs query dumps from completed import summaries", async () => {
    await integrationMetaCatalogService.completeImport({
      connectionId: "connection-1",
      totalCount: 1,
      importedCount: 0,
      failedCount: 1,
      error:
        'Failed query: update "Product" set "name" = $1 params: private-name',
    })

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        importError:
          "Meta Catalog import failed. Please try again or contact support.",
      }),
    )
  })
})
