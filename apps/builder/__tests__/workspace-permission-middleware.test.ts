// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { findMembership, resolveWorkspaceAccess } = vi.hoisted(() => ({
  findMembership: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  resolveWorkspaceAccess,
  workspaceMemberService: { findMembership },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  withAuditContext: (_actor: unknown, fn: () => unknown) => fn(),
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/tenant/request-tenant", () => ({
  canOpenWorkspaceOnHost: () => true,
  resolveRequestTenantId: async () => "root-tenant",
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

const { workspacePermissionMiddleware } = await import("@/middlewares/auth")

const next = vi.fn(async () => ({ output: "ok" }))

const run = (
  middleware: unknown,
  context: {
    user?: { id: string; email: string }
    workspaceMember?: { permissions: object }
  },
) =>
  (
    middleware as (
      opts: { context: typeof context; next: typeof next },
      workspaceId: string,
    ) => Promise<unknown>
  )({ context, next }, "ws-1")

const user = { email: "member@example.test", id: "user-1" }

beforeEach(() => {
  vi.clearAllMocks()
  findMembership.mockResolvedValue({ userId: "user-1" })
})

describe("workspacePermissionMiddleware", () => {
  test("reads the membership the workspace gate put in the context and looks nothing up", async () => {
    await expect(
      run(workspacePermissionMiddleware("broadcast"), {
        user,
        workspaceMember: { permissions: { broadcast: true } },
      }),
    ).resolves.toEqual({ output: "ok" })

    expect(findMembership).not.toHaveBeenCalled()
    expect(resolveWorkspaceAccess).not.toHaveBeenCalled()
  })

  test("a gated member without the permission is refused without a lookup", async () => {
    await expect(
      run(workspacePermissionMiddleware("broadcast"), {
        user,
        workspaceMember: { permissions: { broadcast: false } },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(findMembership).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  test("a superAdmin in the context passes any key", async () => {
    await expect(
      run(workspacePermissionMiddleware("flows"), {
        user,
        workspaceMember: { permissions: { superAdmin: true } },
      }),
    ).resolves.toEqual({ output: "ok" })
  })

  test("falls back to a lookup only when the gate did not run first", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      member: { permissions: { broadcast: true } },
    })

    await run(workspacePermissionMiddleware("broadcast"), { user })

    expect(findMembership).toHaveBeenCalledTimes(1)
  })

  test("lets a member holding the permission through", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      member: { permissions: { broadcast: true } },
    })

    await expect(
      run(workspacePermissionMiddleware("broadcast"), { user }),
    ).resolves.toEqual({ output: "ok" })
    expect(next).toHaveBeenCalledTimes(1)
    expect(findMembership).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("lets a superAdmin through without the specific key", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      member: { permissions: { superAdmin: true } },
    })

    await expect(
      run(workspacePermissionMiddleware("broadcast"), { user }),
    ).resolves.toEqual({ output: "ok" })
  })

  test("a member without the permission gets FORBIDDEN, not a not-found", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      member: { permissions: { broadcast: false } },
    })

    await expect(
      run(workspacePermissionMiddleware("broadcast"), { user }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(next).not.toHaveBeenCalled()
  })

  test("a caller with no access to the workspace is refused", async () => {
    resolveWorkspaceAccess.mockResolvedValue(undefined)

    await expect(
      run(workspacePermissionMiddleware("broadcast"), { user }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(next).not.toHaveBeenCalled()
  })

  test("an unauthenticated context is UNAUTHORIZED and reads nothing", async () => {
    await expect(
      run(workspacePermissionMiddleware("broadcast"), {}),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(findMembership).not.toHaveBeenCalled()
  })

  test("the key decides: a permission the member lacks is refused", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      member: { permissions: { broadcast: true } },
    })

    await expect(
      run(workspacePermissionMiddleware("flows"), { user }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
