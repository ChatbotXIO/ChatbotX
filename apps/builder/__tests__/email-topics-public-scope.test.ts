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

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  emailTopicService: {
    list: vi.fn(),
    findOrFail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
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

vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

// Dynamic import required: `vi.mock` above is hoisted, and only a dynamic
// `import()` after registration resolves to the mocked module — a static
// top-level import would race the mock and pull in the real module (in
// particular the full better-auth stack behind `@/orpc`'s other exports).
const { call } = await import("@orpc/server")
const { emailTopicsPublicRouter } = await import(
  "../src/features/email-topics/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

// Exercises every procedure in the router, whose input/output shapes are
// all different.
const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: email topics public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/email-topics route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(emailTopicsPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'broadcasts' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/email-topics route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    const { emailTopicService } = await import("@chatbotx.io/business")
    vi.mocked(emailTopicService.list).mockResolvedValue({
      data: [],
      pageCount: 1,
    } as never)

    await expect(invoke(emailTopicsPublicRouter.list)).resolves.toMatchObject({
      data: [],
      pageCount: 1,
    })
  })

  // Every procedure the router exports must be built from
  // `workspaceTokenAuthAPIForScope("broadcasts")` — a route that forgot it
  // would either compile-fail (wrong base client) or, if built from an
  // unscoped client by mistake, silently accept a contacts-scoped token
  // here. Iterating every key means a newly added procedure is covered
  // automatically without a matching test being written by hand.
  const routeKeys = Object.keys(emailTopicsPublicRouter) as Array<
    keyof typeof emailTopicsPublicRouter
  >

  test.each(
    routeKeys,
  )("a contacts-scoped token is denied %s with FORBIDDEN", async (key) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(emailTopicsPublicRouter[key], { id: "et-1", name: "x" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'broadcasts' scope",
    })
  })

  test("a read_only token is denied POST /v1/email-topics before any service call", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "read_only" as const,
        scopes: null,
      },
    })

    await expect(
      invoke(emailTopicsPublicRouter.create, { name: "My topic" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    const { emailTopicService } = await import("@chatbotx.io/business")
    expect(emailTopicService.create).not.toHaveBeenCalled()
  })

  describe("update", () => {
    beforeEach(() => {
      findWorkspaceByTokenHash.mockResolvedValue(
        authResult(null) /* unrestricted scope, full permission */,
      )
    })

    test("passes workspaceId from the token, not from input", async () => {
      const { emailTopicService } = await import("@chatbotx.io/business")
      vi.mocked(emailTopicService.update).mockResolvedValue({
        id: "888888",
        name: "x",
        workspaceId: "ws-1",
        folderId: null,
        sendsTotal: 0,
        deliveredsTotal: 0,
        seensTotal: 0,
        clicksTotal: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      await invoke(emailTopicsPublicRouter.update, {
        id: "888888",
        name: "x",
      })

      expect(emailTopicService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          id: "888888",
        }),
      )
    })

    test("strips workspaceId from the response even though the service returns it", async () => {
      const { emailTopicService } = await import("@chatbotx.io/business")
      vi.mocked(emailTopicService.update).mockResolvedValue({
        id: "888888",
        name: "x",
        workspaceId: "ws-1",
        folderId: null,
        sendsTotal: 0,
        deliveredsTotal: 0,
        seensTotal: 0,
        clicksTotal: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      const result = (await invoke(emailTopicsPublicRouter.update, {
        id: "888888",
        name: "x",
      })) as Record<string, unknown>

      expect(result).not.toHaveProperty("workspaceId")
      expect(result).toMatchObject({ id: "888888", name: "x" })
    })
  })

  describe("delete", () => {
    beforeEach(() => {
      findWorkspaceByTokenHash.mockResolvedValue(
        authResult(null) /* unrestricted scope, full permission */,
      )
    })

    test("rejects with a 404 when the service reports nothing was deleted", async () => {
      const { emailTopicService } = await import("@chatbotx.io/business")
      vi.mocked(emailTopicService.delete).mockResolvedValue({
        deletedCount: 0,
      })

      await expect(
        invoke(emailTopicsPublicRouter.delete, { id: "999999" }),
      ).rejects.toMatchObject({ status: 404 })
    })

    test("resolves when the service reports a deletion", async () => {
      const { emailTopicService } = await import("@chatbotx.io/business")
      vi.mocked(emailTopicService.delete).mockResolvedValue({
        deletedCount: 1,
      })

      await expect(
        invoke(emailTopicsPublicRouter.delete, { id: "888888" }),
      ).resolves.toBeUndefined()
    })
  })
})
