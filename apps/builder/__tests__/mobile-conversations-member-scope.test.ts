// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }
type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }
  const api = { route: vi.fn((config: RouteConfig) => makeProcedure(config)) }
  return {
    workspaceTokenAuthAPIForScope: vi.fn(() => api),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const conversationService = {
  findByOrFail: vi.fn(),
  resolveContactInboxForConversation: vi.fn(),
  updateReadStatus: vi.fn(),
  assignOne: vi.fn(),
  archiveByIds: vi.fn(),
  unarchiveByIds: vi.fn(),
  markUnread: vi.fn(),
  setFollowed: vi.fn(),
  setBotEnabledByIds: vi.fn(),
}
const messageService = {
  findByIdWithUrls: vi.fn(),
  createOutgoing: vi.fn(),
}
const flowService = { assertEnabledInInbox: vi.fn() }
const userService = { findByIdOrFail: vi.fn() }
const inboxTeamService = { listTeamIdsByUserId: vi.fn() }

const conversationMemberScope = {
  resolve: async ({
    permissions,
    userId,
  }: {
    permissions: Record<string, boolean>
    userId: string
  }) => {
    if (
      !(
        permissions.superAdmin ||
        permissions.contacts ||
        permissions.onlyAssignedContacts
      )
    ) {
      return { chatScope: "none" as const, teamIds: [], userId }
    }
    if (permissions.superAdmin || !permissions.onlyAssignedContacts) {
      return { chatScope: "all" as const, teamIds: [], userId }
    }
    return {
      chatScope: "assigned" as const,
      teamIds: await inboxTeamService.listTeamIdsByUserId(),
      userId,
    }
  },
  allows: (
    scope:
      | {
          chatScope: "all" | "assigned" | "none"
          teamIds: string[]
          userId: string
        }
      | undefined,
    conversation: {
      assignedInboxTeamId: string | null
      assignedUserId: string | null
    },
  ) =>
    !scope ||
    scope.chatScope === "all" ||
    (scope.chatScope === "assigned" &&
      (conversation.assignedUserId === scope.userId ||
        (conversation.assignedInboxTeamId !== null &&
          scope.teamIds.includes(conversation.assignedInboxTeamId)))),
  where: (
    scope:
      | {
          chatScope: "all" | "assigned" | "none"
          teamIds: string[]
          userId: string
        }
      | undefined,
  ) => {
    if (!scope || scope.chatScope === "all") {
      return
    }
    if (scope.chatScope === "none") {
      throw new Error("Conversation not found")
    }
    return {
      OR: [
        { assignedUserId: scope.userId },
        ...(scope.teamIds.length
          ? [{ assignedInboxTeamId: { in: scope.teamIds } }]
          : []),
      ],
    }
  },
}

vi.mock("@chatbotx.io/business", () => ({
  conversationMemberScope,
  conversationService,
  messageService,
  flowService,
  userService,
  inboxTeamService,
  resolveTemplateParams: vi.fn(),
  hasContactsAccess: (permissions: Record<string, boolean>) =>
    permissions.superAdmin === true ||
    permissions.contacts === true ||
    permissions.onlyAssignedContacts === true,
}))

vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  requestConversationThreadControl: vi.fn(),
  syncConversationThreadOwner: vi.fn(),
}))

const findConversation = vi.fn()
const listConversations = vi.fn()
vi.mock(
  "../src/features/conversations/queries/list-conversations.query",
  () => ({ findConversation, listConversations }),
)

const listMessages = vi.fn()
vi.mock("@/features/messages/queries", () => ({ listMessages }))
vi.mock(
  "@/features/integration-whatsapp/calling/lib/request-call-permission",
  () => ({
    ENGLISH_CALL_PERMISSION_MESSAGES: {},
    requestWhatsappCallPermission: vi.fn(),
  }),
)
vi.mock("@/features/messages/lib/send-whatsapp-template", () => ({
  sendWhatsappTemplateToConversation: vi.fn(),
}))
const editMessage = vi.fn()
const deleteMessage = vi.fn()
const changeMessageAttributes = vi.fn()
vi.mock("@/features/messages/actions/edit-message.action", () => ({
  editMessage,
}))
vi.mock("@/features/messages/actions/delete-message.action", () => ({
  deleteMessage,
}))
vi.mock("@/features/messages/actions/change-message-attributes.action", () => ({
  changeMessageAttributes,
}))
vi.mock("@/features/messages/lib/get-whatsapp-flow-response", () => ({
  getWhatsappFlowResponseView: vi.fn(),
}))
vi.mock("@/lib/workspace-quota", () => ({ assertWorkspaceNotBlocked: vi.fn() }))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
  getCurrentUserId: vi.fn(),
}))

await import("@/features/conversations/api/public")
await import("@/features/messages/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const workspace = { id: "ws-1", ownerId: "owner-1" }
const ME = "user-7"

const memberContext = (permissions: Record<string, boolean>) => ({
  workspace,
  member: { userId: ME, workspaceId: "ws-1", permissions },
})

const ASSIGNED_ONLY = { contacts: true, onlyAssignedContacts: true }
const ALL_CHATS = { contacts: true, emailAndPhone: true }
const SUPER_ADMIN = { superAdmin: true }
const NO_INBOX = { analytics: true }

const conversationRow = (
  overrides: {
    assignedUserId?: string | null
    assignedInboxTeamId?: string | null
  } = {},
) => ({
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  assignedUserId: null,
  assignedInboxTeamId: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  inboxTeamService.listTeamIdsByUserId.mockResolvedValue(["team-1"])
  conversationService.findByOrFail.mockResolvedValue(conversationRow())
})

describe("conversations.list for a mobile member", () => {
  const list = findProcedure("GET", "/v1/conversations")
  const emptyList = { data: [], nextCursor: null, prevCursor: null }

  test("an assigned-only agent is limited to their own and their teams' conversations", async () => {
    listConversations.mockResolvedValue(emptyList)

    await list.handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { perPage: 20 },
    })

    expect(listConversations).toHaveBeenCalledWith(
      { perPage: 20, workspaceId: "ws-1" },
      {
        includeEmailAndPhone: false,
        scopeWhere: {
          OR: [
            { assignedUserId: ME },
            { assignedInboxTeamId: { in: ["team-1"] } },
          ],
        },
      },
    )
  })

  test("an assigned-only agent in no team is limited to their own conversations", async () => {
    listConversations.mockResolvedValue(emptyList)
    inboxTeamService.listTeamIdsByUserId.mockResolvedValue([])

    await list.handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: {},
    })

    expect(listConversations.mock.calls[0][1].scopeWhere).toEqual({
      OR: [{ assignedUserId: ME }],
    })
  })

  test.each([
    ["a member with full chat access", ALL_CHATS],
    ["a super admin", SUPER_ADMIN],
  ])("%s is not restricted", async (_name, permissions) => {
    listConversations.mockResolvedValue(emptyList)

    await list.handler?.({ context: memberContext(permissions), input: {} })

    expect(listConversations.mock.calls[0][1].scopeWhere).toBeUndefined()
    expect(inboxTeamService.listTeamIdsByUserId).not.toHaveBeenCalled()
  })

  test("a member with no inbox access is not found before listing", async () => {
    await expect(
      list.handler?.({ context: memberContext(NO_INBOX), input: {} }),
    ).rejects.toThrow("Conversation not found")

    expect(listConversations).not.toHaveBeenCalled()
  })

  test("contact email/phone are masked unless the member has that permission", async () => {
    const withContact = {
      ...emptyList,
      data: [
        {
          id: "conv-1",
          contact: { id: "c1", email: "a@b.c", phoneNumber: "+84" },
        },
      ],
    }
    listConversations.mockResolvedValue(withContact)

    const masked = await list.handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: {},
    })
    const visible = await list.handler?.({
      context: memberContext(ALL_CHATS),
      input: {},
    })

    expect(masked.data[0].contact).toMatchObject({
      email: null,
      phoneNumber: null,
    })
    expect(visible.data[0].contact).toMatchObject({
      email: "a@b.c",
      phoneNumber: "+84",
    })
  })

  test("a workspace token stays workspace-level: no scope, full PII", async () => {
    listConversations.mockResolvedValue(emptyList)

    await list.handler?.({ context: { workspace }, input: {} })

    expect(listConversations).toHaveBeenCalledWith(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, scopeWhere: undefined },
    )
    expect(inboxTeamService.listTeamIdsByUserId).not.toHaveBeenCalled()
  })
})

describe("conversations.get for a mobile member", () => {
  const get = findProcedure("GET", "/v1/conversations/{id}")
  const found = (assignment: Parameters<typeof conversationRow>[0]) => ({
    data: {
      ...conversationRow(assignment),
      contact: { id: "c1", email: "a@b.c", phoneNumber: "+84" },
    },
  })

  test("another agent's conversation is not found for an assigned-only agent", async () => {
    findConversation.mockResolvedValue(
      found({ assignedUserId: "someone-else" }),
    )

    await expect(
      get.handler?.({
        context: memberContext(ASSIGNED_ONLY),
        input: { id: "conv-1" },
      }),
    ).rejects.toThrow("Conversation not found")
  })

  test("an unassigned conversation is not visible to an assigned-only agent", async () => {
    findConversation.mockResolvedValue(found({}))

    await expect(
      get.handler?.({
        context: memberContext(ASSIGNED_ONLY),
        input: { id: "conv-1" },
      }),
    ).rejects.toThrow("Conversation not found")
  })

  test.each([
    ["their own", { assignedUserId: ME }],
    ["their team's", { assignedInboxTeamId: "team-1" }],
  ])("%s conversation is returned, with PII masked", async (_name, assignment) => {
    conversationService.findByOrFail.mockResolvedValue(
      conversationRow(assignment),
    )
    findConversation.mockResolvedValue(found(assignment))

    const result = await get.handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { id: "conv-1" },
    })

    expect(result.data.id).toBe("conv-1")
    expect(result.data.contact).toMatchObject({
      email: null,
      phoneNumber: null,
    })
  })

  test("an agent with full chat access sees any conversation; a token is unaffected", async () => {
    findConversation.mockResolvedValue(
      found({ assignedUserId: "someone-else" }),
    )

    await expect(
      get.handler?.({
        context: memberContext(ALL_CHATS),
        input: { id: "conv-1" },
      }),
    ).resolves.toBeDefined()
    await expect(
      get.handler?.({ context: { workspace }, input: { id: "conv-1" } }),
    ).resolves.toBeDefined()
  })
})

describe("conversation actions for a mobile member", () => {
  const FOREIGN = conversationRow({ assignedUserId: "someone-else" })

  test.each([
    ["assign", "/v1/conversations/{id}/assign", { assignedId: "u_9" }],
    ["archive", "/v1/conversations/{id}/archive", {}],
    ["unarchive", "/v1/conversations/{id}/unarchive", {}],
    ["read", "/v1/conversations/{id}/read", {}],
    ["unread", "/v1/conversations/{id}/unread", {}],
    ["follow", "/v1/conversations/{id}/follow", {}],
    ["unfollow", "/v1/conversations/{id}/unfollow", {}],
    ["enable-bot", "/v1/conversations/{id}/enable-bot", {}],
    ["disable-bot", "/v1/conversations/{id}/disable-bot", {}],
  ])("%s on a conversation outside the agent's scope is not found and does nothing", async (_name, path, extra) => {
    conversationService.findByOrFail.mockResolvedValue(FOREIGN)

    await expect(
      findProcedure("POST", path).handler?.({
        context: memberContext(ASSIGNED_ONLY),
        input: { id: "conv-1", ...extra },
      }),
    ).rejects.toThrow("Conversation not found")

    for (const method of [
      conversationService.assignOne,
      conversationService.archiveByIds,
      conversationService.unarchiveByIds,
      conversationService.updateReadStatus,
      conversationService.markUnread,
      conversationService.setFollowed,
      conversationService.setBotEnabledByIds,
    ]) {
      expect(method).not.toHaveBeenCalled()
    }
  })

  test("an in-scope action runs and is attributed to the member", async () => {
    conversationService.findByOrFail.mockResolvedValue(
      conversationRow({ assignedUserId: ME }),
    )

    await findProcedure("POST", "/v1/conversations/{id}/follow").handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { id: "conv-1" },
    })
    await findProcedure("POST", "/v1/conversations/{id}/archive").handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { id: "conv-1" },
    })
    await findProcedure("POST", "/v1/conversations/{id}/assign").handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { id: "conv-1", assignedId: "u_9" },
    })

    expect(conversationService.setFollowed).toHaveBeenCalledWith(
      expect.objectContaining({ followed: true, userId: ME }),
    )
    expect(conversationService.archiveByIds).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["conv-1"], userId: ME }),
    )
    expect(conversationService.assignOne).toHaveBeenCalledWith(
      expect.objectContaining({ assignedBy: ME }),
    )
  })

  test("a workspace token acts workspace-wide and unattributed, as before", async () => {
    conversationService.findByOrFail.mockResolvedValue(FOREIGN)

    await findProcedure("POST", "/v1/conversations/{id}/follow").handler?.({
      context: { workspace },
      input: { id: "conv-1" },
    })

    expect(conversationService.setFollowed).toHaveBeenCalledWith(
      expect.objectContaining({ followed: true, userId: undefined }),
    )
    // The shared assertion returns the resource once for both token and member callers.
    expect(conversationService.findByOrFail).toHaveBeenCalledTimes(1)
  })
})

describe("messages routes for a mobile member", () => {
  const FOREIGN = conversationRow({ assignedUserId: "someone-else" })
  const base = "/v1/conversations/{conversationId}/messages"
  const withId = `${base}/{messageId}`
  const input = {
    conversationId: "conv-1",
    messageId: "msg-1",
    createdAt: new Date("2026-01-01"),
    text: "hi",
  }

  test.each([
    ["list", "GET", base],
    ["get", "GET", withId],
    ["create", "POST", base],
    ["update", "PUT", withId],
    ["delete", "DELETE", withId],
    ["attributes", "POST", `${withId}/attributes`],
  ])("%s on another agent's conversation is not found and touches nothing", async (_name, method, path) => {
    conversationService.findByOrFail.mockResolvedValue(FOREIGN)

    await expect(
      findProcedure(method, path).handler?.({
        context: memberContext(ASSIGNED_ONLY),
        input,
      }),
    ).rejects.toThrow("Conversation not found")

    expect(listMessages).not.toHaveBeenCalled()
    expect(messageService.findByIdWithUrls).not.toHaveBeenCalled()
    expect(messageService.createOutgoing).not.toHaveBeenCalled()
    expect(editMessage).not.toHaveBeenCalled()
    expect(deleteMessage).not.toHaveBeenCalled()
    expect(changeMessageAttributes).not.toHaveBeenCalled()
  })

  test("a message sent by a member is attributed to them", async () => {
    conversationService.findByOrFail.mockResolvedValue(
      conversationRow({ assignedUserId: ME }),
    )
    conversationService.resolveContactInboxForConversation.mockResolvedValue({
      id: "ci-1",
    })
    userService.findByIdOrFail.mockResolvedValue({ id: ME, name: "Agent" })
    messageService.createOutgoing.mockResolvedValue({ id: "m1" })

    await findProcedure("POST", base).handler?.({
      context: {
        ...memberContext(ASSIGNED_ONLY),
        user: { id: ME, name: "Agent" },
      },
      input,
    })

    expect(userService.findByIdOrFail).not.toHaveBeenCalled()
    expect(messageService.createOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: ME, name: "Agent" } }),
    )
  })

  test("a message sent with a workspace token has no user, as before", async () => {
    conversationService.resolveContactInboxForConversation.mockResolvedValue({
      id: "ci-1",
    })
    messageService.createOutgoing.mockResolvedValue({ id: "m1" })

    await findProcedure("POST", base).handler?.({
      context: { workspace },
      input,
    })

    expect(userService.findByIdOrFail).not.toHaveBeenCalled()
    expect(messageService.createOutgoing.mock.calls[0][0]).not.toHaveProperty(
      "user",
    )
  })

  test("an in-scope list reaches the message query", async () => {
    conversationService.findByOrFail.mockResolvedValue(
      conversationRow({ assignedInboxTeamId: "team-1" }),
    )
    listMessages.mockResolvedValue({ data: [] })

    await findProcedure("GET", base).handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { conversationId: "conv-1", perPage: 20 },
    })

    expect(listMessages).toHaveBeenCalled()
  })
})
