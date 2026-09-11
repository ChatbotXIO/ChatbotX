// @vitest-environment node

// Pins the invariant fixed in this PR: public (workspace-token) list
// endpoints must never resolve a better-auth session. A Bearer-token request
// has no session, so any of these six query functions calling
// `assertCurrentUserCanAccessChatbot` (which resolves the session) would 400
// every public list call — see docs/developer/workspace-api-tokens.md.
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn(() => {
    throw new Error("assertCurrentUserCanAccessChatbot must not be called")
  }),
  findMany: vi.fn().mockResolvedValue([]),
  count: vi.fn().mockResolvedValue(0),
  listByWorkspace: vi.fn().mockResolvedValue([]),
  findManyQuery: vi.fn().mockResolvedValue([]),
  findLastByConversation: vi.fn().mockResolvedValue([]),
  findWithFullRelations: vi.fn().mockResolvedValue({
    id: "conv-1",
    contactId: "contact-1",
    contactInboxes: [],
    lastActivityAt: null,
  }),
  findByIdWithUrls: vi.fn().mockResolvedValue({ id: "msg-1" }),
  broadcastListWithRelations: vi.fn().mockResolvedValue([]),
  broadcastCount: vi.fn().mockResolvedValue(0),
  sequenceListWithCounts: vi.fn().mockResolvedValue([]),
  sequenceCount: vi.fn().mockResolvedValue(0),
  sequenceFindWithSteps: vi.fn().mockResolvedValue({
    id: "seq-1",
    sequenceSteps: [],
  }),
  listWorkspaceMembersPaginated: vi
    .fn()
    .mockResolvedValue({ data: [], pageCount: 0 }),
  listErrorLogsService: vi.fn().mockResolvedValue({ data: [], pageCount: 0 }),
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      errorLogModel: { findMany: mocks.findMany },
      workspaceMemberModel: { findMany: mocks.findMany },
    },
    $count: mocks.count,
  },
  eq: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  errorLogModel: { id: "errorLogModelId" },
  workspaceMemberModel: { id: "workspaceMemberModelId" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: { page?: number; perPage?: number }) => ({
    limit: input.perPage ?? 10,
    offset: ((input.page ?? 1) - 1) * (input.perPage ?? 10),
  }),
  likeContains: (value: string) => value,
  parseOrderByAsObject: () => undefined,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
  withBroadcastTargets: { targets: true },
}))

vi.mock("@chatbotx.io/utils/error-log", () => ({
  errorLogProviders: { safeParse: () => ({ success: false }) },
  errorLogProvidersMatchingLabel: () => [],
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxTeamService: { listByWorkspace: mocks.listByWorkspace },
  conversationService: {
    findManyQuery: mocks.findManyQuery,
    findWithFullRelations: mocks.findWithFullRelations,
  },
  messageService: { findByIdWithUrls: mocks.findByIdWithUrls },
  broadcastService: {
    list: async (input: { page?: number; perPage?: number }) => {
      const pagination = {
        limit: input.perPage ?? 10,
        offset: ((input.page ?? 1) - 1) * (input.perPage ?? 10),
      }
      const [data, total] = await Promise.all([
        mocks.broadcastListWithRelations(input),
        mocks.broadcastCount(input),
      ])
      return { data, pageCount: Math.ceil(total / pagination.limit) }
    },
  },
  workspaceMemberService: {
    listPaginated: mocks.listWorkspaceMembersPaginated,
  },
}))

vi.mock("@chatbotx.io/business/sequence", () => ({
  sequenceService: {
    findWithSteps: mocks.sequenceFindWithSteps,
    list: async (input: { page?: number; perPage?: number }) => {
      const pagination = {
        limit: input.perPage ?? 10,
        offset: ((input.page ?? 1) - 1) * (input.perPage ?? 10),
      }
      const [data, total] = await Promise.all([
        mocks.sequenceListWithCounts(input),
        mocks.sequenceCount(input),
      ])
      return { data, pageCount: Math.ceil(total / pagination.limit) }
    },
  },
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  listErrorLogs: mocks.listErrorLogsService,
}))

vi.mock("@chatbotx.io/business/ads-conversion/channel-fields", () => ({
  resolveAdReferral: () => null,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn().mockResolvedValue({
    findLastByConversation: mocks.findLastByConversation,
  }),
  broadcastRepository: {
    listWithRelations: mocks.broadcastListWithRelations,
    count: mocks.broadcastCount,
  },
  sequenceRepository: {
    listWithCounts: mocks.sequenceListWithCounts,
    count: mocks.sequenceCount,
    findWithSteps: mocks.sequenceFindWithSteps,
  },
}))

vi.mock(
  "../src/features/conversations/queries/build-conversation-where",
  () => ({
    buildConversationWhere: vi.fn().mockReturnValue({}),
  }),
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
  mocks.listByWorkspace.mockResolvedValue([])
  mocks.findManyQuery.mockResolvedValue([])
  mocks.findLastByConversation.mockResolvedValue([])
  mocks.findWithFullRelations.mockResolvedValue({
    id: "conv-1",
    contactId: "contact-1",
    contactInboxes: [],
    lastActivityAt: null,
  })
  mocks.findByIdWithUrls.mockResolvedValue({ id: "msg-1" })
  mocks.broadcastListWithRelations.mockResolvedValue([])
  mocks.broadcastCount.mockResolvedValue(0)
  mocks.sequenceListWithCounts.mockResolvedValue([])
  mocks.sequenceCount.mockResolvedValue(0)
  mocks.sequenceFindWithSteps.mockResolvedValue({
    id: "seq-1",
    sequenceSteps: [],
  })
  mocks.listWorkspaceMembersPaginated.mockResolvedValue({
    data: [],
    pageCount: 0,
  })
  mocks.listErrorLogsService.mockResolvedValue({ data: [], pageCount: 0 })
})

describe("public list queries never depend on a session", () => {
  test("listBroadcasts resolves without a session", async () => {
    const { listBroadcasts } = await import(
      "../src/features/broadcasts/queries"
    )
    await expect(
      listBroadcasts({
        workspaceId: "ws-1",
        page: 1,
        perPage: 10,
        name: null,
        sort: [{ id: "createdAt", desc: true }],
        status: null,
      }),
    ).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("listSequences resolves without a session", async () => {
    const { listSequences } = await import("../src/features/sequences/queries")
    await expect(
      listSequences({ workspaceId: "ws-1", page: 1, perPage: 10 }),
    ).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("sequenceService.findWithSteps resolves without a session", async () => {
    const { sequenceService } = await import("@chatbotx.io/business/sequence")
    await expect(
      sequenceService.findWithSteps({ workspaceId: "ws-1", id: "seq-1" }),
    ).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("listErrorLogs resolves without a session", async () => {
    const { listErrorLogs } = await import("@chatbotx.io/business/error-log")
    await expect(listErrorLogs({ workspaceId: "ws-1" })).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("listWorkspaceMembers resolves without a session", async () => {
    const { listWorkspaceMembers } = await import(
      "../src/features/workspace-members/queries"
    )
    await expect(
      listWorkspaceMembers({
        workspaceId: "ws-1",
        page: 1,
        perPage: 10,
        keyword: null,
      }),
    ).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("listInboxTeams resolves without a session", async () => {
    const { listInboxTeams } = await import(
      "../src/enterprise/features/inbox-teams/queries"
    )
    await expect(listInboxTeams({ workspaceId: "ws-1" })).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("listConversations resolves without a session", async () => {
    const { listConversations } = await import(
      "../src/features/conversations/queries/list-conversations.query"
    )
    await expect(
      listConversations(
        { workspaceId: "ws-1" },
        { includeEmailAndPhone: true },
      ),
    ).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("findConversation resolves without a session", async () => {
    const { findConversation } = await import(
      "../src/features/conversations/queries/list-conversations.query"
    )
    await expect(
      findConversation({ workspaceId: "ws-1", id: "conv-1" }),
    ).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })

  test("findMessage resolves without a session", async () => {
    const { findMessage } = await import("../src/features/messages/queries")
    await expect(
      findMessage({
        workspaceId: "ws-1",
        id: "msg-1",
        createdAt: new Date(),
      }),
    ).resolves.toBeDefined()
    expect(mocks.assertCurrentUserCanAccessChatbot).not.toHaveBeenCalled()
  })
})
