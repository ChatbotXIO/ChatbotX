import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedHandler = (args: {
  context: { workspace: { id: string } }
  input: unknown
}) => Promise<unknown>

type CapturedProcedure = {
  route: RouteConfig
  handler?: CapturedHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: CapturedHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const assertEnterpriseFeatures = vi.fn()
const listAuditLogs = vi.fn()
const parseAuditLogsDateRange = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/business", () => ({ assertEnterpriseFeatures }))

vi.mock("@chatbotx.io/business/audit", () => ({ listAuditLogs }))

vi.mock("@/enterprise/features/audit-logs/schema/public", () => ({
  listAuditLogsPublicRequest: z.object({}),
  listAuditLogsPublicResponse: z.object({}),
}))

vi.mock("@/enterprise/features/audit-logs/schema/query", () => ({
  parseAuditLogsDateRange,
}))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnListingEnterpriseResource: {},
}))

await import("@/enterprise/features/audit-logs/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
  assertEnterpriseFeatures.mockResolvedValue(undefined)
})

test("registers the audit logs public router under the workspace scope", () => {
  expect(scopeArgAtImport).toBe("workspace")
})

describe("GET /v1/audit-logs", () => {
  const procedure = findProcedure("GET", "/v1/audit-logs")

  test("lists audit logs in the authenticated workspace with the parsed date range", async () => {
    const dateRange = {
      from: "2026-08-01",
      to: "2026-08-14",
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-08-14T23:59:59.999Z"),
    }
    const serviceResult = {
      data: [
        {
          id: "log-1",
          workspaceId: "workspace-1",
          action: "workspace.updated",
        },
      ],
      pageCount: 1,
    }
    parseAuditLogsDateRange.mockReturnValueOnce(dateRange)
    listAuditLogs.mockResolvedValueOnce(serviceResult)

    await expect(
      procedure.handler?.({
        context,
        input: {
          workspaceId: "workspace-other",
          page: 2,
          perPage: 20,
          from: "2026-08-01",
          to: "2026-08-14",
          sort: [{ id: "createdAt", desc: true }],
          keyword: "updated",
          userId: "user-1",
        },
      }),
    ).resolves.toEqual(serviceResult)

    expect(assertEnterpriseFeatures).toHaveBeenCalledTimes(1)
    expect(parseAuditLogsDateRange).toHaveBeenCalledWith({
      workspaceId: "workspace-other",
      page: 2,
      perPage: 20,
      from: "2026-08-01",
      to: "2026-08-14",
      sort: [{ id: "createdAt", desc: true }],
      keyword: "updated",
      userId: "user-1",
    })
    expect(listAuditLogs).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 20,
      sort: [{ id: "createdAt", desc: true }],
      keyword: "updated",
      userId: "user-1",
      dateRange: {
        start: dateRange.start,
        end: dateRange.end,
      },
    })
  })

  test("returns the service result unchanged, leaving workspaceId stripping to the output schema", async () => {
    const serviceResult = {
      data: [{ id: "log-1", workspaceId: "workspace-1" }],
      pageCount: 1,
    }
    parseAuditLogsDateRange.mockReturnValueOnce({
      from: "2026-08-01",
      to: "2026-08-14",
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-08-14T23:59:59.999Z"),
    })
    listAuditLogs.mockResolvedValueOnce(serviceResult)

    await expect(
      procedure.handler?.({
        context,
        input: {
          page: 1,
          perPage: 50,
          from: "2026-08-01",
          to: "2026-08-14",
          sort: [{ id: "createdAt", desc: true }],
        },
      }),
    ).resolves.toMatchObject({
      data: [{ workspaceId: "workspace-1" }],
      pageCount: 1,
    })
  })
})
