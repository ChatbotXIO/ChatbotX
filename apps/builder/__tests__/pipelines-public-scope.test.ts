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

const pipelineService = { list: vi.fn(), get: vi.fn() }
const pipelineItemService = { move: vi.fn() }
const pipelineItemQueryService = {
  getItem: vi.fn(),
  getItemView: vi.fn(),
  listItems: vi.fn(),
}
const pipelineStageBulkService = { deleteStage: vi.fn() }
const pipelineAnalyticsService = { getStats: vi.fn() }
const contactService = { resolveIdByIdentifier: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  contactService,
}))

vi.mock("@chatbotx.io/business/pipeline", () => ({
  pipelineService,
  pipelineItemService,
  pipelineItemQueryService,
  pipelineStageBulkService,
  pipelineAnalyticsService,
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
const { pipelinesPublicRouter } = await import(
  "../src/features/pipelines/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes },
})

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

describe("real router: pipelines public API scope wiring", () => {
  test("every pipelines procedure is denied to a token without the pipelines scope", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    for (const [name, procedure] of Object.entries(pipelinesPublicRouter)) {
      await expect(invoke(procedure), name).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Token is not authorized for the 'pipelines' scope",
      })
    }
  })

  test("a pipelines-scoped token reaches the service with the workspace token scope", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["pipelines"]))
    pipelineService.list.mockResolvedValue([])

    await expect(invoke(pipelinesPublicRouter.list)).resolves.toEqual({
      items: [],
    })

    expect(pipelineService.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      scope: { kind: "workspaceToken" },
    })
  })

  test("null scopes (unrestricted) pass", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    pipelineService.list.mockResolvedValue([])

    await expect(invoke(pipelinesPublicRouter.list)).resolves.toEqual({
      items: [],
    })
  })

  test("a read-only token cannot move an item", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(
      authResult(["pipelines"], "read_only"),
    )

    await expect(
      invoke(pipelinesPublicRouter.moveItem, {
        id: "1",
        itemId: "2",
        stageId: "3",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(pipelineItemService.move).not.toHaveBeenCalled()
  })

  test("a read-only token can still read the board's items", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(
      authResult(["pipelines"], "read_only"),
    )
    pipelineItemQueryService.listItems.mockResolvedValue({
      items: [],
      nextCursor: null,
    })

    await expect(
      invoke(pipelinesPublicRouter.listItems, { id: "1" }),
    ).resolves.toEqual({ items: [], nextCursor: null })
  })

  test("moving an item attributes the change to the API token", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["pipelines"]))
    pipelineItemService.move.mockResolvedValue({ id: "2" })
    // Mutations answer with the item card, not the attachment-loading detail.
    pipelineItemQueryService.getItemView.mockResolvedValue({
      item: {
        id: "2",
        pipelineId: "1",
        stageId: "3",
        contactId: "9",
        number: 1,
        title: "t",
        description: null,
        value: null,
        status: "open",
        priority: "medium",
        dueDate: null,
        fieldValues: {},
        createdById: null,
        stageEnteredAt: new Date(),
        closedAt: null,
        lastCommentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      contact: null,
      assignees: { workspaceMemberIds: [], inboxTeamIds: [] },
      commentCount: 0,
    })

    await invoke(pipelinesPublicRouter.moveItem, {
      id: "1",
      itemId: "2",
      stageId: "3",
    })

    expect(pipelineItemService.move).toHaveBeenCalledWith(
      expect.objectContaining({
        stageId: "3",
        scope: { kind: "workspaceToken" },
        actor: { kind: "workspaceToken", userId: null, sourceId: "token-1" },
      }),
    )
  })
})
