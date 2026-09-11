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
  broadcastService: {
    findByIdOrName: vi.fn(),
    listExistingIds: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateDraft: vi.fn(),
    scheduleDraft: vi.fn(),
    moveToDraft: vi.fn(),
    stopSending: vi.fn(),
    resumeSending: vi.fn(),
    resendWithPruning: vi.fn(),
    softDeleteBroadcasts: vi.fn(),
  },
  contactInboxService: { findManyByIds: vi.fn() },
}))

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: vi.fn() },
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

// The broadcasts router's queries hit the database at import time
// (`@chatbotx.io/database/client`); never reached on the FORBIDDEN path this
// test exercises, but the import chain must not try to open a connection.
vi.mock("../src/features/broadcasts/queries", () => ({
  listBroadcasts: vi.fn(),
  listBroadcastAudience: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { broadcastsPublicRouter } = await import(
  "../src/features/broadcasts/api/public"
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

describe("real router: broadcasts public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/broadcasts route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(broadcastsPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'broadcasts' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/broadcasts route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    const { listBroadcasts } = await import(
      "../src/features/broadcasts/queries"
    )
    vi.mocked(listBroadcasts).mockResolvedValue({
      data: [],
      pageCount: 1,
    } as never)

    await expect(invoke(broadcastsPublicRouter.list)).resolves.toMatchObject({
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
  const routeKeys = Object.keys(broadcastsPublicRouter) as Array<
    keyof typeof broadcastsPublicRouter
  >

  test.each(
    routeKeys,
  )("a contacts-scoped token is denied %s with FORBIDDEN", async (key) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(broadcastsPublicRouter[key], { id: "b-1", idOrName: "b-1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'broadcasts' scope",
    })
  })

  test("a read_only token is denied POST /v1/broadcasts before any service call", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "read_only" as const,
        scopes: null,
      },
    })

    await expect(
      invoke(broadcastsPublicRouter.create, {
        channel: "whatsapp",
        flowId: "flow-1",
        subaction: "whatsappTemplateMessage",
        schedulesType: "now",
        schedulesAt: null,
        contactFilter: { operator: "and", conditions: [] },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    const { broadcastService } = await import("@chatbotx.io/business")
    expect(broadcastService.create).not.toHaveBeenCalled()
  })

  // Cross-workspace isolation: `workspaceId` must always come from the
  // authenticated token's `context.workspace.id`, never from client input —
  // even when the client's `id` path param names a resource in a different
  // workspace. These pin that down for the routes where a foreign id is
  // most likely to slip a guard (a broadcast id resolved to a row before a
  // status/existence check, per the plan's finding #5).
  describe("cross-workspace isolation: workspaceId always comes from the token", () => {
    beforeEach(() => {
      findWorkspaceByTokenHash.mockResolvedValue(
        authResult(null) /* unrestricted scope, full permission */,
      )
    })

    test("resend scopes to the token's workspace, not any workspace implied by the id", async () => {
      const { broadcastService } = await import("@chatbotx.io/business")
      vi.mocked(broadcastService.resendWithPruning).mockResolvedValue({
        id: "new-b-1",
        name: "My broadcast (Resend)",
        status: "scheduled",
        schedulesType: "now",
        schedulesAt: new Date("2026-01-01T00:00:00.000Z"),
        flowId: "flow-1",
        contactCount: 0,
      } as never)

      await invoke(broadcastsPublicRouter.resend, { id: "999999" })

      expect(broadcastService.resendWithPruning).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          id: "999999",
        }),
      )
    })

    test("updateDraft scopes to the token's workspace, not any workspace implied by the id", async () => {
      const { broadcastService } = await import("@chatbotx.io/business")
      vi.mocked(broadcastService.updateDraft).mockResolvedValue({
        id: "999999",
      } as never)

      await invoke(broadcastsPublicRouter.updateDraft, {
        id: "999999",
        channel: "whatsapp",
        flowId: "111111",
        subaction: "whatsappTemplateMessage",
        schedulesType: "now",
        schedulesAt: null,
        contactFilter: { operator: "and", conditions: [] },
        saveAsDraft: true,
      })

      expect(broadcastService.updateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          broadcastId: "999999",
        }),
      )
    })

    test("listContacts scopes both the broadcast lookup and the contact-inbox lookup to the token's workspace", async () => {
      const { broadcastService, contactInboxService } = await import(
        "@chatbotx.io/business"
      )
      const { broadcastAnalyticsService } = await import(
        "@chatbotx.io/analytics"
      )
      vi.mocked(broadcastService.listExistingIds).mockResolvedValue([
        "999999",
      ] as never)
      vi.mocked(broadcastAnalyticsService.getContacts).mockResolvedValue({
        contactInboxIds: ["ci-1"],
        contactEventMap: new Map([
          [
            "ci-1",
            {
              contactId: "contact-1",
              occurredAt: "2026-01-01T00:00:00.000Z",
              errorContent: null,
            },
          ],
        ]),
        total: 1,
      } as never)
      vi.mocked(contactInboxService.findManyByIds).mockResolvedValue([])

      await invoke(broadcastsPublicRouter.listContacts, {
        id: "999999",
        eventType: "message:sent",
        page: 1,
        perPage: 20,
      })

      expect(broadcastService.listExistingIds).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1" }),
      )
      expect(broadcastAnalyticsService.getContacts).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1" }),
      )
      expect(contactInboxService.findManyByIds).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1" }),
      )
    })
  })
})
