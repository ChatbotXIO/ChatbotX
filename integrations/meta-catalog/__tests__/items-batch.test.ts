import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock("../src/lib/http-client", () => ({
  metaCatalogGraphClient: {
    get: (...args: unknown[]) => mocks.get(...args),
    post: (...args: unknown[]) => mocks.post(...args),
  },
  graphAuthHeaders: (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
  }),
}))

vi.mock("@chatbotx.io/integration-messenger/apis/usage", () => ({
  parseBucHeader: vi.fn(),
}))

const { checkItemsBatch, submitItemsBatch } = await import(
  "../src/apis/items-batch"
)

const checkBatch = () =>
  checkItemsBatch({
    accessToken: "token",
    catalogId: "catalog-1",
    handle: "handle-1",
    retailerIds: ["product-1", "product-2"],
    version: "v24.0",
  })

beforeEach(() => {
  vi.clearAllMocks()
})

describe("checkItemsBatch", () => {
  test("keeps processing batches pending until Meta reports a terminal status", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: [{ handle: "handle-1", status: "processing" }],
      },
      businessUsageHeader: null,
    })

    await expect(checkBatch()).resolves.toEqual({
      completed: false,
      results: [],
    })
  })

  test("marks every requested retailer ID successful after a clean finish", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: [
          {
            handle: "handle-1",
            status: "finished",
            errors_total_count: 0,
            ids_of_invalid_requests: [],
          },
        ],
      },
      businessUsageHeader: null,
    })

    await expect(checkBatch()).resolves.toEqual({
      completed: true,
      results: [
        { retailerId: "product-1", success: true },
        { retailerId: "product-2", success: true },
      ],
    })
  })

  test("maps recognized invalid request IDs without hiding successful items", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: [
          {
            handle: "handle-1",
            status: "finished",
            errors: [{ message: "Invalid image" }],
            errors_total_count: 1,
            ids_of_invalid_requests: ["product-2"],
          },
        ],
      },
      businessUsageHeader: null,
    })

    await expect(checkBatch()).resolves.toEqual({
      completed: true,
      results: [
        { retailerId: "product-1", success: true },
        {
          retailerId: "product-2",
          success: false,
          error: "Invalid image",
        },
      ],
    })
  })

  test("fails closed when Meta error identifiers cannot be mapped safely", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: [
          {
            handle: "handle-1",
            status: "finished",
            errors_total_count: 1,
            ids_of_invalid_requests: [42],
          },
        ],
      },
      businessUsageHeader: null,
    })

    const result = await checkBatch()

    expect(result.completed).toBe(true)
    expect(result.results).toEqual([
      expect.objectContaining({ retailerId: "product-1", success: false }),
      expect.objectContaining({ retailerId: "product-2", success: false }),
    ])
  })
})

describe("submitItemsBatch", () => {
  const submitBatch = () =>
    submitItemsBatch({
      accessToken: "token",
      catalogId: "catalog-1",
      version: "v24.0",
      requests: [
        {
          method: "CREATE",
          retailerId: "product-1",
          data: { title: "Product" } as never,
        },
      ],
    })

  beforeEach(() => {
    mocks.post.mockResolvedValue({
      data: { handles: ["handle-1"] },
      businessUsageHeader: null,
    })
  })

  test("sends the batch as form fields Graph accepts", async () => {
    await submitBatch()

    expect(mocks.post).toHaveBeenCalledWith(
      "v24.0/catalog-1/items_batch",
      expect.objectContaining({
        form: expect.objectContaining({
          item_type: "PRODUCT_ITEM",
          allow_upsert: "true",
        }),
      }),
    )
  })

  test("encodes requests as a JSON string keyed by data.id", async () => {
    await submitBatch()

    const { form } = mocks.post.mock.calls[0][1] as {
      form: Record<string, string>
    }
    expect(JSON.parse(form.requests)).toEqual([
      { method: "CREATE", data: { title: "Product", id: "product-1" } },
    ])
  })
})
