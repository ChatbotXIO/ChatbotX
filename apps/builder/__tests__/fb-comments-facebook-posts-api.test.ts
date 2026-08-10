import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ProcedureHandler = (args: { input: unknown }) => Promise<unknown>

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: {
      handlers: Record<string, ProcedureHandler>
      routeConfig?: RouteConfig
    } = { handlers: {} }
    let currentRouteName: string | undefined

    const procedure = {
      route: vi.fn((config: RouteConfig) => {
        currentRouteName = config.path
        state.routeConfig = config
        return procedure
      }),
      input: vi.fn(() => procedure),
      use: vi.fn(() => procedure),
      output: vi.fn(() => procedure),
      handler: vi.fn((handler: ProcedureHandler) => {
        if (currentRouteName) {
          state.handlers[currentRouteName] = handler
        }
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: {
        findMessengerIntegrationsByWorkspaceId: vi.fn(),
        listPublishedPosts: vi.fn(),
        listAdsPosts: vi.fn(),
        listReelsPosts: vi.fn(),
        loggerError: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))
vi.mock("@/lib/log", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByWorkspaceId: mocks.findMessengerIntegrationsByWorkspaceId,
  },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/post", () => ({
  listPublishedPosts: mocks.listPublishedPosts,
  listAdsPosts: mocks.listAdsPosts,
  listReelsPosts: mocks.listReelsPosts,
}))

vi.mock("@/features/fb-comments/actions/create-fb-comment.action", () => ({
  createFbComment: vi.fn(),
}))
vi.mock("@/features/fb-comments/actions/delete-fb-comment.action", () => ({
  deleteFbComment: vi.fn(),
}))
vi.mock("@/features/fb-comments/actions/update-fb-comment.action", () => ({
  updateFbComment: vi.fn(),
}))
vi.mock("@/features/fb-comments/queries", () => ({
  listFbComments: vi.fn(),
}))

await import("@/features/fb-comments/api/authenticated")

const facebookPostsHandler =
  mocks.state.handlers["/workspaces/{workspaceId}/fb-comments/facebook-posts"]

function buildPost(id: string) {
  return { id, created_time: "2026-07-16T00:00:00Z" }
}

describe("facebookPostsAPI", () => {
  test("returns published/ads/reels in a single call, merging every connected Facebook Page (2 pages: 2 + 3 posts -> 5 posts)", async () => {
    mocks.findMessengerIntegrationsByWorkspaceId.mockResolvedValue([
      { id: "integration-a", pageId: "page-a", name: "Page A", auth: {} },
      { id: "integration-b", pageId: "page-b", name: "Page B", auth: {} },
    ])
    mocks.listPublishedPosts.mockImplementation(({ pageId }) =>
      pageId === "page-a"
        ? [buildPost("a-1"), buildPost("a-2")]
        : [buildPost("b-1"), buildPost("b-2"), buildPost("b-3")],
    )
    mocks.listAdsPosts.mockResolvedValue([])
    mocks.listReelsPosts.mockResolvedValue([])

    const result = (await facebookPostsHandler?.({
      input: { workspaceId: "workspace-1" },
    })) as {
      published: { id: string; pageId: string }[]
      ads: unknown[]
      reels: unknown[]
      pages: unknown[]
    }

    expect(mocks.findMessengerIntegrationsByWorkspaceId).toHaveBeenCalledTimes(
      1,
    )
    expect(result.published).toHaveLength(5)
    expect(result.published.every((post) => post.pageId)).toBe(true)
  })

  test("lists every connected Page in `pages`, even one with zero posts", async () => {
    mocks.findMessengerIntegrationsByWorkspaceId.mockResolvedValue([
      { id: "integration-a", pageId: "page-a", name: "Page A", auth: {} },
      { id: "integration-b", pageId: "page-b", name: "Page B", auth: {} },
    ])
    mocks.listPublishedPosts.mockImplementation(({ pageId }) =>
      pageId === "page-a" ? [buildPost("a-1")] : [],
    )
    mocks.listAdsPosts.mockResolvedValue([])
    mocks.listReelsPosts.mockResolvedValue([])

    const result = (await facebookPostsHandler?.({
      input: { workspaceId: "workspace-1" },
    })) as { pages: { id: string; name: string }[] }

    expect(result.pages).toEqual([
      { id: "page-a", name: "Page A" },
      { id: "page-b", name: "Page B" },
    ])
  })

  test("logs a failure fetching one Page's posts instead of silently dropping it", async () => {
    mocks.findMessengerIntegrationsByWorkspaceId.mockResolvedValue([
      { id: "integration-a", pageId: "page-a", name: "Page A", auth: {} },
      { id: "integration-b", pageId: "page-b", name: "Page B", auth: {} },
    ])
    mocks.listPublishedPosts.mockImplementation(({ pageId }) => {
      if (pageId === "page-a") {
        throw new Error("token expired")
      }
      return [buildPost("b-1")]
    })
    mocks.listAdsPosts.mockResolvedValue([])
    mocks.listReelsPosts.mockResolvedValue([])

    const result = (await facebookPostsHandler?.({
      input: { workspaceId: "workspace-1" },
    })) as { published: { id: string }[] }

    expect(result.published).toEqual([expect.objectContaining({ id: "b-1" })])
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: "integration-a" }),
      expect.stringContaining("Failed to list Facebook published posts"),
    )
  })
})
