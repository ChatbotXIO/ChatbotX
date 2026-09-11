import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

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

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const conversationService = {
  findByOrFail: vi.fn(),
  updateReadStatus: vi.fn(),
  assignOne: vi.fn(),
  archiveByIds: vi.fn(),
  unarchiveByIds: vi.fn(),
  markUnread: vi.fn(),
  setFollowed: vi.fn(),
  setBotEnabledByIds: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ conversationService }))

const findConversation = vi.fn()
const listConversations = vi.fn()
vi.mock(
  "../src/features/conversations/queries/list-conversations.query",
  () => ({
    findConversation,
    listConversations,
  }),
)

vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: vi.fn(),
}))

await import("@/features/conversations/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "ws-1", ownerId: "owner-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the conversations public router under the inbox scope", () => {
  expect(scopeArgAtImport).toBe("inbox")
})

describe("GET /v1/conversations/{id}", () => {
  const procedure = findProcedure("GET", "/v1/conversations/{id}")

  test("delegates to findConversation", async () => {
    findConversation.mockResolvedValueOnce({ data: { id: "1" } })

    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(findConversation).toHaveBeenCalledWith({
      id: "1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ data: { id: "1" } })
  })
})

describe("POST /v1/conversations/{id}/assign", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/assign")

  test("resolves the conversation and delegates to conversationService.assignOne without an actor", async () => {
    conversationService.findByOrFail.mockResolvedValueOnce({
      id: "1",
      contactId: "contact-1",
    })

    const result = await procedure.handler?.({
      context,
      input: { id: "1", assignedId: "u_user-1" },
    })

    expect(conversationService.findByOrFail).toHaveBeenCalledWith({
      where: { id: "1", workspaceId: "ws-1" },
    })
    expect(conversationService.assignOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation: { id: "1", contactId: "contact-1" },
      assignedId: "u_user-1",
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "assignConversation",
      },
    })
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/archive", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/archive")

  test("delegates to conversationService.archiveByIds for a single id, without an actor", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.archiveByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1"],
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "archiveConversationAction",
        triggerType: "conversation_archived",
      },
    })
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/unarchive", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/unarchive")

  test("delegates to conversationService.unarchiveByIds for a single id", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.unarchiveByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1"],
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "unarchiveConversationAction",
        triggerType: "conversation_unarchived",
      },
    })
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/read", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/read")

  test("delegates to conversationService.updateReadStatus", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.updateReadStatus).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", id: "1" }),
    )
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/unread", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/unread")

  test("delegates to conversationService.markUnread", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.markUnread).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "1",
    })
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/follow", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/follow")

  test("delegates to conversationService.setFollowed without an actor", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.setFollowed).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "1",
      followed: true,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "followConversationAction",
        triggerType: "conversation_followed",
      },
    })
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/unfollow", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/unfollow")

  test("delegates to conversationService.setFollowed", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.setFollowed).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "1",
      followed: false,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "unfollowConversationAction",
        triggerType: "conversation_unfollowed",
      },
    })
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/enable-bot", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/enable-bot")

  test("delegates to conversationService.setBotEnabledByIds without an actor", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.setBotEnabledByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1"],
      botEnabled: true,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "enableBotAction",
        triggerType: "conversation_transferred_to_bot",
      },
    })
    expect(result).toEqual({ success: true })
  })
})

describe("POST /v1/conversations/{id}/disable-bot", () => {
  const procedure = findProcedure("POST", "/v1/conversations/{id}/disable-bot")

  test("delegates to conversationService.setBotEnabledByIds without an actor", async () => {
    const result = await procedure.handler?.({
      context,
      input: { id: "1" },
    })

    expect(conversationService.setBotEnabledByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1"],
      botEnabled: false,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "disableBotAction",
        triggerType: "conversation_transferred_to_human",
      },
    })
    expect(result).toEqual({ success: true })
  })
})
