// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertEnterpriseFeatures: vi.fn(),
  assertWorkspaceSuperAdmin: vi.fn(),
  listWorkspaceMembers: vi.fn(
    async (_input: unknown): Promise<unknown[]> => [],
  ),
  findMany: vi.fn(async (_args: unknown) => []),
  count: vi.fn(async (_model: unknown, _where: unknown) => 0),
  relationsFilterToSQL: vi.fn((_model: unknown, where: unknown) => where),
  getPaginationWithDefaults: vi.fn((_input: unknown) => ({
    limit: 10,
    offset: 0,
  })),
  parseOrderByAsObject: vi.fn((_model: unknown, _input: unknown) => ({
    createdAt: "desc",
  })),
}))

vi.mock("@chatbotx.io/business", () => ({
  assertEnterpriseFeatures: mocks.assertEnterpriseFeatures,
  workspaceMemberService: {
    listByWorkspaceId: (input: unknown) => mocks.listWorkspaceMembers(input),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  auditLogModel: { id: "id", createdAt: "createdAt" },
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

vi.mock("@chatbotx.io/database/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/utils")>()
  return {
    ...actual,
    getPaginationWithDefaults: (input: unknown) =>
      mocks.getPaginationWithDefaults(input),
    parseOrderByAsObject: (model: unknown, input: unknown) =>
      mocks.parseOrderByAsObject(model, input),
  }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: (workspaceId: string) =>
    mocks.assertWorkspaceSuperAdmin(workspaceId),
}))

const { listAuditLogAdmins, listAuditLogs } = await import(
  "../src/enterprise/features/audit-logs/queries"
)
const { getDefaultAuditLogsRange, parseAuditLogsDateRange } = await import(
  "../src/enterprise/features/audit-logs/schema/query"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertEnterpriseFeatures.mockResolvedValue(undefined)
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.listWorkspaceMembers.mockResolvedValue([])
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
})

describe("listAuditLogAdmins", () => {
  test("returns only super admins as user filter options", async () => {
    mocks.listWorkspaceMembers.mockResolvedValue([
      {
        permissions: { superAdmin: true },
        user: { id: "user-1", name: "Admin One", email: "one@example.com" },
      },
      {
        permissions: { superAdmin: false },
        user: { id: "user-2", name: "Member Two", email: "two@example.com" },
      },
      {
        permissions: { superAdmin: true },
        user: { id: "user-3", name: null, email: "three@example.com" },
      },
    ])

    await expect(listAuditLogAdmins("workspace-1")).resolves.toEqual([
      { id: "user-1", label: "Admin One" },
      { id: "user-3", label: "three@example.com" },
    ])

    expect(mocks.assertEnterpriseFeatures).toHaveBeenCalled()
    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("workspace-1")
    expect(mocks.listWorkspaceMembers).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })
})

describe("audit log query schema", () => {
  test("defaults to a 90 day UTC date window", () => {
    expect(
      getDefaultAuditLogsRange(new Date("2026-08-16T10:30:00.000Z")),
    ).toEqual({
      from: "2026-05-19",
      to: "2026-08-16",
    })
  })

  test("falls back when from/to are invalid or reversed", () => {
    const parsed = parseAuditLogsDateRange(
      {
        from: "2026-08-16",
        to: "2026-05-19",
      },
      new Date("2026-08-16T10:30:00.000Z"),
    )

    expect(parsed).toEqual(
      expect.objectContaining({
        from: "2026-05-19",
        to: "2026-08-16",
      }),
    )
  })

  test("rejects malformed date keys and falls back to the default window", () => {
    const parsed = parseAuditLogsDateRange(
      {
        from: "2026-99-99",
        to: "not-a-date",
      },
      new Date("2026-08-16T10:30:00.000Z"),
    )

    expect(parsed).toEqual(
      expect.objectContaining({
        from: "2026-05-19",
        to: "2026-08-16",
      }),
    )
  })

  test("clamps future to dates to today", () => {
    const parsed = parseAuditLogsDateRange(
      {
        from: "2026-07-01",
        to: "2026-12-31",
      },
      new Date("2026-08-16T10:30:00.000Z"),
    )

    expect(parsed).toEqual(
      expect.objectContaining({
        from: "2026-07-01",
        to: "2026-08-16",
      }),
    )
  })

  test("clamps date ranges to a maximum 90 day window", () => {
    const parsed = parseAuditLogsDateRange(
      {
        from: "2025-01-01",
        to: "2026-08-16",
      },
      new Date("2026-08-16T10:30:00.000Z"),
    )

    expect(parsed).toEqual(
      expect.objectContaining({
        from: "2026-05-19",
        to: "2026-08-16",
      }),
    )
  })
})

describe("listAuditLogs", () => {
  test("requires enterprise and workspace super admin access", async () => {
    await listAuditLogs({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 10,
      from: "2026-05-01",
      to: "2026-08-16",
      keyword: "",
      userId: "",
      sort: [{ id: "createdAt", desc: true }],
    })

    expect(mocks.assertEnterpriseFeatures).toHaveBeenCalled()
    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("workspace-1")
  })

  test("queries audit logs by workspace, bounded date range, user, and keyword", async () => {
    await listAuditLogs({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 10,
      from: "2026-05-19",
      to: "2026-08-16",
      keyword: "member",
      userId: "user-1",
      sort: [{ id: "createdAt", desc: true }],
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
})
