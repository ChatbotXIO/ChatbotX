import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockListThreadsIntegrations, mockListThreadsPosts, mockLoggerError } =
  vi.hoisted(() => ({
    mockListThreadsIntegrations: vi.fn(),
    mockListThreadsPosts: vi.fn(),
    mockLoggerError: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  integrationThreadsService: {
    listByWorkspaceId: mockListThreadsIntegrations,
  },
}))

vi.mock("@chatbotx.io/integration-threads", () => ({
  listThreadsPosts: mockListThreadsPosts,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}))

const { listThreadsPostsForWorkspace } = await import(
  "@/features/threads-comments/lib/threads-posts"
)

const integrationA = {
  id: "integration-a",
  threadsUserId: "threads-user-a",
  username: "account_a",
  auth: { tokens: { accessToken: "token-a" } },
}

const integrationB = {
  id: "integration-b",
  threadsUserId: "threads-user-b",
  username: "account_b",
  auth: { tokens: { accessToken: "token-b" } },
}

function buildPost(id: string) {
  return {
    id,
    text: `text-${id}`,
    media_type: "TEXT_POST",
    timestamp: "2026-09-01T00:00:00Z",
  }
}

describe("listThreadsPostsForWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("merges posts from every connected account and tags each with its account", async () => {
    mockListThreadsIntegrations.mockResolvedValue({
      data: [integrationA, integrationB],
    })
    mockListThreadsPosts.mockImplementation(({ auth }) =>
      auth.tokens.accessToken === "token-a"
        ? [buildPost("a-1")]
        : [buildPost("b-1"), buildPost("b-2")],
    )

    const result = await listThreadsPostsForWorkspace("workspace-1")

    expect(mockListThreadsIntegrations).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(result.accounts).toEqual([
      { id: "threads-user-a", name: "@account_a" },
      { id: "threads-user-b", name: "@account_b" },
    ])
    expect(
      result.posts.map((post) => [post.id, post.accountId]).sort(),
    ).toEqual([
      ["a-1", "threads-user-a"],
      ["b-1", "threads-user-b"],
      ["b-2", "threads-user-b"],
    ])
  })

  test("logs a failure fetching one account's posts, while still returning the others", async () => {
    mockListThreadsIntegrations.mockResolvedValue({
      data: [integrationA, integrationB],
    })
    mockListThreadsPosts.mockImplementation(({ auth }) => {
      if (auth.tokens.accessToken === "token-a") {
        throw new Error("token expired")
      }
      return [buildPost("b-1")]
    })

    const result = await listThreadsPostsForWorkspace("workspace-1")

    expect(result.posts).toEqual([expect.objectContaining({ id: "b-1" })])
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: "integration-a" }),
      expect.stringContaining("Failed to list Threads posts"),
    )
  })

  test("shows a video's thumbnail, not its .mp4 media_url", async () => {
    mockListThreadsIntegrations.mockResolvedValue({ data: [integrationA] })
    mockListThreadsPosts.mockResolvedValue([
      {
        ...buildPost("a-1"),
        media_type: "VIDEO",
        media_url: "https://cdn.example.com/video.mp4",
        thumbnail_url: "https://cdn.example.com/thumb.jpg",
      },
    ])

    const result = await listThreadsPostsForWorkspace("workspace-1")

    expect(result.posts[0]?.full_picture).toBe(
      "https://cdn.example.com/thumb.jpg",
    )
  })
})
