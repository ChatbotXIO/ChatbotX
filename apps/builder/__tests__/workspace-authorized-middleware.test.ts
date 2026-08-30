// @vitest-environment node

import { ORPCError } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findMembership,
  isWorkspaceScheduledForDeletion,
  checkWorkspaceOwnerAccess,
} = vi.hoisted(() => ({
  findMembership: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  checkWorkspaceOwnerAccess: vi.fn().mockResolvedValue(null),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceMemberService: { findMembership },
  isWorkspaceScheduledForDeletion,
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  withAuditContext: (_actor: unknown, fn: () => unknown) => fn(),
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess,
  isWorkspaceMutationMethod: (method: string | undefined) =>
    !["GET", "HEAD", "DELETE"].includes(method ?? "POST"),
  workspaceAccessDenialOrpcError: (reason: string) =>
    new ORPCError(reason, { status: 403 }),
}))

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
  checkWorkspaceOwnerAccess.mockResolvedValue(null)
  findMembership.mockResolvedValue(membership)
})

describe("workspaceAuthorizedMidddleware", () => {
  test("GET procedure with a blocked owner still passes", async () => {
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    await callMiddleware("GET")

    expect(next).toHaveBeenCalled()
  })

  test("POST procedure with a blocked owner is rejected with trialExpired 403", async () => {
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

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
})
