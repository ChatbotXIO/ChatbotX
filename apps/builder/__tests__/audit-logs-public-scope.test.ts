// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  assertEnterpriseFeatures,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  assertEnterpriseFeatures: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  assertEnterpriseFeatures,
}))

const listAuditLogs = vi.fn()
const withAuditContext = vi.fn(
  (_context: unknown, next: () => Promise<unknown>) => next(),
)

vi.mock("@chatbotx.io/business/audit", () => ({
  listAuditLogs,
  withAuditContext,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { auditLogsPublicRouter } = await import(
  "../src/enterprise/features/audit-logs/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const invoke = (input: Record<string, unknown> = {}) =>
  call(auditLogsPublicRouter.list, input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const auditLog = {
  id: "log-1",
  workspaceId: "ws-1",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  action: "workspace.updated",
  detail: "Workspace updated",
  ipAddress: "203.0.113.9",
  userAgent: "Vitest",
  source: "api",
  userId: "user-1",
  user: { id: "user-1", name: "Admin", image: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  assertEnterpriseFeatures.mockResolvedValue(undefined)
})

describe("real router: audit logs public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/audit-logs route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'workspace' scope",
    })

    expect(assertEnterpriseFeatures).not.toHaveBeenCalled()
    expect(listAuditLogs).not.toHaveBeenCalled()
  })

  test("null scopes (unrestricted) list only the authenticated workspace and hide workspaceId", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    listAuditLogs.mockResolvedValue({ data: [auditLog], pageCount: 1 })

    const result = await invoke({
      workspaceId: "ws-other",
      page: 2,
      perPage: 20,
      from: "2026-08-01",
      to: "2026-08-14",
      sort: [{ id: "createdAt", desc: true }],
      keyword: "updated",
      userId: "user-1",
    })

    expect(result).toMatchObject({ data: [{ id: "log-1" }], pageCount: 1 })
    expect(result.data[0]).not.toHaveProperty("workspaceId")
    expect(assertEnterpriseFeatures).toHaveBeenCalledTimes(1)
    expect(listAuditLogs).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      page: 2,
      perPage: 20,
      sort: [{ id: "createdAt", desc: true }],
      keyword: "updated",
      userId: "user-1",
      dateRange: {
        start: new Date("2026-08-01T00:00:00.000Z"),
        end: new Date("2026-08-14T23:59:59.999Z"),
      },
    })
  })

  test("surfaces the declared enterpriseFeatureRequired 403 error before listing audit logs", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    assertEnterpriseFeatures.mockRejectedValueOnce(
      Object.assign(new Error("This feature requires an enterprise license"), {
        code: "enterpriseFeatureRequired",
        httpStatusCode: 403,
      }),
    )

    await expect(invoke()).rejects.toMatchObject({
      code: "enterpriseFeatureRequired",
      httpStatusCode: 403,
      message: "This feature requires an enterprise license",
    })

    expect(listAuditLogs).not.toHaveBeenCalled()
  })
})
