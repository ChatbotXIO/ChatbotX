import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ArchiveInput = { workspaceId: string; ids: string[] }
type HandlerContext = {
  input: ArchiveInput
  context: { user: { id: string }; workspace: { ownerId: string } }
}
type ProcedureHandler = (args: HandlerContext) => Promise<unknown>

/**
 * `conversationsAuthenticatedAPI` builds every endpoint by chaining off the
 * same `authorizedAPI` procedure object literal-style, so each `.route()`
 * call starts a fresh chain. This fake records the handler under the route's
 * `path`, letting the test look up a specific endpoint by its known path
 * instead of tracking property-definition order.
 */
const { authorizedAPI, handlersByPath } = vi.hoisted(() => {
  const handlersByPath: Record<string, ProcedureHandler> = {}

  function makeProcedure(): {
    route: (config: RouteConfig) => unknown
    input: (schema: unknown) => unknown
    use: (middleware: unknown, mapper?: unknown) => unknown
    output: (schema: unknown) => unknown
    handler: (handler: ProcedureHandler) => unknown
  } {
    let currentPath: string | undefined
    const procedure = {
      route: (config: RouteConfig) => {
        currentPath = config.path
        return procedure
      },
      input: (_schema: unknown) => procedure,
      use: (_middleware: unknown, _mapper?: unknown) => procedure,
      output: (_schema: unknown) => procedure,
      handler: (handler: ProcedureHandler) => {
        if (currentPath) {
          handlersByPath[currentPath] = handler
        }
        return { handler }
      },
    }
    return procedure
  }

  return {
    authorizedAPI: {
      route: (config: RouteConfig) => makeProcedure().route(config),
    },
    handlersByPath,
  }
})

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))

const { archiveConversations, getAtLimitMap, getForUser, isCloud } = vi.hoisted(
  () => ({
    archiveConversations: vi.fn(),
    getAtLimitMap: vi.fn(),
    getForUser: vi.fn(),
    isCloud: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { updateReadStatus: vi.fn() },
  quotaEnforcementService: { getAtLimitMap },
  userQuotaService: { getForUser },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.name = "ChatbotXException"
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@/env", () => ({ isCloud }))

vi.mock("@/features/conversations/actions/archive-conversation.action", () => ({
  archiveConversations,
}))
vi.mock("@/features/conversations/actions/assign-conversation.action", () => ({
  assignConversation: vi.fn(),
}))
vi.mock("@/features/conversations/actions/disable-bot.action", () => ({
  disableBotForConversations: vi.fn(),
}))
vi.mock("@/features/conversations/actions/enable-bot.action", () => ({
  enableBotForConversations: vi.fn(),
}))
vi.mock("@/features/conversations/actions/follow-conversation.action", () => ({
  followConversation: vi.fn(),
}))
vi.mock(
  "@/features/conversations/actions/unarchive-conversation.action",
  () => ({
    unarchiveConversations: vi.fn(),
  }),
)
vi.mock(
  "@/features/conversations/actions/unfollow-conversation.action",
  () => ({
    unfollowConversation: vi.fn(),
  }),
)
vi.mock("@/features/conversations/actions/unread-conversation.action", () => ({
  unreadConversation: vi.fn(),
}))
vi.mock("@/features/conversations/queries/get-post-details.query", () => ({
  getPostDetailsQuery: vi.fn(),
}))
vi.mock("@/features/conversations/queries/list-conversations.query", () => ({
  findConversation: vi.fn(),
  listConversations: vi.fn(),
}))

await import("@/features/conversations/api/private")

const ARCHIVE_PATH = "/workspaces/{workspaceId}/conversations/archive"

beforeEach(() => {
  vi.clearAllMocks()
  isCloud.mockReturnValue(true)
})

describe("conversationsAuthenticatedAPI — trial-expired/MAC block gate", () => {
  test("archiveConversationsAuthenticatedAPI rejects a blocked workspace owner with a 402", async () => {
    getForUser.mockResolvedValue({ planStatus: "expired", periodEnd: null })
    getAtLimitMap.mockResolvedValue({ mac: false })

    const handler = handlersByPath[ARCHIVE_PATH]
    expect(handler).toBeDefined()

    await expect(
      handler?.({
        input: { workspaceId: "workspace-1", ids: ["conversation-1"] },
        context: {
          user: { id: "user-1" },
          workspace: { ownerId: "blocked-owner" },
        },
      }),
    ).rejects.toMatchObject({
      code: "workspaceBlocked",
      httpStatusCode: 402,
    })

    expect(archiveConversations).not.toHaveBeenCalled()
  })

  test("archiveConversationsAuthenticatedAPI proceeds when the owner is not blocked", async () => {
    getForUser.mockResolvedValue({ planStatus: "active", periodEnd: null })
    getAtLimitMap.mockResolvedValue({ mac: false })
    archiveConversations.mockResolvedValue(undefined)

    const handler = handlersByPath[ARCHIVE_PATH]

    await expect(
      handler?.({
        input: { workspaceId: "workspace-1", ids: ["conversation-1"] },
        context: {
          user: { id: "user-1" },
          workspace: { ownerId: "active-owner" },
        },
      }),
    ).resolves.toEqual({ success: true })

    expect(archiveConversations).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["conversation-1"],
      userId: "user-1",
    })
  })
})
