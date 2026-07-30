import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  findRun: vi.fn(),
  findConnection: vi.fn(),
  findWorkspace: vi.fn(),
  listProducts: vi.fn(),
  resolveAuth: vi.fn(),
  findLinkedItems: vi.fn(),
  findLinkedItemsByProducts: vi.fn(),
  submitItemsBatch: vi.fn(),
  checkItemsBatch: vi.fn(),
  recordSubmission: vi.fn(),
  finishSubmission: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  markInvalid: vi.fn(),
  incrementPollAttempt: vi.fn(),
  concurrencyForUsage: vi.fn(),
  isDefiniteMetaRequestRejection: vi.fn(),
  isInvalidMetaTokenError: vi.fn(),
  resolveRetailerIds: vi.fn(),
  queueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationMetaCatalogService: {
    findByWorkspaceIdOrFail: (...args: unknown[]) =>
      mocks.findConnection(...args),
    resolveAuth: (...args: unknown[]) => mocks.resolveAuth(...args),
    markInvalid: (...args: unknown[]) => mocks.markInvalid(...args),
  },
  metaCatalogSyncRunService: {
    claim: (...args: unknown[]) => mocks.claim(...args),
    claimSubmission: async (...args: unknown[]) => {
      const run = await mocks.claim(...args)
      return run
        ? {
            ...run,
            integrationMetaCatalogId:
              run.integrationMetaCatalogId ?? "connection-1",
            submissionLeaseId: run.submissionLeaseId ?? "lease-1",
          }
        : run
    },
    claimStaleSubmission: async (...args: unknown[]) => {
      const run = await mocks.findRun(...args)
      return run
        ? {
            ...run,
            integrationMetaCatalogId:
              run.integrationMetaCatalogId ?? "connection-1",
            submissionLeaseId: run.submissionLeaseId ?? "lease-2",
          }
        : run
    },
    findById: async (...args: unknown[]) => {
      const run = await mocks.findRun(...args)
      return run
        ? {
            ...run,
            integrationMetaCatalogId:
              run.integrationMetaCatalogId ?? "connection-1",
          }
        : run
    },
    recordSubmission: (...args: unknown[]) => mocks.recordSubmission(...args),
    finishSubmission: (...args: unknown[]) => mocks.finishSubmission(...args),
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
  isDefiniteMetaRequestRejection: (...args: unknown[]) =>
    mocks.isDefiniteMetaRequestRejection(...args),
  isInvalidMetaTokenError: (...args: unknown[]) =>
    mocks.isInvalidMetaTokenError(...args),
  resolveRetailerIds: (...args: unknown[]) => mocks.resolveRetailerIds(...args),
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
  vi.resetAllMocks()
  mocks.findConnection.mockResolvedValue(connection)
  mocks.findWorkspace.mockResolvedValue({ id: "workspace-1", name: "Store" })
  mocks.resolveAuth.mockResolvedValue({
    accessToken: "catalog-token",
    version: "v24.0",
  })
  mocks.findLinkedItems.mockResolvedValue([])
  mocks.findLinkedItemsByProducts.mockResolvedValue([])
  mocks.recordSubmission.mockResolvedValue(true)
  mocks.finishSubmission.mockResolvedValue(true)
  mocks.complete.mockResolvedValue(undefined)
  mocks.fail.mockResolvedValue(undefined)
  mocks.markInvalid.mockResolvedValue(undefined)
  mocks.incrementPollAttempt.mockResolvedValue(undefined)
  mocks.concurrencyForUsage.mockReturnValue(1)
  mocks.isDefiniteMetaRequestRejection.mockReturnValue(false)
  mocks.isInvalidMetaTokenError.mockReturnValue(false)
  // Stands in for the real resolver, whose collision rules are covered in
  // integrations/meta-catalog/__tests__/retailer-id.test.ts.
  mocks.resolveRetailerIds.mockImplementation(
    ({
      products,
      linkedByProductId,
    }: {
      products: Array<{ id: string; sku?: string | null }>
      linkedByProductId: Map<string, string>
    }) =>
      new Map(
        products.map((product) => [
          product.id,
          linkedByProductId.get(product.id) ||
            product.sku?.trim() ||
            product.id,
        ]),
      ),
  )
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
    expect(mocks.resolveAuth).toHaveBeenCalledWith("connection-1")
    expect(mocks.recordSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCount: 1001,
        handles: [
          { handle: "handle-1", items: expect.any(Array) },
          {
            handle: "handle-2",
            items: [{ productId: "product-1000", retailerId: "product-1000" }],
          },
        ],
      }),
    )
  })

  test("submits and polls against the catalog snapshotted on the run", async () => {
    mocks.claim.mockResolvedValue({
      id: "run-snapshot",
      catalogId: "catalog-snapshot",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue([{ id: "product-1" }])
    mocks.submitItemsBatch.mockResolvedValue({ handles: ["handle-1"] })

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-snapshot",
    })

    expect(mocks.submitItemsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ catalogId: "catalog-snapshot" }),
    )
    expect(mocks.findLinkedItemsByProducts).toHaveBeenCalledWith(
      expect.objectContaining({ catalogId: "catalog-snapshot" }),
    )

    mocks.findRun.mockResolvedValue({
      id: "run-snapshot",
      status: "running",
      catalogId: "catalog-snapshot",
      handles: [
        {
          handle: "handle-1",
          items: [{ productId: "product-1", retailerId: "product-1" }],
        },
      ],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: true,
      results: [{ retailerId: "product-1", success: true }],
    })
    mocks.listProducts.mockResolvedValue([{ id: "product-1" }])

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-snapshot",
      attempt: 0,
    })

    expect(mocks.checkItemsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ catalogId: "catalog-snapshot" }),
    )
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ catalogId: "catalog-snapshot" }),
    )
  })

  test("rejects a run whose connection does not belong to the job context", async () => {
    mocks.claim.mockResolvedValue({
      id: "run-mismatch",
      integrationMetaCatalogId: "connection-other",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-mismatch",
    })

    expect(mocks.claim).toHaveBeenCalledWith({
      runId: "run-mismatch",
      workspaceId: "workspace-1",
    })
    expect(mocks.listProducts).not.toHaveBeenCalled()
    expect(mocks.submitItemsBatch).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(
      "run-mismatch",
      expect.objectContaining({
        message: "Meta Catalog sync run does not match its connection",
      }),
    )
  })

  test("sends the SKU as the Content ID and checks who already owns it", async () => {
    mocks.claim.mockResolvedValue({
      id: "run-sku",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue([
      { id: "product-1", sku: "TSHIRT-BLK-M" },
      { id: "product-2", sku: "  " },
      { id: "product-3", sku: null },
    ])
    mocks.submitItemsBatch.mockResolvedValue({ handles: ["handle-1"] })

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-sku",
    })

    // Only real SKUs are worth a claim lookup — blanks can never be Content IDs.
    expect(mocks.findLinkedItems).toHaveBeenCalledWith({
      integrationMetaCatalogId: "connection-1",
      catalogId: "catalog-1",
      retailerIds: ["TSHIRT-BLK-M"],
    })
    expect(mocks.submitItemsBatch.mock.calls[0]?.[0].requests).toEqual([
      expect.objectContaining({ retailerId: "TSHIRT-BLK-M" }),
      expect.objectContaining({ retailerId: "product-2" }),
      expect.objectContaining({ retailerId: "product-3" }),
    ])
  })

  test("fingerprints only confirmed successes and retains item errors", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-2",
      status: "running",
      handles: [
        {
          handle: "handle-1",
          items: [
            { productId: "product-ok", retailerId: "product-ok" },
            { productId: "product-failed", retailerId: "product-failed" },
            { productId: "product-missing", retailerId: "product-missing" },
          ],
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

    expect(mocks.resolveAuth).toHaveBeenCalledWith("connection-1")
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
          items: [
            { productId: "local-product-1", retailerId: "merchant-retailer-1" },
          ],
        },
      ],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: true,
      results: [{ retailerId: "merchant-retailer-1", success: true }],
    })
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

  test("continues polling batch handles persisted before product IDs were added", async () => {
    mocks.findRun.mockResolvedValue({
      id: "legacy-run",
      status: "running",
      handles: [
        {
          handle: "legacy-handle",
          retailerIds: ["legacy-retailer"],
        },
      ],
    })
    mocks.findLinkedItems.mockResolvedValue([
      {
        productId: "local-product",
        retailerId: "legacy-retailer",
      },
    ])
    mocks.checkItemsBatch.mockResolvedValue({
      completed: true,
      results: [{ retailerId: "legacy-retailer", success: true }],
    })
    mocks.listProducts.mockResolvedValue([{ id: "local-product" }])

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "legacy-run",
      attempt: 0,
    })

    expect(mocks.checkItemsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: "legacy-handle",
        retailerIds: ["legacy-retailer"],
      }),
    )
    expect(mocks.listProducts).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      productIds: ["local-product"],
    })
  })

  test("reports a legacy SKU batch as unresolved instead of silently succeeding", async () => {
    mocks.findRun.mockResolvedValue({
      id: "legacy-sku-run",
      status: "running",
      handles: [
        {
          handle: "legacy-handle",
          retailerIds: ["META-SKU"],
        },
      ],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: true,
      results: [{ retailerId: "META-SKU", success: true }],
    })
    mocks.listProducts.mockResolvedValue([])

    await checkMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "legacy-sku-run",
      attempt: 0,
    })

    expect(mocks.complete).toHaveBeenCalledWith({
      runId: "legacy-sku-run",
      integrationMetaCatalogId: "connection-1",
      catalogId: "catalog-1",
      succeededItems: [],
      errors: [
        {
          retailerId: "META-SKU",
          reason:
            "The local product for this legacy Meta sync could not be resolved; sync this item again",
        },
      ],
    })
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

  test("keeps syncing remaining batches when Meta rejects one batch outright", async () => {
    const products = Array.from({ length: 1001 }, (_, index) => ({
      id: `product-${index}`,
    }))
    mocks.claim.mockResolvedValue({
      id: "run-batch-error",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue(products)
    mocks.submitItemsBatch
      .mockRejectedValueOnce(new Error("Invalid parameter"))
      .mockResolvedValueOnce({ handles: ["handle-2"] })
    mocks.isDefiniteMetaRequestRejection.mockReturnValue(true)

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-batch-error",
    })

    expect(mocks.submitItemsBatch).toHaveBeenCalledTimes(2)
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.markInvalid).not.toHaveBeenCalled()
    const rejectedRetailerIds = Array.from(
      { length: 1000 },
      (_, index) => `product-${index}`,
    )
    expect(mocks.recordSubmission).toHaveBeenLastCalledWith(
      expect.objectContaining({
        handles: [
          {
            handle: "handle-2",
            items: [{ productId: "product-1000", retailerId: "product-1000" }],
          },
        ],
        itemErrors: rejectedRetailerIds.map((retailerId) => ({
          retailerId,
          reason: "Invalid parameter",
        })),
      }),
    )
    expect(mocks.queueAdd).toHaveBeenCalled()
  })

  test("keeps an indeterminate first batch recoverable", async () => {
    const transportError = new Error("Connection reset")
    mocks.claim.mockResolvedValue({
      id: "run-transport-error",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue([{ id: "product-1" }])
    mocks.submitItemsBatch.mockRejectedValue(transportError)

    await expect(
      submitMetaCatalogSync({
        workspaceId: "workspace-1",
        runId: "run-transport-error",
      }),
    ).rejects.toThrow(transportError)

    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("checkpoints and polls an accepted batch when a later batch fails", async () => {
    const transportError = new Error("Connection reset")
    mocks.claim.mockResolvedValue({
      id: "run-partial-transport-error",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
      handles: [],
      itemErrors: [],
    })
    mocks.listProducts.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => ({
        id: `product-${index}`,
      })),
    )
    mocks.submitItemsBatch
      .mockResolvedValueOnce({ handles: ["handle-1"] })
      .mockRejectedValueOnce(transportError)

    await expect(
      submitMetaCatalogSync({
        workspaceId: "workspace-1",
        runId: "run-partial-transport-error",
      }),
    ).rejects.toThrow(transportError)

    expect(mocks.recordSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: [{ handle: "handle-1", items: expect.any(Array) }],
      }),
    )
    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("recovers checker dispatch without resubmitting checkpointed items", async () => {
    const queueError = new Error("Redis unavailable")
    const checkpointedHandle = {
      handle: "handle-1",
      items: [{ productId: "product-1", retailerId: "product-1" }],
    }
    mocks.claim
      .mockResolvedValueOnce({
        id: "run-checker-recovery",
        scope: "all",
        categoryId: null,
        selectedProductIds: [],
        handles: [],
        itemErrors: [],
      })
      .mockResolvedValueOnce(null)
    mocks.findRun.mockResolvedValue({
      id: "run-checker-recovery",
      status: "running",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
      handles: [checkpointedHandle],
      itemErrors: [],
    })
    mocks.listProducts.mockResolvedValue([{ id: "product-1" }])
    mocks.submitItemsBatch.mockResolvedValue({ handles: ["handle-1"] })
    mocks.queueAdd.mockRejectedValueOnce(queueError).mockResolvedValueOnce(null)

    await expect(
      submitMetaCatalogSync({
        workspaceId: "workspace-1",
        runId: "run-checker-recovery",
      }),
    ).rejects.toThrow(queueError)

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-checker-recovery",
      recovery: true,
    })

    expect(mocks.submitItemsBatch).toHaveBeenCalledOnce()
    expect(mocks.queueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("resubmits only the uncheckpointed tail after a persistence failure", async () => {
    const persistenceError = new Error("Database unavailable")
    const products = Array.from({ length: 1001 }, (_, index) => ({
      id: `product-${index}`,
    }))
    const checkpointedHandle = {
      handle: "handle-1",
      items: products.slice(0, 1000).map((product) => ({
        productId: product.id,
        retailerId: product.id,
      })),
    }
    mocks.claim
      .mockResolvedValueOnce({
        id: "run-checkpoint-recovery",
        scope: "all",
        categoryId: null,
        selectedProductIds: [],
        handles: [],
        itemErrors: [],
        totalCount: 0,
      })
      .mockResolvedValueOnce(null)
    mocks.findRun.mockResolvedValue({
      id: "run-checkpoint-recovery",
      status: "running",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
      handles: [checkpointedHandle],
      itemErrors: [
        {
          retailerId: "product-1000",
          reason: "Submission was interrupted; sync this item again",
        },
      ],
      totalCount: 1001,
    })
    mocks.listProducts.mockResolvedValue(products)
    mocks.submitItemsBatch
      .mockResolvedValueOnce({ handles: ["handle-1"] })
      .mockResolvedValueOnce({ handles: ["handle-2"] })
      .mockResolvedValueOnce({ handles: ["handle-2"] })
    mocks.recordSubmission
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(persistenceError)
      .mockResolvedValue(true)

    await expect(
      submitMetaCatalogSync({
        workspaceId: "workspace-1",
        runId: "run-checkpoint-recovery",
      }),
    ).rejects.toThrow(persistenceError)

    await submitMetaCatalogSync({
      workspaceId: "workspace-1",
      runId: "run-checkpoint-recovery",
      recovery: true,
    })

    expect(mocks.submitItemsBatch).toHaveBeenCalledTimes(2)
    expect(mocks.submitItemsBatch.mock.calls[1]?.[0].requests).toEqual([
      expect.objectContaining({
        method: "UPDATE",
        retailerId: "product-1000",
      }),
    ])
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.queueAdd).toHaveBeenCalledOnce()
  })

  test("aborts the run when a batch fails because the Meta token is invalid", async () => {
    const tokenError = new Error("Invalid OAuth access token")
    mocks.claim.mockResolvedValue({
      id: "run-invalid-token-submit",
      scope: "all",
      categoryId: null,
      selectedProductIds: [],
    })
    mocks.listProducts.mockResolvedValue([{ id: "product-1" }])
    mocks.submitItemsBatch.mockRejectedValue(tokenError)
    mocks.isInvalidMetaTokenError.mockReturnValue(true)

    await expect(
      submitMetaCatalogSync({
        workspaceId: "workspace-1",
        runId: "run-invalid-token-submit",
      }),
    ).rejects.toThrow(tokenError)

    expect(mocks.markInvalid).toHaveBeenCalledWith("workspace-1")
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
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
      handles: [
        {
          handle: "handle-1",
          items: [{ productId: "product-1", retailerId: "product-1" }],
        },
      ],
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

  test("keeps an unfinished run recoverable when checker dispatch fails", async () => {
    const redisError = new Error("Redis unavailable")
    mocks.findRun.mockResolvedValue({
      id: "run-dispatch-recovery",
      status: "running",
      handles: [
        {
          handle: "handle-1",
          items: [{ productId: "product-1", retailerId: "product-1" }],
        },
      ],
    })
    mocks.checkItemsBatch.mockResolvedValue({
      completed: false,
      results: [],
    })
    mocks.queueAdd.mockRejectedValue(redisError)

    await expect(
      checkMetaCatalogSync({
        workspaceId: "workspace-1",
        runId: "run-dispatch-recovery",
        attempt: 0,
      }),
    ).rejects.toThrow(redisError)

    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("fails after the maximum status polling attempts", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-timeout",
      status: "running",
      handles: [
        {
          handle: "handle-1",
          items: [{ productId: "product-1", retailerId: "product-1" }],
        },
      ],
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
      handles: [
        {
          handle: "handle-1",
          items: [{ productId: "product-1", retailerId: "product-1" }],
        },
      ],
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
