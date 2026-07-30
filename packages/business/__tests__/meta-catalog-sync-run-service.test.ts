import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findByIds: vi.fn(),
  select: vi.fn(),
  selectForUpdate: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}))

const transactionClient = {
  select: (...args: unknown[]) => mocks.select(...args),
  update: (...args: unknown[]) => mocks.update(...args),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      metaCatalogSyncRunModel: {
        findMany: (...args: unknown[]) => mocks.findMany(...args),
      },
    },
    transaction: (...args: unknown[]) => mocks.transaction(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  isDatabaseError: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCatalogItemRepository: {},
  productCategoryRepository: {},
  productRepository: {
    findByIds: (...args: unknown[]) => mocks.findByIds(...args),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  metaCatalogSyncRunModel: {
    handles: "handles",
    id: "id",
    status: "status",
    submissionLeaseId: "submissionLeaseId",
  },
}))

const { metaCatalogSyncRunService } = await import(
  "../src/meta-catalog/sync-run.service"
)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof transactionClient) => unknown) =>
      await callback(transactionClient),
  )
  mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }))
  mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }))
  mocks.selectWhere.mockImplementation(() => ({
    for: mocks.selectForUpdate,
  }))
  mocks.selectForUpdate.mockResolvedValue([{ handles: [] }])
  mocks.update.mockImplementation(() => ({ set: mocks.updateSet }))
  mocks.updateSet.mockImplementation(() => ({ where: mocks.updateWhere }))
  mocks.updateWhere.mockResolvedValue(undefined)
})

describe("metaCatalogSyncRunService.list", () => {
  test("enriches skipped items with the product's current name", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "run-1",
        skippedItems: [
          { productId: "product-1", reason: "missingImage" },
          { productId: "product-2", reason: "missingStoreUrl" },
        ],
      },
    ])
    mocks.findByIds.mockResolvedValue([
      { id: "product-1", name: "Áo thun trắng" },
    ])

    const history = await metaCatalogSyncRunService.list("workspace-1")

    expect(mocks.findByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      productIds: ["product-1", "product-2"],
    })
    expect(history[0]?.skippedItems).toEqual([
      {
        productId: "product-1",
        reason: "missingImage",
        productName: "Áo thun trắng",
      },
      {
        productId: "product-2",
        reason: "missingStoreUrl",
        productName: undefined,
      },
    ])
  })

  test("skips the product lookup when no run has skipped items", async () => {
    mocks.findMany.mockResolvedValue([{ id: "run-1", skippedItems: [] }])
    mocks.findByIds.mockResolvedValue([])

    await metaCatalogSyncRunService.list("workspace-1")

    expect(mocks.findByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      productIds: [],
    })
  })
})

describe("metaCatalogSyncRunService error persistence", () => {
  test("scrubs query dumps from per-item errors before storing history", async () => {
    await expect(
      metaCatalogSyncRunService.recordSubmission({
        runId: "run-1",
        submissionLeaseId: "lease-1",
        totalCount: 1,
        handles: [],
        skippedItems: [],
        failedCount: 1,
        itemErrors: [
          {
            retailerId: "retailer-1",
            reason:
              'Failed query: select * from "Product" params: secret-product-id',
          },
        ],
      }),
    ).resolves.toBe(true)

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        itemErrors: [
          {
            retailerId: "retailer-1",
            reason:
              "Meta Catalog sync failed. Please try again or contact support.",
          },
        ],
      }),
    )
  })

  test("writes the caller-provided failedCount instead of counting stored itemErrors", async () => {
    await metaCatalogSyncRunService.recordSubmission({
      runId: "run-1",
      submissionLeaseId: "lease-1",
      totalCount: 1,
      handles: [],
      skippedItems: [],
      failedCount: 0,
      itemErrors: [
        {
          retailerId: "retailer-1",
          reason: "Submission was interrupted; sync this item again",
        },
      ],
    })

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ failedCount: 0 }),
    )
  })
})
