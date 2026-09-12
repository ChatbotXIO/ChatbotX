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
    list: vi.fn(),
    findWithSteps: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    assertOwned: vi.fn(),
    upsertStep: vi.fn(),
    deleteStep: vi.fn(),
    listStepContactsPage: vi.fn(),
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
    const { sequenceService } = await import("@chatbotx.io/business/sequence")
    vi.mocked(sequenceService.list).mockResolvedValue({
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
      invoke(sequencesPublicRouter[key], {
        id: "seq-1",
        stepId: "step-1",
        eventType: "message:sent",
      }),
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

  // Cross-workspace isolation: `workspaceId` must always come from the
  // authenticated token's `context.workspace.id`, never from client input —
  // even when the client's `{id}` path param names a sequence in a
  // different workspace. `upsertStep` is the highest-risk route here: the
  // request body has no `sequenceId` field of its own to disagree with the
  // path (see `publicUpsertSequenceStepRequest`), so a regression that read
  // `workspaceId` from anywhere but the token would be easy to miss.
  describe("cross-workspace isolation: workspaceId always comes from the token", () => {
    beforeEach(() => {
      findWorkspaceByTokenHash.mockResolvedValue(
        authResult(null) /* unrestricted scope, full permission */,
      )
    })

    test("upsertStep scopes both assertOwned and upsertStep to the token's workspace, not any workspace implied by the id", async () => {
      const { sequenceService } = await import("@chatbotx.io/business/sequence")
      vi.mocked(sequenceService.assertOwned).mockResolvedValue(
        undefined as never,
      )
      vi.mocked(sequenceService.upsertStep).mockResolvedValue({
        stepId: "step-1",
      } as never)

      await invoke(sequencesPublicRouter.upsertStep, {
        id: "888888",
        order: 0,
      })

      expect(sequenceService.assertOwned).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          sequenceId: "888888",
        }),
      )
      expect(sequenceService.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          sequenceId: "888888",
        }),
      )
    })

    test("deleteStep scopes both assertOwned and deleteStep to the token's workspace, not any workspace implied by the id", async () => {
      const { sequenceService } = await import("@chatbotx.io/business/sequence")
      vi.mocked(sequenceService.assertOwned).mockResolvedValue(
        undefined as never,
      )
      vi.mocked(sequenceService.deleteStep).mockResolvedValue(undefined)

      await invoke(sequencesPublicRouter.deleteStep, {
        id: "888888",
        stepId: "777777",
      })

      expect(sequenceService.assertOwned).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          sequenceId: "888888",
        }),
      )
      expect(sequenceService.deleteStep).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          stepId: "777777",
        }),
      )
    })
  })
})
