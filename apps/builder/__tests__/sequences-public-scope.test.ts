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
}))

vi.mock("@chatbotx.io/business/sequence", () => ({
  sequenceService: {
    findWithSteps: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    assertOwned: vi.fn(),
    upsertStep: vi.fn(),
    deleteStep: vi.fn(),
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

// The sequences router's queries hit the database at import time
// (`@chatbotx.io/database/client`); never reached on the FORBIDDEN path this
// test exercises, but the import chain must not try to open a connection.
vi.mock("../src/features/sequences/queries", () => ({
  listSequences: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { sequencesPublicRouter } = await import(
  "../src/features/sequences/api/public"
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

describe("real router: sequences public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/sequences route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(sequencesPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'broadcasts' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/sequences route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    const { listSequences } = await import("../src/features/sequences/queries")
    vi.mocked(listSequences).mockResolvedValue({
      data: [],
      pageCount: 1,
    } as never)

    await expect(invoke(sequencesPublicRouter.list)).resolves.toMatchObject({
      data: [],
      pageCount: 1,
    })
  })

  // Every procedure the router exports must be built from
  // `workspaceTokenAuthAPIForScope("broadcasts")` (sequences share the
  // broadcasts scope) — iterating every key means a newly added procedure
  // is covered automatically without a matching test being written by hand.
  const routeKeys = Object.keys(sequencesPublicRouter) as Array<
    keyof typeof sequencesPublicRouter
  >

  test.each(
    routeKeys,
  )("a contacts-scoped token is denied %s with FORBIDDEN", async (key) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(sequencesPublicRouter[key], { id: "seq-1", stepId: "step-1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'broadcasts' scope",
    })
  })

  test("a read_only token is denied POST /v1/sequences before any service call", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "read_only" as const,
        scopes: null,
      },
    })

    await expect(
      invoke(sequencesPublicRouter.create, { name: "My sequence" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    const { sequenceService } = await import("@chatbotx.io/business/sequence")
    expect(sequenceService.create).not.toHaveBeenCalled()
  })
})
