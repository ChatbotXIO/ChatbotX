// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findMembership,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
} = vi.hoisted(() => ({
  findMembership: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceMemberService: { findMembership },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  withAuditContext: (_actor: unknown, fn: () => unknown) => fn(),
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

const { workspaceAuthorizedMidddleware } = await import("@/middlewares/auth")

const next = vi.fn(async (opts?: { context: Record<string, unknown> }) => ({
  output: "ok",
  context: opts?.context,
}))

const callMiddleware = (method: string | undefined) =>
  (
    workspaceAuthorizedMidddleware as unknown as (
      opts: {
        context: {
          user: { id: string }
          headers: Headers
          session?: { ipAddress?: string; userAgent?: string }
        }
        next: typeof next
        procedure: { "~orpc": { route: { method?: string } } }
      },
      workspaceId: string,
    ) => Promise<unknown>
  )(
    {
      context: { user: { id: "user-1" }, headers: new Headers() },
      next,
      procedure: { "~orpc": { route: { method } } },
    },
    "ws-1",
  )

const membership = {
  workspace: { id: "ws-1", ownerId: "owner-1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  findMembership.mockResolvedValue(membership)
})

describe("workspaceAuthorizedMidddleware", () => {
  test("GET procedure with a blocked owner still passes", async () => {
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    await callMiddleware("GET")

    expect(next).toHaveBeenCalled()
  })

  test("POST procedure with a blocked owner is rejected with trialExpired 403", async () => {
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    await expect(callMiddleware("POST")).rejects.toMatchObject({
      code: "trialExpired",
      status: 403,
    })
    expect(next).not.toHaveBeenCalled()
  })

  test("no membership → UNAUTHORIZED", async () => {
    findMembership.mockResolvedValue(undefined)

    await expect(callMiddleware("GET")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  test("DELETE procedure with a blocked owner still passes (invariant #14)", async () => {
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    await callMiddleware("DELETE")

    expect(next).toHaveBeenCalled()
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("undefined method with a blocked owner is rejected (undeclared routes default to mutation)", async () => {
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    await expect(callMiddleware(undefined)).rejects.toMatchObject({
      code: "trialExpired",
      status: 403,
    })
  })

  test("scheduled-deletion workspace is rejected with FORBIDDEN and never reaches the owner-access gate", async () => {
    isWorkspaceScheduledForDeletion.mockReturnValue(true)

    await expect(callMiddleware("GET")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Workspace deletion scheduled",
    })
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("next is called with the membership's workspace in context", async () => {
    await callMiddleware("GET")

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { workspace: membership.workspace },
      }),
    )
  })
})
