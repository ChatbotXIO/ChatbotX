import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exists: vi.fn((query: unknown) => ({ exists: query })),
  innerFrom: vi.fn(),
  innerWhere: vi.fn(),
  outerFrom: vi.fn(),
  outerWhere: vi.fn(),
  select: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  db: {
    select: (...args: unknown[]) => mocks.select(...args),
  },
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  exists: (...args: unknown[]) => mocks.exists(...args),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  ne: vi.fn((column: unknown, value: unknown) => ({ ne: [column, value] })),
  or: vi.fn((...conditions: unknown[]) => ({ or: conditions })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMetaCatalogModel: {
    deletedAt: "metaDeletedAt",
    id: "metaId",
    integrationId: "metaIntegrationId",
  },
  integrationModel: {
    id: "integrationId",
    integrationType: "integrationType",
    workspaceId: "workspaceId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { integrationService } = await import("../src/integration/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.select
    .mockImplementationOnce(() => ({ from: mocks.outerFrom }))
    .mockImplementationOnce(() => ({ from: mocks.innerFrom }))
  mocks.outerFrom.mockReturnValue({ where: mocks.outerWhere })
  mocks.innerFrom.mockReturnValue({ where: mocks.innerWhere })
  mocks.innerWhere.mockReturnValue("active-meta-catalog-subquery")
  mocks.outerWhere.mockResolvedValue([
    { id: "integration-1", integrationType: "metaCatalog" },
  ])
})

describe("integrationService.listByWorkspaceId", () => {
  test("requires an active Meta child before exposing its parent integration", async () => {
    await expect(
      integrationService.listByWorkspaceId("workspace-1"),
    ).resolves.toEqual([
      { id: "integration-1", integrationType: "metaCatalog" },
    ])

    expect(mocks.innerWhere).toHaveBeenCalledWith({
      and: [
        { eq: ["metaIntegrationId", "integrationId"] },
        { isNull: "metaDeletedAt" },
      ],
    })
    expect(mocks.exists).toHaveBeenCalledWith("active-meta-catalog-subquery")
  })
})
