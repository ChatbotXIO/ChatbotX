// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }))

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}))
vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  assertWorkspaceOwnerAccessForMethod: vi.fn(),
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/lib/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { authMiddleware } = await import("@/middlewares/auth")

const next = vi.fn()

/**
 * `/rpc` is a public prefix in the proxy middleware, so nothing redirects an
 * unauthenticated call before it reaches the handler. That is only safe while
 * the procedure's own gate answers with an oRPC error the client can read as
 * an expired session — a redirect would hand it the sign-in page's HTML.
 */
/** The middleware's own signature is wider than this test needs. */
const callAuthMiddleware = (context: {
  headers: Headers
  url: string
}): Promise<unknown> =>
  (
    authMiddleware as unknown as (opts: {
      context: { headers: Headers; url: string }
      next: typeof next
    }) => Promise<unknown>
  )({ context, next })

describe("rpc auth boundary", () => {
  const context = { headers: new Headers(), url: "http://localhost/rpc" }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("no session is rejected with UNAUTHORIZED, never a redirect", async () => {
    mockGetSession.mockResolvedValue(null)

    await expect(callAuthMiddleware(context)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    })
    expect(next).not.toHaveBeenCalled()
  })

  test("a session pending a password change is rejected with FORBIDDEN", async () => {
    mockGetSession.mockResolvedValue({
      session: { id: "s-1" },
      user: { id: "u-1", mustChangePassword: true },
    })

    await expect(callAuthMiddleware(context)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(next).not.toHaveBeenCalled()
  })

  test("a valid session reaches the procedure", async () => {
    mockGetSession.mockResolvedValue({
      session: { id: "s-1" },
      user: { id: "u-1", mustChangePassword: false },
    })
    next.mockResolvedValue("handled")

    await expect(callAuthMiddleware(context)).resolves.toBe("handled")
    expect(next).toHaveBeenCalledTimes(1)
  })
})
