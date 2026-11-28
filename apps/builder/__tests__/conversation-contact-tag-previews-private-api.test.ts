import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: {
  input: { workspaceId: string; contactIds: string[] }
  context: unknown
}) => Promise<{
  data: {
    contactId: string
    tagCount: number
    tagPreview: { id: string; name: string; color: string | null }[]
  }[]
}>

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
  listTagPreviewsForConversationContacts: vi.fn(),
}))

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  conversationService: {},
  tagService: {
    listTagPreviewsForConversationContacts:
      mocks.listTagPreviewsForConversationContacts,
  },
}))
vi.mock("@/lib/public-api/member-scope", () => ({
  assertConversationAccessForCaller: vi.fn(),
}))
vi.mock("@/features/contacts/permissions", () => ({
  canViewContactEmailAndPhone: vi.fn(),
}))
vi.mock("@/lib/workspace-quota", () => ({ assertWorkspaceNotBlocked: vi.fn() }))
vi.mock(
  "../src/features/conversations/queries/list-conversations.query",
  () => ({ findConversation: vi.fn(), listConversations: vi.fn() }),
)
vi.mock("../src/features/conversations/queries/get-post-details.query", () => ({
  getPostDetailsQuery: vi.fn(),
}))
vi.mock(
  "../src/features/conversations/queries/list-participants.query",
  () => ({ listConversationParticipants: vi.fn() }),
)

await import("@/features/conversations/api/private")

const PATH = "/workspaces/{workspaceId}/conversations/contact-tag-previews"
// A member who can use the inbox but has no contacts permission.
const inboxOnlyMember = {
  workspaceMember: { permissions: { contacts: { read: false } } },
  user: { id: "u-1" },
}
const assignedOnlyMember = {
  workspaceMember: { permissions: { onlyAssignedConversations: true } },
  user: { id: "u-2" },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listContactTagPreviewsAuthenticatedAPI", () => {
  test("an inbox-only member (no contacts permission) gets the previews, like the list rows", async () => {
    mocks.listTagPreviewsForConversationContacts.mockResolvedValue(
      new Map([
        [
          "c-1",
          {
            tagCount: 5,
            tagPreview: [{ id: "t-1", name: "alpha", color: "#1A2B3C" }],
          },
        ],
      ]),
    )

    const result = await handlersByPath[PATH]?.({
      input: { workspaceId: "ws-1", contactIds: ["c-1", "c-2"] },
      context: inboxOnlyMember,
    })

    expect(mocks.listTagPreviewsForConversationContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1", "c-2"],
      limit: 3,
    })
    expect(result?.data).toEqual([
      {
        contactId: "c-1",
        tagCount: 5,
        tagPreview: [{ id: "t-1", name: "alpha", color: "#1A2B3C" }],
      },
    ])
  })

  test("an id the member cannot see in the list is absent from the response", async () => {
    // The service returns entries only for contacts that have a conversation
    // in the workspace; "c-hidden" has none (or is another workspace's).
    mocks.listTagPreviewsForConversationContacts.mockResolvedValue(new Map())

    const result = await handlersByPath[PATH]?.({
      input: { workspaceId: "ws-1", contactIds: ["c-hidden"] },
      context: inboxOnlyMember,
    })

    expect(result?.data).toEqual([])
  })

  test("applies no per-member contact scope: the list it mirrors applies none", async () => {
    mocks.listTagPreviewsForConversationContacts.mockResolvedValue(new Map())

    await handlersByPath[PATH]?.({
      input: { workspaceId: "ws-1", contactIds: ["c-1"] },
      context: assignedOnlyMember,
    })

    expect(mocks.listTagPreviewsForConversationContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      limit: 3,
    })
  })
})
