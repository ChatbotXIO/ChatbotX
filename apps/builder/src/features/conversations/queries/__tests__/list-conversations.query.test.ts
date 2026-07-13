// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findManyQuery: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: vi.fn(),
}))
vi.mock("@chatbotx.io/database/client", () => ({
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: vi.fn(() => ({})),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(),
}))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))
vi.mock("@/lib/pagination", () => ({
  decodeCursor: vi.fn(),
  encodeCursor: vi.fn(),
}))

const { buildConversationWhere } = await import("../build-conversation-where")
const { listConversations, listConversationsForAPI } = await import(
  "../list-conversations.query"
)
const { conversationService } = await import("@chatbotx.io/business")
const { createMessageRepository } = await import(
  "@chatbotx.io/database/repositories"
)
const { assertCurrentUserCanAccessChatbot } = await import("@/lib/auth/utils")

const findManyQueryMock = vi.mocked(conversationService.findManyQuery)
const createMessageRepositoryMock = vi.mocked(createMessageRepository)
const assertCurrentUserCanAccessChatbotMock = vi.mocked(
  assertCurrentUserCanAccessChatbot,
)

const baseInput = {
  perPage: 20,
  cursor: undefined,
  keyword: "",
  botCategory: "all" as const,
  assignedId: "all",
  tags: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  findManyQueryMock.mockResolvedValue([])
  createMessageRepositoryMock.mockResolvedValue({
    findLastByConversation: vi.fn(),
  } as never)
})

describe("listConversations workspace scope", () => {
  test("requires workspace membership for session-authenticated callers", async () => {
    await listConversations({
      ...baseInput,
      workspaceId: "1",
    })

    expect(assertCurrentUserCanAccessChatbotMock).toHaveBeenCalledWith("1")
  })

  test("uses the workspace already authorized by API middleware", async () => {
    const response = await listConversationsForAPI({
      ...baseInput,
      workspaceId: "1",
    })

    expect(response).toEqual({
      data: [],
      nextCursor: null,
      prevCursor: null,
    })
    expect(assertCurrentUserCanAccessChatbotMock).not.toHaveBeenCalled()
    expect(findManyQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "1" }),
      }),
    )
  })
})

describe("buildConversationWhere channel filter", () => {
  test("does not restrict by contactInboxes when channel is the omnichannel sentinel", () => {
    const where = buildConversationWhere(
      "1",
      { ...baseInput, channel: "omnichannel" },
      null,
    )

    expect(where.contactInboxes).toBeUndefined()
  })

  test("restricts by contactInboxes when a real channel is selected", () => {
    const where = buildConversationWhere(
      "1",
      { ...baseInput, channel: "messenger" },
      null,
    )

    expect(where.contactInboxes).toEqual({ channel: "messenger" })
  })
})
