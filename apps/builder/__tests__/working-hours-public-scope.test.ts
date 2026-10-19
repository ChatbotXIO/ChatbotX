// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const workingHoursService = {
  listByWorkspace: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  workingHoursService,
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { workingHoursPublicRouter } = await import(
  "../src/features/working-hours/api/public"
)

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes },
})

const headers = () => ({
  headers: new Headers({ Authorization: "Bearer cbx_ws_fixture" }),
})

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: working-hours public API scope wiring", () => {
  test("a contacts-scoped token is denied GET /v1/working-hours with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))
    await expect(
      call(workingHoursPublicRouter.list, {}, { context: headers() }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
    expect(workingHoursService.listByWorkspace).not.toHaveBeenCalled()
  })

  test("an inbox-scoped token passes the real list route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    workingHoursService.listByWorkspace.mockResolvedValue([])
    await expect(
      call(workingHoursPublicRouter.list, {}, { context: headers() }),
    ).resolves.toMatchObject({ data: [] })
  })

  test("a read_only token cannot delete a schedule", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(
      authResult(["inbox"], "read_only"),
    )
    await expect(
      call(
        workingHoursPublicRouter.delete,
        { id: "9" },
        { context: headers() },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(workingHoursService.delete).not.toHaveBeenCalled()
  })
})

describe("real router: service errors map to declared statuses", () => {
  test("a service validation error on update surfaces as the declared 422 validation code", async () => {
    const { validationException } = await import("@chatbotx.io/business/errors")
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    workingHoursService.update.mockRejectedValue(
      validationException("intervals", "Intervals overlap on weekday 1"),
    )
    await expect(
      call(
        workingHoursPublicRouter.update,
        { id: "9", intervals: [] },
        { context: headers() },
      ),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe("real router: input validation", () => {
  const call422 = (
    procedure: typeof workingHoursPublicRouter.create,
    input: unknown,
  ) =>
    call(procedure, input as never, { context: headers() }) as Promise<unknown>

  test("overlapping intervals are rejected as invalidRequestData (422) before the service runs", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    await expect(
      call422(workingHoursPublicRouter.create, {
        name: "Office",
        intervals: [
          { weekday: 1, startMinute: 540, endMinute: 700 },
          { weekday: 1, startMinute: 600, endMinute: 800 },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalidRequestData", status: 422 })
  })

  test("more than the member cap is rejected as invalidRequestData", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    const userIds = Array.from({ length: 1001 }, (_, index) =>
      String(index + 1),
    )
    await expect(
      call422(workingHoursPublicRouter.setMembers as never, {
        id: "9",
        userIds,
      }),
    ).rejects.toMatchObject({ code: "invalidRequestData", status: 422 })
  })

  test("an empty PATCH is rejected as invalidRequestData", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    await expect(
      call422(workingHoursPublicRouter.update as never, { id: "9" }),
    ).rejects.toMatchObject({ code: "invalidRequestData", status: 422 })
    expect(workingHoursService.update).not.toHaveBeenCalled()
  })
})
