import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  findRun: vi.fn(),
  findConnection: vi.fn(),
  findWorkspace: vi.fn(),
  listProducts: vi.fn(),
  resolveToken: vi.fn(),
  resolveAuth: vi.fn(),
  findLinkedItems: vi.fn(),
  findLinkedItemsByProducts: vi.fn(),
  submitItemsBatch: vi.fn(),
  checkItemsBatch: vi.fn(),
  recordSubmission: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  markInvalid: vi.fn(),
  incrementPollAttempt: vi.fn(),
  concurrencyForUsage: vi.fn(),
  isInvalidMetaTokenError: vi.fn(),
  queueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationMetaCatalogService: {
    findByWorkspaceIdOrFail: (...args: unknown[]) =>
      mocks.findConnection(...args),
    resolveToken: (...args: unknown[]) => mocks.resolveToken(...args),
    resolveAuth: (...args: unknown[]) => mocks.resolveAuth(...args),
    markInvalid: (...args: unknown[]) => mocks.markInvalid(...args),
  },
  metaCatalogSyncRunService: {
    claim: (...args: unknown[]) => mocks.claim(...args),
    findById: (...args: unknown[]) => mocks.findRun(...args),
    recordSubmission: (...args: unknown[]) => mocks.recordSubmission(...args),
    complete: (...args: unknown[]) => mocks.complete(...args),
    fail: (...args: unknown[]) => mocks.fail(...args),
    incrementPollAttempt: (...args: unknown[]) =>
      mocks.incrementPollAttempt(...args),
  },
  productService: {
    listForCatalogSync: (...args: unknown[]) => mocks.listProducts(...args),
  },
  workspaceService: {
    find: (...args: unknown[]) => mocks.findWorkspace(...args),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCatalogItemRepository: {
    findByRetailerIds: (...args: unknown[]) => mocks.findLinkedItems(...args),
    findByProductIds: (...args: unknown[]) =>
      mocks.findLinkedItemsByProducts(...args),
  },
}))

vi.mock("@chatbotx.io/integration-meta-catalog", () => ({
  CATALOG_BATCH_SIZE: 1000,
  concurrencyForUsage: (...args: unknown[]) =>
    mocks.concurrencyForUsage(...args),
  isInvalidMetaTokenError: (...args: unknown[]) =>
    mocks.isInvalidMetaTokenError(...args),
  submitItemsBatch: (...args: unknown[]) => mocks.submitItemsBatch(...args),
  checkItemsBatch: (...args: unknown[]) => mocks.checkItemsBatch(...args),
  fingerprintMetaItem: (data: { title: string }) => `fingerprint:${data.title}`,
  toMetaItem: (
    product: { id: string },
    _settings: unknown,
    retailerId?: string,
  ) => ({
    ok: true,
    productId: product.id,
    retailerId: retailerId ?? product.id,
    data: { title: product.id },
  }),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    checkMetaCatalogSync: "checkMetaCatalogSync",
  },
  defaultQueue: {
    add: (...args: unknown[]) => mocks.queueAdd(...args),
  },
}))

vi.mock("../src/default/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

const { submitMetaCatalogSync } = await import(
  "../src/default/handlers/meta-catalog/submit"
)
const { checkMetaCatalogSync } = await import(
  "../src/default/handlers/meta-catalog/check"
)

const connection = {
  id: "connection-1",
  catalogId: "catalog-1",
  currency: "USD",
  storeUrl: "https://shop.example.com",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findConnection.mockResolvedValue(connection)
  mocks.findWorkspace.mockResolvedValue({ id: "workspace-1", name: "Store" })
  mocks.resolveToken.mockResolvedValue("catalog-token")
  mocks.resolveAuth.mockResolvedValue({ version: "v24.0" })
  mocks.findLinkedItems.mockResolvedValue([])
  mocks.findLinkedItemsByProducts.mockResolvedValue([])
  mocks.recordSubmission.mockResolvedValue(undefined)
  mocks.complete.mockResolvedValue(undefined)
  mocks.fail.mockResolvedValue(undefined)
  mocks.markInvalid.mockResolvedValue(undefined)
  mocks.incrementPollAttempt.mockResolvedValue(undefined)
  mocks.concurrencyForUsage.mockReturnValue(1)
  mocks.isInvalidMetaTokenError.mockReturnValue(false)
  mocks.queueAdd.mockResolvedValue(undefined)
})

describe("Meta Catalog sync workers", () => {
  test("submits 1000-item chunks and chooses CREATE or UPDATE from links", async () => {
    const products = Array.from({ length: 1001 }, (_, index) => ({
      id: `product-${index}`,
    }))
    mocks.claim.mockResolvedValue({
      id: "run-1",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue(products)
    mocks.findLinkedItemsByProducts.mockResolvedValue([
      { productId: "product-0", retailerId: "product-0" },
    ])
    mocks.submitItemsBatch
      .mockResolvedValueOnce({ handles: ["handle-1"] })
      .mockResolvedValueOnce({ handles: ["handle-2"] })

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-1",
    })

    expect(mocks.submitItemsBatch).toHaveBeenCalledTimes(2)
    const firstRequests = mocks.submitItemsBatch.mock.calls[0]?.[0].requests
    expect(firstRequests).toHaveLength(1000)
    expect(firstRequests[0]).toMatchObject({
      method: "UPDATE",
      retailerId: "product-0",
    })
    expect(firstRequests[1]).toMatchObject({ method: "CREATE" })
    expect(mocks.resolveToken).toHaveBeenCalledWith("connection-1")
    expect(mocks.recordSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCount: 1001,
        handles: [
          { handle: "handle-1", retailerIds: expect.any(Array) },
          { handle: "handle-2", retailerIds: ["product-1000"] },
        ],
      }),
    )
  })

  test("fingerprints only confirmed successes and retains item errors", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-2",
      status: "running",
      handles: [
        {
          handle: "handle-1",
          retailerIds: ["product-ok", "product-failed", "product-missing"],
        },
      ],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: true,
      results: [
        { retailerId: "product-ok", success: true },
        {
          retailerId: "product-failed",
          success: false,
          error: "Rejected",
        },
      ],
    })
    mocks.listProducts.mockResolvedValue([{ id: "product-ok" }])

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-2",
      attempt: 0,
    })

    expect(mocks.resolveToken).toHaveBeenCalledWith("connection-1")
    expect(mocks.complete).toHaveBeenCalledWith({
      runId: "run-2",
      integrationMetaCatalogId: "connection-1",
      catalogId: "catalog-1",
      succeededItems: [
        {
          productId: "product-ok",
          retailerId: "product-ok",
          fingerprint: "fingerprint:product-ok",
        },
      ],
      errors: [
        { retailerId: "product-failed", reason: "Rejected" },
        {
          retailerId: "product-missing",
          reason: "Meta did not return a result for this catalog item",
        },
      ],
    })
  })

  test("reuses imported retailer IDs for outbound UPDATE and status mapping", async () => {
    mocks.claim.mockResolvedValue({
      id: "run-imported",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue([{ id: "local-product-1" }])
    mocks.findLinkedItemsByProducts.mockResolvedValue([
      {
        productId: "local-product-1",
        retailerId: "merchant-retailer-1",
      },
    ])
    mocks.submitItemsBatch.mockResolvedValue({ handles: ["handle-1"] })

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-imported",
    })

    expect(mocks.submitItemsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        requests: [
          expect.objectContaining({
            method: "UPDATE",
            retailerId: "merchant-retailer-1",
          }),
        ],
      }),
    )

    mocks.findRun.mockResolvedValue({
      id: "run-imported",
      status: "running",
      handles: [
        {
          handle: "handle-1",
          retailerIds: ["merchant-retailer-1"],
        },
      ],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: true,
      results: [{ retailerId: "merchant-retailer-1", success: true }],
    })
    mocks.findLinkedItems.mockResolvedValue([
      {
        productId: "local-product-1",
        retailerId: "merchant-retailer-1",
      },
    ])
    mocks.listProducts.mockResolvedValue([{ id: "local-product-1" }])

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-imported",
      attempt: 0,
    })

    expect(mocks.listProducts).toHaveBeenLastCalledWith({
      workspaceId: "workspace-1",
      productIds: ["local-product-1"],
    })
    expect(mocks.complete).toHaveBeenLastCalledWith(
      expect.objectContaining({
        succeededItems: [
          expect.objectContaining({
            productId: "local-product-1",
            retailerId: "merchant-retailer-1",
          }),
        ],
      }),
    )
  })

  test("stops before the next chunk when Meta reports exhausted BUC quota", async () => {
    const products = Array.from({ length: 1001 }, (_, index) => ({
      id: `product-${index}`,
    }))
    mocks.claim.mockResolvedValue({
      id: "run-rate-limited",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue(products)
    mocks.submitItemsBatch.mockResolvedValue({
      handles: ["handle-1"],
      usage: { estimatedTimeToRegainAccess: 10 },
    })
    mocks.concurrencyForUsage.mockReturnValue(0)

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-rate-limited",
    })

    expect(mocks.submitItemsBatch).toHaveBeenCalledOnce()
    expect(mocks.recordSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        itemErrors: [
          {
            retailerId: "product-1000",
            reason: "Meta rate limit reached; retry this item later",
          },
        ],
      }),
    )
  })

  test.each([
    [
      {
        scope: "category",
        categoryId: "category-1",
        selectedProductIds: [],
      },
      {
        workspaceId: "workspace-1",
        categoryId: "category-1",
        productIds: undefined,
      },
    ],
    [
      {
        scope: "selected",
        categoryId: null,
        selectedProductIds: ["product-1"],
      },
      {
        workspaceId: "workspace-1",
        categoryId: undefined,
        productIds: ["product-1"],
      },
    ],
  ])("passes the persisted sync scope to product selection", async (scope, expected) => {
    mocks.claim.mockResolvedValue({ id: "run-scope", ...scope })
    mocks.listProducts.mockResolvedValue([{ id: "product-1" }])
    mocks.submitItemsBatch.mockResolvedValue({ handles: ["handle-1"] })

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-scope",
    })

    expect(mocks.listProducts).toHaveBeenCalledWith(expected)
  })

  test("requeues an unfinished status check with bounded exponential backoff", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-pending",
      status: "running",
      handles: [{ handle: "handle-1", retailerIds: ["product-1"] }],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: false,
      results: [],
    })

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-pending",
      attempt: 0,
    })

    expect(mocks.incrementPollAttempt).toHaveBeenCalledWith("run-pending")
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "checkMetaCatalogSync",
      {
        type: "checkMetaCatalogSync",
        data: {
          workspaceId: "workspace-1",
          runId: "run-pending",
          attempt: 1,
        },
      },
      {
        delay: 10_000,
        jobId: "mc-check-run-pending-1",
      },
    )
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("fails after the maximum status polling attempts", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-timeout",
      status: "running",
      handles: [{ handle: "handle-1", retailerIds: ["product-1"] }],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: false,
      results: [],
    })

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-timeout",
      attempt: 12,
    })

    expect(mocks.queueAdd).not.toHaveBeenCalled()
    // The thrown value is handed over intact: the service is what extracts a
    // user-facing message, and a channel error's detail only survives on the
    // object itself.
    expect(mocks.fail).toHaveBeenCalledWith(
      "run-timeout",
      new Error("Meta Catalog batch status timed out"),
    )
  })

  test("marks the connection invalid on Graph token error 190", async () => {
    const tokenError = new Error("Invalid OAuth access token")
    mocks.findRun.mockResolvedValue({
      id: "run-invalid-token",
      status: "running",
      handles: [{ handle: "handle-1", retailerIds: ["product-1"] }],
    })
    mocks.checkItemsBatch.mockRejectedValue(tokenError)
    mocks.isInvalidMetaTokenError.mockReturnValue(true)

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-invalid-token",
      attempt: 0,
    })

    expect(mocks.isInvalidMetaTokenError).toHaveBeenCalledWith(tokenError)
    expect(mocks.markInvalid).toHaveBeenCalledWith("workspace-1")
    expect(mocks.fail).toHaveBeenCalledWith("run-invalid-token", tokenError)
  })
})
