import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// metaCatalogItemRepository sendable-product queries. Mocks the drizzle query
// builder and operators at the module boundary and asserts the conditions the
// queries are built from — the scoping is what keeps one workspace's flow from
// resolving another workspace's products — without a real database.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  asc: vi.fn((column: unknown) => ({ asc: column })),
  count: vi.fn(() => "count()"),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  ilike: vi.fn((column: unknown, pattern: unknown) => ({
    ilike: [column, pattern],
  })),
  inArray: vi.fn((column: unknown, values: unknown) => ({
    inArray: [column, values],
  })),
  select: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  asc: mocks.asc,
  count: mocks.count,
  db: { select: mocks.select },
  eq: mocks.eq,
  ilike: mocks.ilike,
  inArray: mocks.inArray,
  isNull: (column: string) => `isNull(${column})`,
  ne: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMetaCatalogModel: {
    id: "connection.id",
    workspaceId: "connection.workspaceId",
    catalogId: "connection.catalogId",
    deletedAt: "connection.deletedAt",
  },
  metaCatalogItemModel: {
    integrationMetaCatalogId: "item.integrationMetaCatalogId",
    catalogId: "item.catalogId",
    productId: "item.productId",
    retailerId: "item.retailerId",
  },
  productModel: {
    id: "product.id",
    workspaceId: "product.workspaceId",
    isActive: "product.isActive",
    name: "product.name",
    images: "product.images",
    price: "product.price",
    currency: "product.currency",
  },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(
    (input: { page?: number; perPage?: number }) => ({
      limit: input.perPage ?? 20,
      offset: ((input.page ?? 1) - 1) * (input.perPage ?? 20),
    }),
  ),
  likeContains: vi.fn((value: string) => `%${value}%`),
}))

const { metaCatalogItemRepository } = await import(
  "../src/repositories/meta-catalog-item/repository"
)

const SCOPE = { integrationMetaCatalogId: "conn-1", catalogId: "cat-1" }

/** A query-builder double: every step returns itself and awaiting it yields `rows`. */
const queryBuilder = (rows: unknown) => {
  const builder: Record<string, unknown> = {}
  for (const step of [
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
  ]) {
    builder[step] = vi.fn(() => builder)
  }
  // Awaiting the builder is how drizzle runs a query, so the double must be thenable.
  // biome-ignore lint/suspicious/noThenProperty: see comment above
  builder.then = (resolve: (value: unknown) => unknown) => resolve(rows)
  return builder as Record<string, ReturnType<typeof vi.fn>> & { then: unknown }
}

const conditionsOf = (builder: ReturnType<typeof queryBuilder>) =>
  JSON.stringify(builder.where?.mock.calls[0])

beforeEach(() => {
  vi.clearAllMocks()
})

describe("metaCatalogItemRepository.findSendableByProductIds", () => {
  test("scopes to the workspace, the current catalog and active products", async () => {
    const builder = queryBuilder([{ productId: "1" }])
    mocks.select.mockReturnValue(builder)

    const rows = await metaCatalogItemRepository.findSendableByProductIds({
      ...SCOPE,
      workspaceId: "ws-1",
      productIds: ["1", "2"],
    })

    expect(rows).toEqual([{ productId: "1" }])
    expect(mocks.select).toHaveBeenCalledTimes(1)
    const conditions = conditionsOf(builder)
    expect(conditions).toContain('"item.integrationMetaCatalogId","conn-1"')
    expect(conditions).toContain('"item.catalogId","cat-1"')
    expect(conditions).toContain('"product.workspaceId","ws-1"')
    expect(conditions).toContain('"product.isActive",true')
    // The connection must still be live, in this workspace and on this catalog.
    expect(conditions).toContain('"connection.workspaceId","ws-1"')
    expect(conditions).toContain('"connection.catalogId","cat-1"')
    expect(conditions).toContain("isNull(connection.deletedAt)")
    expect(mocks.inArray).toHaveBeenCalledWith("item.productId", ["1", "2"])
  })

  test("does not query for an empty id list", async () => {
    expect(
      await metaCatalogItemRepository.findSendableByProductIds({
        ...SCOPE,
        workspaceId: "ws-1",
        productIds: [],
      }),
    ).toEqual([])
    expect(mocks.select).not.toHaveBeenCalled()
  })
})

describe("metaCatalogItemRepository.listSendableProducts", () => {
  test("pages with a stable order and derives the page count from the total", async () => {
    const rowsBuilder = queryBuilder([{ productId: "1" }])
    const totalBuilder = queryBuilder([{ total: 45 }])
    mocks.select
      .mockReturnValueOnce(rowsBuilder)
      .mockReturnValueOnce(totalBuilder)

    const page = await metaCatalogItemRepository.listSendableProducts({
      ...SCOPE,
      workspaceId: "ws-1",
      page: 3,
      perPage: 10,
    })

    expect(page).toEqual({ data: [{ productId: "1" }], pageCount: 5 })
    expect(rowsBuilder.limit).toHaveBeenCalledWith(10)
    expect(rowsBuilder.offset).toHaveBeenCalledWith(20)
    expect(mocks.asc).toHaveBeenNthCalledWith(1, "product.name")
    expect(mocks.asc).toHaveBeenNthCalledWith(2, "product.id")
    // Same conditions on the page and its count, or the picker would lie.
    expect(conditionsOf(totalBuilder)).toBe(conditionsOf(rowsBuilder))
  })

  test("filters by name with an escaped LIKE pattern, never raw SQL", async () => {
    mocks.select
      .mockReturnValueOnce(queryBuilder([]))
      .mockReturnValueOnce(queryBuilder([{ total: 0 }]))

    await metaCatalogItemRepository.listSendableProducts({
      ...SCOPE,
      workspaceId: "ws-1",
      keyword: "100%",
    })

    expect(mocks.ilike).toHaveBeenCalledWith("product.name", "%100%%")
  })

  test("narrows to the given product ids, and an empty list matches nothing", async () => {
    mocks.select
      .mockReturnValueOnce(queryBuilder([{ productId: "1" }]))
      .mockReturnValueOnce(queryBuilder([{ total: 1 }]))

    await metaCatalogItemRepository.listSendableProducts({
      ...SCOPE,
      workspaceId: "ws-1",
      productIds: ["1", "2"],
    })
    expect(mocks.inArray).toHaveBeenCalledWith("item.productId", ["1", "2"])

    mocks.select.mockClear()
    expect(
      await metaCatalogItemRepository.listSendableProducts({
        ...SCOPE,
        workspaceId: "ws-1",
        productIds: [],
      }),
    ).toEqual({ data: [], pageCount: 0 })
    expect(mocks.select).not.toHaveBeenCalled()
  })

  test("reports zero pages for an empty catalog", async () => {
    mocks.select
      .mockReturnValueOnce(queryBuilder([]))
      .mockReturnValueOnce(queryBuilder([{ total: 0 }]))

    expect(
      await metaCatalogItemRepository.listSendableProducts({
        ...SCOPE,
        workspaceId: "ws-1",
      }),
    ).toEqual({ data: [], pageCount: 0 })
  })
})
