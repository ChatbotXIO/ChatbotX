import type {
  ContactInboxModel,
  ContactModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindPost, mockFindMessage } = vi.hoisted(() => ({
  mockFindPost: vi.fn(),
  mockFindMessage: vi.fn(),
}))

vi.mock("@chatbotx.io/business/pipeline/variable-targets", () => ({
  loadPipelineVariableTargets: vi.fn(),
  loadLastPipelineItemId: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  botFieldWorkspaceCacheTags: (workspaceId: string) => [
    "bot-fields",
    `bot-fields:${workspaceId}`,
  ],
  appointmentService: { findBy: vi.fn(), findLatestForContact: vi.fn() },
  channelPostService: { findCommentVariableValues: mockFindPost },
  contactInboxService: {
    findLatestLastIncomingMessageAtByContactId: vi.fn(),
  },
  messageService: {
    findById: mockFindMessage,
    listIncomingTextsByContactInbox: vi.fn(),
  },
  resolveTenantSettings: vi.fn(),
  workspaceService: { find: vi.fn() },
}))

vi.mock("@chatbotx.io/business/contact-locale", () => ({
  languageFromLocale: () => null,
  normalizeStoredTimezone: (value: string | null) => value,
  offsetFromStoredTimezone: () => null,
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  resolveGenderLabel: () => null,
}))

vi.mock("@chatbotx.io/business/workspace-lifecycle/predicates", () => ({
  isWorkspaceScheduledForDeletion: () => false,
}))

vi.mock("@chatbotx.io/business/coupon", () => ({
  couponService: { resolveCouponVariable: vi.fn() },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: async (_key: string, fn: () => Promise<unknown>) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: { findFirst: vi.fn() },
      contactInboxModel: { findFirst: vi.fn() },
      contactCustomFieldModel: { findMany: vi.fn().mockResolvedValue([]) },
      botFieldModel: { findMany: vi.fn().mockResolvedValue([]) },
    },
  },
}))

const { contactVariableService } = await import("../src/contact-variable")
const { createPostCommentLoader, isPostCommentVariable } = await import(
  "../src/post-comment-variable"
)

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  firstName: "Ada",
  locale: null,
  timezone: "UTC",
} as ContactModel
const contactInbox = { id: "inbox-1" } as ContactInboxModel
const workspace = { id: "workspace-1", timezone: "UTC" } as WorkspaceModel

const ref = {
  channelPostId: "900",
  commentMessageId: "5000",
  commentMessageCreatedAt: "2026-11-24T10:00:00.000Z",
}

const post = {
  externalPostId: "page_post_1",
  pageName: "Acme Page",
  permalink: "https://facebook.com/acme/posts/1",
  publishedAt: new Date("2026-11-20T08:30:00Z"),
  text: "Big sale today",
}

const makeContext = (withRun: boolean) => ({
  contact,
  contactInbox,
  workspace,
  conversation: null,
  customFieldsMap: new Map(),
  ...(withRun
    ? { postComment: createPostCommentLoader("workspace-1", ref) }
    : {}),
})

const render = (text: string, withRun = true) =>
  contactVariableService.replaceAll({
    text,
    variables: makeContext(withRun),
  })

beforeEach(() => {
  vi.clearAllMocks()
  mockFindPost.mockResolvedValue(post)
  mockFindMessage.mockResolvedValue({
    sourceId: "comment_1",
    text: "I want one!",
    deletedAt: null,
  })
})

describe("isPostCommentVariable", () => {
  test("accepts exactly the seven run-scoped names", () => {
    for (const name of [
      "post.link",
      "post.text",
      "post.published_at",
      "post.page_name",
      "post.id",
      "comment.text",
      "comment.id",
    ]) {
      expect(isPostCommentVariable(name)).toBe(true)
    }
    for (const name of ["post", "post.unknown", "last_post_id", "comment"]) {
      expect(isPostCommentVariable(name)).toBe(false)
    }
  })
})

describe("post comment variables", () => {
  test("render the post and the comment of the run", async () => {
    expect(
      await render(
        "{{post.page_name}}|{{post.link}}|{{post.text}}|{{post.id}}|{{comment.text}}|{{comment.id}}",
      ),
    ).toBe(
      "Acme Page|https://facebook.com/acme/posts/1|Big sale today|page_post_1|I want one!|comment_1",
    )
    expect(await render("{{post.published_at}}")).toContain("2026")
  })

  test("read the post by its stored id inside the workspace, and the stored comment by id and time", async () => {
    await render("{{post.link}} {{comment.text}}")

    expect(mockFindPost).toHaveBeenCalledWith({
      channelPostId: "900",
      workspaceId: "workspace-1",
    })
    expect(mockFindMessage).toHaveBeenCalledWith({
      id: "5000",
      createdAt: new Date("2026-11-24T10:00:00.000Z"),
      workspaceId: "workspace-1",
    })
  })

  test("load once however many tokens are rendered", async () => {
    await render("{{post.link}} {{post.text}} {{comment.text}}")

    expect(mockFindPost).toHaveBeenCalledTimes(1)
    expect(mockFindMessage).toHaveBeenCalledTimes(1)
  })

  test("render empty outside a post-comment run, never a latest post", async () => {
    expect(await render("[{{post.link}}][{{comment.text}}]", false)).toBe(
      "[][]",
    )
    expect(mockFindPost).not.toHaveBeenCalled()
  })

  test("render empty when the post is gone", async () => {
    mockFindPost.mockResolvedValue(null)

    expect(await render("[{{post.link}}][{{comment.text}}]")).toBe("[][]")
  })

  test("render empty, without failing the message, when the lookup throws", async () => {
    mockFindPost.mockRejectedValue(new Error("db down"))

    expect(await render("hi [{{post.link}}]")).toBe("hi []")
  })

  test("a deleted comment renders empty text", async () => {
    mockFindMessage.mockResolvedValue({
      sourceId: "comment_1",
      text: "gone",
      deletedAt: new Date(),
    })

    expect(await render("[{{comment.text}}]")).toBe("[]")
  })
})
