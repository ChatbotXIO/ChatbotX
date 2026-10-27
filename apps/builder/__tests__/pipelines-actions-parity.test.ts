// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Server actions and public handlers must converge on ONE service method per
// operation; only the caller's scope/actor differ (AGENTS.md invariant 23).

type ActionHandler = (args: {
  bindArgsParsedInputs: string[]
  parsedInput: Record<string, unknown>
  ctx: unknown
}) => Promise<unknown>

type CapturedAction = {
  client: "normal" | "allowExpired"
  handler: ActionHandler
}

const mocks = vi.hoisted(() => {
  const autoFns = () => {
    const cache: Record<string, ReturnType<typeof vi.fn>> = {}
    return new Proxy(cache, {
      get: (target, prop: string) => {
        if (prop === "then") {
          return
        }
        target[prop] ??= vi.fn().mockResolvedValue(undefined)
        return target[prop]
      },
    })
  }
  return {
    findWorkspaceByTokenHash: vi.fn(),
    isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
    getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
    isAtLimit: vi.fn().mockResolvedValue(false),
    assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
    pipelineService: autoFns(),
    pipelineStructureService: autoFns(),
    pipelineMemberService: autoFns(),
    pipelineItemService: autoFns(),
    pipelineItemContentService: autoFns(),
    pipelineItemQueryService: autoFns(),
    pipelineStageBulkService: autoFns(),
    pipelineAnalyticsService: autoFns(),
  }
})

function makeChain(client: CapturedAction["client"]) {
  const chain = {
    bindArgsSchemas: () => chain,
    inputSchema: () => chain,
    action: (handler: ActionHandler): CapturedAction => ({ client, handler }),
  }
  return chain
}

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: makeChain("normal"),
  workspaceActionClientAllowExpired: makeChain("allowExpired"),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    ...actual,
    workspaceApiTokenService: {
      findWorkspaceByTokenHash: mocks.findWorkspaceByTokenHash,
    },
    isWorkspaceScheduledForDeletion: mocks.isWorkspaceScheduledForDeletion,
    userQuotaService: { getAccessState: mocks.getAccessState },
    quotaEnforcementService: { isAtLimit: mocks.isAtLimit },
  }
})

vi.mock("@chatbotx.io/business/pipeline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/business/pipeline")>()
  return {
    ...actual,
    pipelineService: mocks.pipelineService,
    pipelineStructureService: mocks.pipelineStructureService,
    pipelineMemberService: mocks.pipelineMemberService,
    pipelineItemService: mocks.pipelineItemService,
    pipelineItemContentService: mocks.pipelineItemContentService,
    pipelineItemQueryService: mocks.pipelineItemQueryService,
    pipelineStageBulkService: mocks.pipelineStageBulkService,
    pipelineAnalyticsService: mocks.pipelineAnalyticsService,
  }
})

vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited: mocks.assertApiNotRateLimited,
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { pipelinesPublicRouter } = await import(
  "../src/features/pipelines/api/public"
)
const pipelineActions = await import(
  "../src/features/pipelines/actions/pipeline.action"
)
const stageActions = await import(
  "../src/features/pipelines/actions/stage.action"
)
const fieldMemberActions = await import(
  "../src/features/pipelines/actions/field-member.action"
)
const itemActions = await import(
  "../src/features/pipelines/actions/item.action"
)

const actions = {
  ...pipelineActions,
  ...stageActions,
  ...fieldMemberActions,
  ...itemActions,
} as unknown as Record<string, CapturedAction>

const router = pipelinesPublicRouter as Record<string, unknown>

const TOKEN = "cbx_ws_fixture"
const WORKSPACE_ID = "ws-1"

const memberCtx = (overrides: Record<string, unknown> = {}) => ({
  user: { id: "user-7" },
  workspaceMember: { id: "member-4", permissions: {}, role: "agent" },
  isSupportSession: false,
  ...overrides,
})

const invokePublic = (procedure: unknown, input: unknown) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const runAction = (
  name: string,
  input: Record<string, unknown>,
  ctx = memberCtx(),
) =>
  actions[name]?.handler({
    bindArgsParsedInputs: [WORKSPACE_ID],
    parsedInput: input,
    ctx,
  })

const withoutCaller = (args: Record<string, unknown>) => {
  const { scope: _scope, actor: _actor, ...rest } = args
  return rest
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isWorkspaceScheduledForDeletion.mockReturnValue(false)
  mocks.getAccessState.mockResolvedValue({ blocked: false })
  mocks.isAtLimit.mockResolvedValue(false)
  mocks.assertApiNotRateLimited.mockResolvedValue(undefined)
  mocks.findWorkspaceByTokenHash.mockResolvedValue({
    workspace: { id: WORKSPACE_ID, ownerId: "owner-1" },
    apiToken: { id: "token-1", permission: "full", scopes: ["pipelines"] },
  })
})

type Case = {
  name: string
  action: string
  procedure: string
  service: keyof typeof mocks
  method: string
  input: Record<string, unknown>
}

// Operations whose public output is void, so the handler needs no extra reads.
const sameServiceCases: Case[] = [
  {
    name: "update pipeline",
    action: "updatePipelineAction",
    procedure: "update",
    service: "pipelineService",
    method: "update",
    input: { id: "1", name: "Sales" },
  },
  {
    name: "delete pipeline",
    action: "deletePipelineAction",
    procedure: "delete",
    service: "pipelineService",
    method: "delete",
    input: { id: "1" },
  },
  {
    name: "update stage",
    action: "updateStageAction",
    procedure: "updateStage",
    service: "pipelineStructureService",
    method: "updateStage",
    input: { id: "1", stageId: "2", name: "Qualified" },
  },
  {
    name: "update field",
    action: "updateFieldAction",
    procedure: "updateField",
    service: "pipelineStructureService",
    method: "updateField",
    input: { id: "1", fieldId: "4", name: "Source" },
  },
  {
    name: "delete field",
    action: "deleteFieldAction",
    procedure: "deleteField",
    service: "pipelineStructureService",
    method: "deleteField",
    input: { id: "1", fieldId: "4" },
  },
  {
    name: "set member",
    action: "setMemberAction",
    procedure: "setMember",
    service: "pipelineMemberService",
    method: "setMember",
    input: {
      id: "1",
      workspaceMemberId: "5",
      canView: true,
      canEdit: false,
      canDelete: false,
      canManageSettings: false,
    },
  },
  {
    name: "remove member",
    action: "removeMemberAction",
    procedure: "removeMember",
    service: "pipelineMemberService",
    method: "removeMember",
    input: { id: "1", workspaceMemberId: "5" },
  },
  {
    name: "delete item",
    action: "deleteItemAction",
    procedure: "deleteItem",
    service: "pipelineItemService",
    method: "delete",
    input: { id: "1", itemId: "2" },
  },
  {
    name: "add comment",
    action: "addCommentAction",
    procedure: "addComment",
    service: "pipelineItemContentService",
    method: "addComment",
    input: { id: "1", itemId: "2", text: "hello", idempotencyKey: "k-1" },
  },
  {
    name: "delete comment",
    action: "deleteCommentAction",
    procedure: "deleteComment",
    service: "pipelineItemContentService",
    method: "deleteComment",
    input: { id: "1", itemId: "2", commentId: "6" },
  },
  {
    name: "remove attachment",
    action: "removeAttachmentAction",
    procedure: "removeAttachment",
    service: "pipelineItemContentService",
    method: "removeAttachment",
    input: { id: "1", itemId: "2", mediaLibraryFileId: "30" },
  },
  {
    name: "transfer item",
    action: "transferItemAction",
    procedure: "transferItem",
    service: "pipelineItemService",
    method: "transfer",
    input: {
      id: "1",
      itemId: "2",
      destinationPipelineId: "9",
      destinationStageId: "10",
    },
  },
]

describe("pipelines: public handler and server action share one service method", () => {
  test.each(sameServiceCases)("$name", async ({
    action,
    procedure,
    service,
    method,
    input,
  }) => {
    const fn = mocks[service][method as never] as ReturnType<typeof vi.fn>

    await runAction(action, input)
    const fromAction = fn.mock.calls

    fn.mockClear()
    await invokePublic(router[procedure], input).catch(() => undefined)
    const fromPublic = fn.mock.calls

    expect(fromAction).toHaveLength(1)
    expect(fromPublic).toHaveLength(1)
    expect(withoutCaller(fromPublic[0]?.[0])).toEqual(
      withoutCaller(fromAction[0]?.[0]),
    )
  })

  test("only the caller differs: a member for the action, the token for the public API", async () => {
    await runAction("deleteItemAction", { id: "1", itemId: "2" })
    await invokePublic(router.deleteItem, { id: "1", itemId: "2" })

    const [fromAction, fromPublic] =
      mocks.pipelineItemService.delete.mock.calls.map(
        (callArgs) => callArgs[0] as Record<string, unknown>,
      ) as [Record<string, unknown>, Record<string, unknown>]
    expect(fromAction.scope).toEqual({
      kind: "member",
      workspaceMemberId: "member-4",
      isWorkspaceAdmin: false,
      canViewContactEmailAndPhone: false,
    })
    expect(fromAction.actor).toEqual({
      kind: "user",
      userId: "user-7",
      sourceId: null,
    })
    expect(fromPublic.scope).toEqual({ kind: "workspaceToken" })
    expect(fromPublic.actor).toEqual({
      kind: "workspaceToken",
      userId: null,
      sourceId: "token-1",
    })
  })

  test("both stage-delete paths use the bulk service", async () => {
    await runAction("deleteStageAction", { id: "1", stageId: "2" })
    mocks.pipelineStageBulkService.deleteStage.mockResolvedValue({
      deleted: true,
      queued: false,
    })
    await invokePublic(router.deleteStage, { id: "1", stageId: "2" }).catch(
      () => undefined,
    )

    const calls = mocks.pipelineStageBulkService.deleteStage.mock.calls
    expect(calls).toHaveLength(2)
    expect(withoutCaller(calls[1]?.[0])).toEqual(withoutCaller(calls[0]?.[0]))
  })
})

describe("pipelines server actions", () => {
  const allowExpired = [
    "deletePipelineAction",
    "deleteStageAction",
    "deleteFieldAction",
    "removeMemberAction",
    "deleteItemAction",
    "deleteCommentAction",
    "removeAttachmentAction",
  ]

  test("the six delete/detach actions plus deleteStage use workspaceActionClientAllowExpired", () => {
    for (const name of allowExpired) {
      expect(actions[name]?.client, name).toBe("allowExpired")
    }
  })

  test("deleteStageMovingItemsAction writes, so it needs an active workspace", () => {
    expect(actions.deleteStageMovingItemsAction?.client).toBe("normal")
  })

  test("every other action uses workspaceActionClient", () => {
    const others = Object.entries(actions).filter(
      ([name]) => !allowExpired.includes(name),
    )

    expect(others.length).toBeGreaterThan(0)
    for (const [name, action] of others) {
      expect(action.client, name).toBe("normal")
    }
  })

  test("createItemAction passes the member scope and user actor from the session", async () => {
    mocks.pipelineItemService.create.mockResolvedValue({ id: "88" })

    const result = await runAction(
      "createItemAction",
      {
        id: "1",
        contactId: "2",
        title: "Deal",
        value: 5,
        idempotencyKey: "k",
      },
      memberCtx({
        workspaceMember: {
          id: "member-9",
          permissions: { superAdmin: true },
          role: "agent",
        },
      }),
    )

    expect(result).toEqual({ id: "88" })
    expect(mocks.pipelineItemService.create).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      pipelineId: "1",
      contactId: "2",
      fields: { title: "Deal", value: 5 },
      mediaLibraryFileIds: undefined,
      idempotencyKey: "k",
      scope: {
        kind: "member",
        workspaceMemberId: "member-9",
        isWorkspaceAdmin: true,
        canViewContactEmailAndPhone: true,
      },
      actor: { kind: "user", userId: "user-7", sourceId: null },
    })
  })

  test("a support session is passed to the service as the support scope", async () => {
    await runAction(
      "moveItemAction",
      { id: "1", itemId: "2", stageId: "3" },
      memberCtx({ isSupportSession: true }),
    )

    expect(mocks.pipelineItemService.move).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "support" } }),
    )
  })

  test("an unknown member role is never treated as admin", async () => {
    await runAction(
      "deleteItemAction",
      { id: "1", itemId: "2" },
      memberCtx({
        workspaceMember: { id: "m", permissions: {}, role: "wizard" },
      }),
    )

    expect(mocks.pipelineItemService.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          kind: "member",
          workspaceMemberId: "m",
          isWorkspaceAdmin: false,
          canViewContactEmailAndPhone: false,
        },
      }),
    )
  })

  test("deleteStageMovingItemsAction forwards moveItemsToStageId", async () => {
    await runAction("deleteStageMovingItemsAction", {
      id: "1",
      stageId: "2",
      moveItemsToStageId: "3",
    })

    expect(mocks.pipelineStageBulkService.deleteStage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        pipelineId: "1",
        stageId: "2",
        moveItemsToStageId: "3",
      }),
    )
  })

  test("createPipelineAction returns only the new id and records the user as actor", async () => {
    mocks.pipelineService.create.mockResolvedValue({ id: "55", name: "x" })

    const result = await runAction("createPipelineAction", { name: "Sales" })

    expect(result).toEqual({ id: "55" })
    expect(mocks.pipelineService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actor: { kind: "user", userId: "user-7", sourceId: null },
      }),
    )
  })
})
