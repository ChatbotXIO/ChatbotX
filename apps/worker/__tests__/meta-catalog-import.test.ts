import { MetaCatalogException } from "@chatbotx.io/integration-meta-catalog"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimImport: vi.fn(),
  resolveAuth: vi.fn(),
  getPage: vi.fn(),
  mapProduct: vi.fn(),
  importPage: vi.fn(),
  updateProgress: vi.fn(),
  completeImport: vi.fn(),
  failImport: vi.fn(),
  markInvalid: vi.fn(),
  isInvalidToken: vi.fn(),
  runClaim: vi.fn(),
  runProgress: vi.fn(),
  runComplete: vi.fn(),
  runFail: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationMetaCatalogService: {
    claimImport: (...args: unknown[]) => mocks.claimImport(...args),
    resolveAuth: (...args: unknown[]) => mocks.resolveAuth(...args),
    updateImportProgress: (...args: unknown[]) => mocks.updateProgress(...args),
    completeImport: (...args: unknown[]) => mocks.completeImport(...args),
    failImport: (...args: unknown[]) => mocks.failImport(...args),
    markInvalid: (...args: unknown[]) => mocks.markInvalid(...args),
  },
  metaCatalogImportService: {
    importPage: (...args: unknown[]) => mocks.importPage(...args),
  },
  // Must be listed even though only the runId tests exercise it: the factory
  // replaces the whole module, so an omitted export is `undefined` at runtime
  // with nothing failing at compile time.
  metaCatalogSyncRunService: {
    claim: async (...args: unknown[]) => {
      const run = await mocks.runClaim(...args)
      return run
        ? {
            ...run,
            integrationMetaCatalogId:
              run.integrationMetaCatalogId ?? "connection-1",
          }
        : run
    },
    recordImportProgress: (...args: unknown[]) => mocks.runProgress(...args),
    completeImport: (...args: unknown[]) => mocks.runComplete(...args),
    fail: (...args: unknown[]) => mocks.runFail(...args),
  },
}))

vi.mock("@chatbotx.io/integration-meta-catalog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@chatbotx.io/integration-meta-catalog")
    >()
  return {
    ...actual,
    MAX_META_CATALOG_PRODUCT_PAGES: 2,
    getCatalogProductsPage: (...args: unknown[]) => mocks.getPage(...args),
    toImportedMetaProduct: (...args: unknown[]) => mocks.mapProduct(...args),
    isInvalidMetaTokenError: (...args: unknown[]) =>
      mocks.isInvalidToken(...args),
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn() },
}))

const { importMetaCatalogProducts } = await import(
  "../src/default/handlers/meta-catalog/import-products"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claimImport.mockResolvedValue({
    id: "connection-1",
    catalogId: "catalog-1",
  })
  mocks.resolveAuth.mockResolvedValue({
    accessToken: "token",
    version: "v24.0",
  })
  mocks.importPage.mockResolvedValue({ imported: 1, existing: 0 })
  mocks.mapProduct.mockImplementation((product: { retailer_id?: string }) =>
    product.retailer_id
      ? { ok: true, product: { retailerId: product.retailer_id } }
      : { ok: false, reason: "invalid" },
  )
  mocks.isInvalidToken.mockReturnValue(false)
  mocks.runClaim.mockResolvedValue({
    id: "run-1",
    catalogId: "catalog-1",
  })
})

describe("Meta Catalog product import worker", () => {
  test("paginates products, imports valid rows, and records row failures", async () => {
    mocks.getPage
      .mockResolvedValueOnce({
        products: [{ retailer_id: "one" }, {}],
        invalidCount: 0,
        nextCursor: "next",
      })
      .mockResolvedValueOnce({
        products: [{ retailer_id: "two" }],
        invalidCount: 0,
      })

    await importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
    })

    expect(mocks.getPage).toHaveBeenCalledTimes(2)
    expect(mocks.importPage).toHaveBeenCalledTimes(2)
    expect(mocks.updateProgress).toHaveBeenLastCalledWith({
      connectionId: "connection-1",
      totalCount: 3,
      importedCount: 2,
      failedCount: 1,
    })
    expect(mocks.completeImport).toHaveBeenCalledWith({
      connectionId: "connection-1",
      totalCount: 3,
      importedCount: 2,
      failedCount: 1,
      error: "1 Meta products could not be imported: invalid (1)",
    })
  })

  test("counts already-linked products as successfully available locally", async () => {
    mocks.getPage.mockResolvedValue({
      products: [{ retailer_id: "existing" }],
      invalidCount: 0,
    })
    mocks.importPage.mockResolvedValue({ imported: 0, existing: 1 })

    await importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
    })

    expect(mocks.completeImport).toHaveBeenCalledWith(
      expect.objectContaining({
        importedCount: 1,
        failedCount: 0,
      }),
    )
  })

  test("marks the connection invalid when Meta rejects the token", async () => {
    const error = new Error("Invalid OAuth access token")
    mocks.getPage.mockRejectedValue(error)
    mocks.isInvalidToken.mockReturnValue(true)

    await importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
    })

    expect(mocks.markInvalid).toHaveBeenCalledWith("workspace-1")
    // Passed as the thrown value, not a flattened message — the service owns
    // the extraction so a channel error's user-facing detail is not lost here.
    expect(mocks.failImport).toHaveBeenCalledWith("connection-1", error)
  })

  test("logs safe Graph diagnostics with the failing import phase", async () => {
    const error = new MetaCatalogException(
      "Unsupported get request for catalog",
      400,
      100,
    )
    mocks.getPage.mockRejectedValue(error)

    await importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
    })

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({
          message: "Unsupported get request for catalog (code 100)",
          name: "MetaCatalogException",
        }),
        error: "Unsupported get request for catalog (code 100)",
        graphCode: 100,
        statusCode: 400,
        connectionId: "connection-1",
        workspaceId: "workspace-1",
        catalogId: "catalog-1",
        pageIndex: 0,
        phase: "fetch-products",
      }),
      "Unsupported get request for catalog (code 100)",
    )
    expect(mocks.failImport).toHaveBeenCalledWith("connection-1", error)
  })

  test("continues importing valid products when Meta returns malformed items", async () => {
    mocks.getPage.mockResolvedValue({
      products: [{ retailer_id: "valid" }],
      invalidCount: 2,
    })

    await importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
    })

    expect(mocks.importPage).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [{ retailerId: "valid" }],
      }),
    )
    expect(mocks.completeImport).toHaveBeenCalledWith({
      connectionId: "connection-1",
      totalCount: 3,
      importedCount: 1,
      failedCount: 2,
      error:
        "2 Meta products could not be imported: Meta returned a product in an unexpected shape (2)",
    })
  })

  test("stops safely when the configured page ceiling is reached", async () => {
    mocks.getPage.mockResolvedValue({
      products: [{ retailer_id: "item" }],
      invalidCount: 0,
      nextCursor: "more",
    })

    await importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
    })

    expect(mocks.getPage).toHaveBeenCalledTimes(2)
    expect(mocks.completeImport).toHaveBeenCalledWith(
      expect.objectContaining({
        failedCount: 1,
        error: expect.stringContaining("2-page import limit"),
      }),
    )
  })
})

/**
 * A pull only becomes visible to the workspace through its run row, and that row
 * holds the single active-run slot for the workspace — so every exit has to move
 * it out of `queued`/`running`, or the next sync is refused.
 */
describe("Meta Catalog import sync history", () => {
  const importWithRun = () =>
    importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
      runId: "run-1",
    })

  test("reports progress and the final tally into the run", async () => {
    mocks.getPage.mockResolvedValue({
      products: [{ retailer_id: "one" }, {}],
      invalidCount: 0,
    })

    await importWithRun()

    expect(mocks.runClaim).toHaveBeenCalledWith({
      runId: "run-1",
      workspaceId: "workspace-1",
    })
    expect(mocks.claimImport).toHaveBeenCalledWith({
      connectionId: "connection-1",
      workspaceId: "workspace-1",
    })
    expect(mocks.runProgress).toHaveBeenCalledWith({
      runId: "run-1",
      totalCount: 2,
      succeededCount: 1,
      failedCount: 1,
    })
    expect(mocks.runComplete).toHaveBeenCalledWith({
      runId: "run-1",
      totalCount: 2,
      succeededCount: 1,
      failedCount: 1,
      error: "1 Meta products could not be imported: invalid (1)",
    })
  })

  test("imports from the catalog snapshotted on the run", async () => {
    mocks.runClaim.mockResolvedValue({
      id: "run-1",
      catalogId: "catalog-snapshot",
    })
    mocks.getPage.mockResolvedValue({
      products: [{ retailer_id: "one" }],
      invalidCount: 0,
    })

    await importWithRun()

    expect(mocks.getPage).toHaveBeenCalledWith(
      expect.objectContaining({ catalogId: "catalog-snapshot" }),
    )
    expect(mocks.importPage).toHaveBeenCalledWith(
      expect.objectContaining({ catalogId: "catalog-snapshot" }),
    )
  })

  test("fails the run when another import already holds the connection", async () => {
    mocks.claimImport.mockResolvedValue(null)

    await importWithRun()

    expect(mocks.getPage).not.toHaveBeenCalled()
    expect(mocks.runFail).toHaveBeenCalledWith(
      "run-1",
      "Another Meta Catalog import was already running",
    )
  })

  test("fails the run with the thrown value when the pull breaks", async () => {
    const error = new Error("Meta Graph is unavailable")
    mocks.getPage.mockRejectedValue(error)

    await importWithRun()

    expect(mocks.runFail).toHaveBeenCalledWith("run-1", error)
    expect(mocks.runComplete).not.toHaveBeenCalled()
  })

  test("leaves the run untouched for jobs queued before history existed", async () => {
    mocks.getPage.mockResolvedValue({
      products: [{ retailer_id: "one" }],
      invalidCount: 0,
    })

    await importMetaCatalogProducts({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
    })

    expect(mocks.completeImport).toHaveBeenCalled()
    expect(mocks.runClaim).not.toHaveBeenCalled()
    expect(mocks.runComplete).not.toHaveBeenCalled()
    expect(mocks.runFail).not.toHaveBeenCalled()
  })
})
