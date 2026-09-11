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
        getCommentAutomationContacts: vi.fn(),
        findContactInboxesByIds: vi.fn(),
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
  contactInboxService: { findManyByIds: mocks.findContactInboxesByIds },
}))

// `@chatbotx.io/analytics`'s barrel re-exports services that construct the
// database pool on import, which reads server-only env and throws under jsdom.
// The schemas entry is safe (zod only) and stays real.
vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService: {
    getContacts: mocks.getCommentAutomationContacts,
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

await import("@/features/fb-comments/api/private")

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

const commentAutomationContactsHandler =
  mocks.state.handlers[
    "/workspaces/{workspaceId}/comment-automations/{automationId}/contacts"
  ]

describe("privateListCommentAutomationContactsAPI", () => {
  const baseInput = {
    workspaceId: "workspace-1",
    automationId: "automation-1",
    eventType: "message:delivered" as const,
    total: 3,
    page: 1,
    perPage: 20,
  }

  test("returns the real Contact id, not the ContactInbox id, so the tag actions target the right rows", async () => {
    mocks.getCommentAutomationContacts.mockResolvedValue({
      contactInboxIds: ["inbox-1"],
      contactEventMap: new Map([
        [
          "inbox-1",
          {
            contactId: "contact-1",
            contactInboxId: "inbox-1",
            occurredAt: "2026-09-11T00:00:00.000Z",
          },
        ],
      ]),
    })
    mocks.findContactInboxesByIds.mockResolvedValue([
      {
        id: "inbox-1",
        contactId: "contact-1",
        sourceId: "psid-1",
        channel: "messenger",
        contact: {
          id: "contact-1",
          firstName: "Lan",
          lastName: null,
          fullName: "Lan",
          avatar: null,
        },
        conversation: { id: "conversation-1" },
      },
    ])

    const result = (await commentAutomationContactsHandler?.({
      input: baseInput,
    })) as { data: { contactId: string; contactInboxId: string }[] }

    expect(result.data).toEqual([
      expect.objectContaining({
        contactId: "contact-1",
        contactInboxId: "inbox-1",
        conversationId: "conversation-1",
      }),
    ])
  })

  test("drops a row whose ContactInbox no longer resolves rather than rendering a blank contact", async () => {
    mocks.getCommentAutomationContacts.mockResolvedValue({
      contactInboxIds: ["inbox-1", "inbox-gone"],
      contactEventMap: new Map([
        [
          "inbox-1",
          {
            contactId: "contact-1",
            contactInboxId: "inbox-1",
            occurredAt: "2026-09-11T00:00:00.000Z",
          },
        ],
        [
          "inbox-gone",
          {
            contactId: "contact-2",
            contactInboxId: "inbox-gone",
            occurredAt: "2026-09-11T00:00:00.000Z",
          },
        ],
      ]),
    })
    mocks.findContactInboxesByIds.mockResolvedValue([
      {
        id: "inbox-1",
        contactId: "contact-1",
        sourceId: "psid-1",
        channel: "messenger",
        contact: {
          id: "contact-1",
          firstName: "Lan",
          lastName: null,
          fullName: "Lan",
          avatar: null,
        },
        conversation: { id: "conversation-1" },
      },
    ])

    const result = (await commentAutomationContactsHandler?.({
      input: baseInput,
    })) as { data: { contactInboxId: string }[]; pageCount: number }

    expect(result.data).toHaveLength(1)
    // `pageCount` still comes from the caller-supplied total, which is the
    // number rendered on the column that was clicked.
    expect(result.pageCount).toBe(1)
  })

  test("never queries when no event type is given", async () => {
    const result = (await commentAutomationContactsHandler?.({
      input: { ...baseInput, eventType: undefined },
    })) as { data: unknown[]; pageCount: number }

    expect(result).toEqual({ data: [], total: 3, page: 1, pageCount: 0 })
    expect(mocks.getCommentAutomationContacts).not.toHaveBeenCalled()
  })
})
