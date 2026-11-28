import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: {
  input: {
    workspaceId: string
    id: string
    cursor?: string
    perPage?: number | null
  }
  context?: unknown
}) => Promise<unknown>

const { authorizedAPI, handlersByPath } = vi.hoisted(() => {
  const handlersByPath: Record<string, Handler> = {}
  const makeProcedure = () => {
    let currentPath: string | undefined
    const procedure = {
      route: (config: { path: string }) => {
        currentPath = config.path
        return procedure
      },
      input: () => procedure,
      use: () => procedure,
      output: () => procedure,
      handler: (handler: Handler) => {
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
      route: (config: { path: string }) => makeProcedure().route(config),
    },
    handlersByPath,
  }
})

const mocks = vi.hoisted(() => ({
  assertConversationAccessForCaller: vi.fn(),
  listConversationParticipants: vi.fn(),
}))

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  conversationService: {},
  tagService: {},
}))
vi.mock("@/lib/public-api/member-scope", () => ({
  assertConversationAccessForCaller: mocks.assertConversationAccessForCaller,
}))
vi.mock("@/features/contacts/permissions", () => ({
  canViewContactEmailAndPhone: vi.fn(),
}))
vi.mock("@/lib/workspace-quota", () => ({ assertWorkspaceNotBlocked: vi.fn() }))
vi.mock(
  "../src/features/conversations/queries/list-conversations.query",
  () => ({
    findConversation: vi.fn(),
    listConversations: vi.fn(),
  }),
)
vi.mock("../src/features/conversations/queries/get-post-details.query", () => ({
  getPostDetailsQuery: vi.fn(),
}))
vi.mock(
  "../src/features/conversations/queries/list-participants.query",
  () => ({
    listConversationParticipants: mocks.listConversationParticipants,
  }),
)

await import("@/features/conversations/api/private")

const PATH = "/workspaces/{workspaceId}/conversations/{id}/participants"

beforeEach(() => {
  vi.clearAllMocks()
})

const member = {
  userId: "u-1",
  permissions: { onlyAssignedConversations: true },
}
const context = { workspaceMember: member, user: { id: "u-1" } }

describe("listParticipantsAuthenticatedAPI", () => {
  test("checks the conversation against the member's scope, then lists", async () => {
    const page = { data: [], nextCursor: null }
    mocks.assertConversationAccessForCaller.mockResolvedValue({ id: "9" })
    mocks.listConversationParticipants.mockResolvedValue(page)

    await expect(
      handlersByPath[PATH]?.({
        input: { workspaceId: "ws-1", id: "9", cursor: "c", perPage: 5 },
        context,
      }),
    ).resolves.toBe(page)

    expect(mocks.assertConversationAccessForCaller).toHaveBeenCalledWith(
      { workspace: { id: "ws-1" }, member, user: { id: "u-1" } },
      "9",
    )
    expect(mocks.listConversationParticipants).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "9",
      cursor: "c",
      perPage: 5,
    })
  })

  test("another workspace's conversation is not found and nothing is listed", async () => {
    mocks.assertConversationAccessForCaller.mockRejectedValue(
      new Error("Conversation not found"),
    )

    await expect(
      handlersByPath[PATH]?.({
        input: { workspaceId: "ws-1", id: "other" },
        context,
      }),
    ).rejects.toThrow("Conversation not found")
    expect(mocks.listConversationParticipants).not.toHaveBeenCalled()
  })

  test("a member limited to assigned conversations cannot list the others", async () => {
    mocks.assertConversationAccessForCaller.mockRejectedValue(
      new Error("Conversation not found"),
    )

    await expect(
      handlersByPath[PATH]?.({
        input: { workspaceId: "ws-1", id: "not-assigned" },
        context,
      }),
    ).rejects.toThrow("Conversation not found")
    expect(mocks.listConversationParticipants).not.toHaveBeenCalled()
  })
})
