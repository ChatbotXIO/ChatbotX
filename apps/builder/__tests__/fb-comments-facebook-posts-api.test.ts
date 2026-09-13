import { listCommentAutomationContactsResponse } from "@chatbotx.io/analytics/schemas"
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
      contactTotal: 1,
      contactInboxIds: ["inbox-1"],
      events: [
        {
          rowKey: "event-1",
          contactId: "contact-1",
          contactInboxId: "inbox-1",
          occurredAt: "2026-09-11T00:00:00.000Z",
        },
      ],
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
    // Pinned because the shape is easy to get wrong across a rebase: the
    // service takes `{ workspaceId, ids }`, and passing a bare array silently
    // hydrates nothing — which renders as an empty dialog, not an error.
    expect(mocks.findContactInboxesByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["inbox-1"],
    })
  })

  test("drops a row whose ContactInbox no longer resolves rather than rendering a blank contact", async () => {
    mocks.getCommentAutomationContacts.mockResolvedValue({
      contactTotal: 2,
      contactInboxIds: ["inbox-1", "inbox-gone"],
      events: [
        {
          rowKey: "event-1",
          contactId: "contact-1",
          contactInboxId: "inbox-1",
          occurredAt: "2026-09-11T00:00:00.000Z",
        },
        {
          rowKey: "event-2",
          contactId: "contact-2",
          contactInboxId: "inbox-gone",
          occurredAt: "2026-09-11T00:00:00.000Z",
        },
      ],
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

  test("the handler's output satisfies the procedure's response schema", async () => {
    // `.output()` is stubbed out by the mocked `authorizedAPI` above, so the
    // real schema has to be applied here — otherwise a field that oRPC rejects
    // at runtime surfaces only as an empty dialog, since `StatsContactsDialog`
    // swallows the failure into `console.error`.
    mocks.getCommentAutomationContacts.mockResolvedValue({
      contactTotal: 1,
      contactInboxIds: ["inbox-1"],
      events: [
        {
          rowKey: "event-1",
          contactId: "contact-1",
          contactInboxId: "inbox-1",
          occurredAt: "2026-09-11T00:00:00.000Z",
          errorContent: "token expired",
        },
      ],
    })
    mocks.findContactInboxesByIds.mockResolvedValue([
      {
        id: "inbox-1",
        contactId: "contact-1",
        sourceId: null,
        channel: "messenger",
        contact: {
          id: "contact-1",
          firstName: null,
          lastName: null,
          fullName: null,
          avatar: null,
        },
        conversation: null,
      },
    ])

    const result = await commentAutomationContactsHandler?.({
      input: { ...baseInput, eventType: "message:failed" as const },
    })

    expect(() =>
      listCommentAutomationContactsResponse.parse(result),
    ).not.toThrow()
  })

  test("never queries when no event type is given", async () => {
    const result = (await commentAutomationContactsHandler?.({
      input: { ...baseInput, eventType: undefined },
    })) as { data: unknown[]; pageCount: number }

    expect(result).toEqual({
      data: [],
      total: 3,
      contactTotal: 0,
      page: 1,
      pageCount: 0,
    })
    expect(mocks.getCommentAutomationContacts).not.toHaveBeenCalled()
  })
})

describe("privateListCommentAutomationContactsAPI repeat occurrences", () => {
  const baseInput = {
    workspaceId: "workspace-1",
    automationId: "automation-1",
    eventType: "message:delivered" as const,
    total: 3,
    page: 1,
    perPage: 20,
  }

  test("lists the same contact once per event, newest first, each with its own rowKey", async () => {
    // Contact A at 12h, B at 11h, A again at 10h — the order the repository
    // returned. A row per occurrence is the whole point; collapsing by
    // `contactId` anywhere in the chain would lose A's second line.
    mocks.getCommentAutomationContacts.mockResolvedValue({
      contactTotal: 2,
      contactInboxIds: ["inbox-a", "inbox-b", "inbox-a"],
      events: [
        {
          rowKey: "event-3",
          contactId: "contact-a",
          contactInboxId: "inbox-a",
          occurredAt: "2026-09-12T00:00:00.000Z",
        },
        {
          rowKey: "event-2",
          contactId: "contact-b",
          contactInboxId: "inbox-b",
          occurredAt: "2026-09-11T00:00:00.000Z",
        },
        {
          rowKey: "event-1",
          contactId: "contact-a",
          contactInboxId: "inbox-a",
          occurredAt: "2026-09-10T00:00:00.000Z",
        },
      ],
    })
    mocks.findContactInboxesByIds.mockResolvedValue(
      ["a", "b"].map((suffix) => ({
        id: `inbox-${suffix}`,
        contactId: `contact-${suffix}`,
        sourceId: `psid-${suffix}`,
        channel: "messenger",
        contact: {
          id: `contact-${suffix}`,
          firstName: suffix.toUpperCase(),
          lastName: null,
          fullName: suffix.toUpperCase(),
          avatar: null,
        },
        conversation: { id: `conversation-${suffix}` },
      })),
    )

    const result = (await commentAutomationContactsHandler?.({
      input: { ...baseInput, eventType: "flow:clicked" as const },
    })) as { data: { contactId: string; rowKey: string; occurredAt: string }[] }

    expect(result.data.map((row) => [row.contactId, row.occurredAt])).toEqual([
      ["contact-a", "2026-09-12T00:00:00.000Z"],
      ["contact-b", "2026-09-11T00:00:00.000Z"],
      ["contact-a", "2026-09-10T00:00:00.000Z"],
    ])
    // Distinct per row, so the list neither drops nor mis-keys the repeat.
    expect(new Set(result.data.map((row) => row.rowKey)).size).toBe(3)
    // One lookup per inbox, not per row.
    expect(mocks.findContactInboxesByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["inbox-a", "inbox-b"],
    })
  })
})

describe("privateListCommentAutomationContactsAPI contactTotal", () => {
  test("reports people, not rows, so select-all tags what it promises", async () => {
    // 3 rows from 2 commenters. The column (and the dialog title) says 3
    // events; tagging acts on contacts, so the selection counter must say 2.
    mocks.getCommentAutomationContacts.mockResolvedValue({
      contactTotal: 2,
      contactInboxIds: ["inbox-a", "inbox-b", "inbox-a"],
      events: [
        {
          rowKey: "event-3",
          contactId: "contact-a",
          contactInboxId: "inbox-a",
          occurredAt: "2026-09-12T00:00:00.000Z",
        },
        {
          rowKey: "event-2",
          contactId: "contact-b",
          contactInboxId: "inbox-b",
          occurredAt: "2026-09-11T00:00:00.000Z",
        },
        {
          rowKey: "event-1",
          contactId: "contact-a",
          contactInboxId: "inbox-a",
          occurredAt: "2026-09-10T00:00:00.000Z",
        },
      ],
    })
    mocks.findContactInboxesByIds.mockResolvedValue(
      ["a", "b"].map((suffix) => ({
        id: `inbox-${suffix}`,
        contactId: `contact-${suffix}`,
        sourceId: `psid-${suffix}`,
        channel: "messenger",
        contact: {
          id: `contact-${suffix}`,
          firstName: suffix.toUpperCase(),
          lastName: null,
          fullName: suffix.toUpperCase(),
          avatar: null,
        },
        conversation: { id: `conversation-${suffix}` },
      })),
    )

    const result = (await commentAutomationContactsHandler?.({
      input: {
        workspaceId: "workspace-1",
        automationId: "automation-1",
        eventType: "message:sent" as const,
        total: 3,
        page: 1,
        perPage: 20,
      },
    })) as { data: unknown[]; total: number; contactTotal: number }

    expect(result.data).toHaveLength(3)
    expect(result.total).toBe(3)
    expect(result.contactTotal).toBe(2)
  })
})
