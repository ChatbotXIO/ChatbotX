// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockFindWorkspace = vi.fn()
const mockListConversationsForAPI = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { find: mockFindWorkspace },
}))

vi.mock("@/features/conversations/queries/list-conversations.query", () => ({
  listConversationsForAPI: mockListConversationsForAPI,
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}))

process.env.REALTIME_BROADCAST_SECRET =
  "test-broadcast-secret-with-at-least-32-characters"

const { call } = await import("@orpc/server")
const { conversationWorkspaceTokenAPIs } = await import(
  "@/features/conversations/api/workspace-token"
)

const procedure =
  conversationWorkspaceTokenAPIs.listConversationsWorkspaceTokenAPI
const emptyQuery = {
  status: undefined,
  tags: undefined,
  contactFilter: undefined,
}

describe("listConversationsWorkspaceTokenAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindWorkspace.mockResolvedValue({ id: "ws-1" })
    mockListConversationsForAPI.mockResolvedValue({
      data: [],
      nextCursor: null,
      prevCursor: null,
    })
  })

  test("uses the token-authorized workspace without a browser session", async () => {
    const result = await call(procedure, emptyQuery, {
      context: {
        headers: new Headers({ authorization: "Bearer developer-token" }),
      },
    })

    expect(mockFindWorkspace).toHaveBeenCalledWith({
      where: { token: "developer-token" },
    })
    expect(mockListConversationsForAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    })
    expect(result).toEqual({
      data: [],
      nextCursor: null,
      prevCursor: null,
    })
  })

  test("rejects an invalid workspace token", async () => {
    mockFindWorkspace.mockResolvedValue(null)

    await expect(
      call(procedure, emptyQuery, {
        context: {
          headers: new Headers({ authorization: "Bearer invalid-token" }),
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_CHATBOT_TOKEN" })
    expect(mockListConversationsForAPI).not.toHaveBeenCalled()
  })
})
