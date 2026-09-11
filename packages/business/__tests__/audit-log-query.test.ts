import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  relationsFilterToSQL: vi.fn((_model: unknown, where: unknown) => where),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      auditLogModel: {
        findMany: (args: unknown) => mocks.findMany(args),
      },
    },
    $count: (model: unknown, where: unknown) => mocks.count(model, where),
  },
  relationsFilterToSQL: (model: unknown, where: unknown) =>
    mocks.relationsFilterToSQL(model, where),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  auditLogModel: { id: "id", createdAt: "createdAt" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: () => ({ limit: 10, offset: 0 }),
  likeContains: (value: string) => `%${value}%`,
  parseOrderByAsObject: () => ({ createdAt: "desc" }),
}))

const { listAuditLogs } = await import("../src/audit/log-query")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
})

describe("listAuditLogs", () => {
  test("queries audit logs by workspace, bounded date range, user, and keyword", async () => {
    await listAuditLogs({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 10,
      keyword: "member",
      userId: "user-1",
      dateRange: {
        start: new Date("2026-05-19T00:00:00.000Z"),
        end: new Date("2026-08-16T23:59:59.999Z"),
      },
    })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace-1",
          userId: "user-1",
          createdAt: {
            gte: new Date("2026-05-19T00:00:00.000Z"),
            lte: new Date("2026-08-16T23:59:59.999Z"),
          },
          OR: [
            { action: { ilike: "%member%" } },
            { detail: { ilike: "%member%" } },
            { ipAddress: { ilike: "%member%" } },
          ],
        }),
        orderBy: { createdAt: "desc", id: "desc" },
      }),
    )
    expect(mocks.relationsFilterToSQL).toHaveBeenCalledWith(
      { id: "id", createdAt: "createdAt" },
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
      }),
    )
  })

  test("applies no OR filter without a keyword", async () => {
    await listAuditLogs({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 10,
      dateRange: {
        start: new Date("2026-05-19T00:00:00.000Z"),
        end: new Date("2026-08-16T23:59:59.999Z"),
      },
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.OR).toBeUndefined()
  })
})
