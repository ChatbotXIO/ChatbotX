import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  bindCatalog: vi.fn(),
  createRun: vi.fn(),
  lockConnection: vi.fn(),
  selectCatalog: vi.fn(),
  transaction: vi.fn(),
}))

const transactionClient = { name: "transaction-client" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}))

vi.mock("../src/meta-catalog/integration.service", () => ({
  integrationMetaCatalogService: {
    bindCatalog: (...args: unknown[]) => mocks.bindCatalog(...args),
    lockByWorkspaceIdOrFail: (...args: unknown[]) =>
      mocks.lockConnection(...args),
    selectCatalog: (...args: unknown[]) => mocks.selectCatalog(...args),
  },
}))

vi.mock("../src/meta-catalog/sync-run.service", () => ({
  metaCatalogSyncRunService: {
    create: (...args: unknown[]) => mocks.createRun(...args),
  },
}))

const { metaCatalogOperationService } = await import(
  "../src/meta-catalog/operation.service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(
    async (run: (tx: typeof transactionClient) => unknown) =>
      await run(transactionClient),
  )
  mocks.lockConnection.mockResolvedValue({
    id: "connection-1",
    catalogId: "catalog-old",
  })
  mocks.createRun.mockResolvedValue({ id: "run-1" })
  mocks.selectCatalog.mockResolvedValue({ id: "connection-1" })
  mocks.bindCatalog.mockResolvedValue({ id: "connection-1" })
})

describe("metaCatalogOperationService", () => {
  test("reserves an import run before queueing the connection state", async () => {
    await expect(
      metaCatalogOperationService.startImport({
        workspaceId: "workspace-1",
        catalogId: "catalog-new",
        catalogName: "New catalog",
      }),
    ).resolves.toEqual({
      connection: { id: "connection-1" },
      run: { id: "run-1" },
    })

    expect(mocks.createRun).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        integrationMetaCatalogId: "connection-1",
        direction: "import",
        catalogId: "catalog-new",
        scope: "all",
      },
      transactionClient,
    )
    expect(mocks.selectCatalog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      catalogId: "catalog-new",
      catalogName: "New catalog",
      tx: transactionClient,
    })
    expect(mocks.createRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.selectCatalog.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("does not mutate import state when reserving the run fails", async () => {
    mocks.createRun.mockRejectedValue(new Error("active run"))

    await expect(
      metaCatalogOperationService.startImport({
        workspaceId: "workspace-1",
        catalogId: "catalog-new",
      }),
    ).rejects.toThrow("active run")

    expect(mocks.selectCatalog).not.toHaveBeenCalled()
  })

  test("reserves a push run before rebinding its catalog", async () => {
    await metaCatalogOperationService.startPush({
      workspaceId: "workspace-1",
      catalogId: "catalog-new",
      catalogName: "New catalog",
      scope: "selected",
      selectedProductIds: ["product-1"],
    })

    expect(mocks.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-new",
        scope: "selected",
      }),
      transactionClient,
    )
    expect(mocks.bindCatalog).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      catalogId: "catalog-new",
      catalogName: "New catalog",
      businessId: undefined,
      tx: transactionClient,
    })
    expect(mocks.createRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bindCatalog.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("does not start a push while a legacy import is active", async () => {
    mocks.lockConnection.mockResolvedValue({
      id: "connection-1",
      catalogId: "catalog-old",
      importStatus: "queued",
    })

    await expect(
      metaCatalogOperationService.startPush({
        workspaceId: "workspace-1",
        catalogId: "catalog-new",
        scope: "all",
      }),
    ).rejects.toMatchObject({ code: "metaCatalogSyncAlreadyRunning" })

    expect(mocks.createRun).not.toHaveBeenCalled()
    expect(mocks.bindCatalog).not.toHaveBeenCalled()
  })
})
