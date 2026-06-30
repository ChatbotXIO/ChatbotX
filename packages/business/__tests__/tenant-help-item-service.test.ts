import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateBuilder = {
    returning: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
  }
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockReturnValue(updateBuilder)

  const deleteBuilder = {
    returning: vi.fn(),
    where: vi.fn(),
  }
  deleteBuilder.where.mockReturnValue(deleteBuilder)

  return {
    and: vi.fn((...predicates: unknown[]) => ({ predicates, type: "and" })),
    db: {
      delete: vi.fn(() => deleteBuilder),
      query: {
        tenantHelpItemModel: {
          findMany: vi.fn(),
        },
      },
      update: vi.fn(() => updateBuilder),
    },
    deleteBuilder,
    eq: vi.fn((field: unknown, value: unknown) => ({
      field,
      type: "eq",
      value,
    })),
    invalidateCacheByTags: vi.fn(async () => undefined),
    updateBuilder,
    withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: mocks.db,
  eq: mocks.eq,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tenantHelpItemModel: {
    id: "TenantHelpItem.id",
    tenantId: "TenantHelpItem.tenantId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  withCache: mocks.withCache,
}))

const { tenantHelpItemService } = await import(
  "../src/enterprise/tenant-help-item/service"
)
const { tenantHelpItemModel } = await import("@chatbotx.io/database/schema")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateBuilder.set.mockReturnValue(mocks.updateBuilder)
  mocks.updateBuilder.where.mockReturnValue(mocks.updateBuilder)
  mocks.deleteBuilder.where.mockReturnValue(mocks.deleteBuilder)
})

describe("tenantHelpItemService", () => {
  test("updates only the item in the resolved tenant", async () => {
    const item = { id: "item-1", tenantId: "tenant-1" }
    mocks.updateBuilder.returning.mockResolvedValue([item])

    const result = await tenantHelpItemService.update("item-1", "tenant-1", {
      name: "Docs",
    })

    expect(result).toBe(item)
    expect(mocks.db.update).toHaveBeenCalledWith(tenantHelpItemModel)
    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({ name: "Docs" })
    expect(mocks.eq).toHaveBeenCalledWith(tenantHelpItemModel.id, "item-1")
    expect(mocks.eq).toHaveBeenCalledWith(
      tenantHelpItemModel.tenantId,
      "tenant-1",
    )
    expect(mocks.and).toHaveBeenCalledWith(
      { field: tenantHelpItemModel.id, type: "eq", value: "item-1" },
      {
        field: tenantHelpItemModel.tenantId,
        type: "eq",
        value: "tenant-1",
      },
    )
    expect(mocks.updateBuilder.where).toHaveBeenCalledWith({
      predicates: [
        { field: tenantHelpItemModel.id, type: "eq", value: "item-1" },
        {
          field: tenantHelpItemModel.tenantId,
          type: "eq",
          value: "tenant-1",
        },
      ],
      type: "and",
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "tenant-help:tenant-1",
    ])
  })

  test("throws not found when updating an item outside the resolved tenant", async () => {
    mocks.updateBuilder.returning.mockResolvedValue([])

    await expect(
      tenantHelpItemService.update("item-1", "tenant-1", { name: "Docs" }),
    ).rejects.toMatchObject({
      code: "notFound",
      httpStatusCode: 404,
      message: "Help item not found",
    })
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("deletes only the item in the resolved tenant", async () => {
    mocks.deleteBuilder.returning.mockResolvedValue([{ id: "item-1" }])

    await tenantHelpItemService.remove("item-1", "tenant-1")

    expect(mocks.db.delete).toHaveBeenCalledWith(tenantHelpItemModel)
    expect(mocks.eq).toHaveBeenCalledWith(tenantHelpItemModel.id, "item-1")
    expect(mocks.eq).toHaveBeenCalledWith(
      tenantHelpItemModel.tenantId,
      "tenant-1",
    )
    expect(mocks.deleteBuilder.where).toHaveBeenCalledWith({
      predicates: [
        { field: tenantHelpItemModel.id, type: "eq", value: "item-1" },
        {
          field: tenantHelpItemModel.tenantId,
          type: "eq",
          value: "tenant-1",
        },
      ],
      type: "and",
    })
    expect(mocks.deleteBuilder.returning).toHaveBeenCalledWith({
      id: tenantHelpItemModel.id,
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "tenant-help:tenant-1",
    ])
  })

  test("throws not found when deleting an item outside the resolved tenant", async () => {
    mocks.deleteBuilder.returning.mockResolvedValue([])

    await expect(
      tenantHelpItemService.remove("item-1", "tenant-1"),
    ).rejects.toMatchObject({
      code: "notFound",
      httpStatusCode: 404,
      message: "Help item not found",
    })
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
