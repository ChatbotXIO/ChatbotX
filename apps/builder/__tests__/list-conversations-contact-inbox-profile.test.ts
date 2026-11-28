// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findManyQuery: vi.fn(),
  findWithFullRelations: vi.fn(),
  repo: { findLastByConversation: vi.fn().mockResolvedValue([]) },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findManyQuery: mocks.findManyQuery,
    findWithFullRelations: mocks.findWithFullRelations,
  },
  resolveContactAvatarUrl: vi.fn(async () => null),
  resolveTenantSettings: vi.fn(async () => ({ storageUrl: "https://cdn" })),
  tagService: { listTagPreviewsByContactIds: vi.fn(async () => new Map()) },
}))
vi.mock("@chatbotx.io/business/utils", () => ({
  toPublicStorageUrl: (key: string, base: string) => `${base}/${key}`,
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxOperationalColumns: { sourceIdentityHistory: false },
  recentParticipantsRelation: { limit: 3 },
  createMessageRepository: vi.fn(async () => mocks.repo),
  getSafeSinceTime: vi.fn((value: Date | undefined) => value),
}))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock(
  "../src/features/conversations/queries/build-conversation-where",
  () => ({
    buildConversationWhere: vi.fn().mockReturnValue({}),
  }),
)

const { listConversations, findConversation } = await import(
  "../src/features/conversations/queries/list-conversations.query"
)
const {
  conversationContactInboxResource,
  conversationCompactContactInboxResource,
} = await import("../src/features/conversations/schema/resource")

const buildContactInbox = (profile: {
  followsBusiness: boolean | null
  followerCount: number | null
}) => ({
  id: "ci-1",
  contactId: "contact-1",
  inboxId: "inbox-1",
  channel: "instagram",
  source: "inboundMessage",
  sourceId: "igsid",
  sourceUserId: null,
  sourceUsername: "someone",
  language: null,
  lastMessageAt: null,
  lastIncomingMessageAt: null,
  contactLastReadAt: null,
  referral: null,
  threadControlState: null,
  threadOwnerRole: null,
  threadControlUpdatedAt: null,
  threadOwnerExpiresAt: null,
  threadOwnerAppId: null,
  threadControlLastEvent: null,
  inbox: { id: "inbox-1", name: "IG", channel: "instagram" },
  ...profile,
})

const buildConversation = (
  contactInbox: ReturnType<typeof buildContactInbox>,
) => ({
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  lastActivityAt: new Date("2026-01-01T00:00:00Z"),
  contactInboxes: [contactInbox],
  contact: null,
  assignedUser: null,
  assignedInboxTeam: null,
  conversationParticipants: [],
})

describe("conversation contact inbox profile facts", () => {
  beforeEach(() => {
    mocks.repo.findLastByConversation.mockResolvedValue([])
  })

  test.each([
    { followsBusiness: true, followerCount: 1500 },
    { followsBusiness: false, followerCount: 0 },
    { followsBusiness: null, followerCount: null },
  ])("full list and findConversation carry %o", async (profile) => {
    const conversation = buildConversation(buildContactInbox(profile))
    mocks.findManyQuery.mockResolvedValue([conversation])
    mocks.findWithFullRelations.mockResolvedValue(conversation)

    const list = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )
    const found = await findConversation({ id: "conv-1", workspaceId: "ws-1" })

    for (const contactInbox of [
      list.data[0]?.contactInboxes[0],
      found.data.contactInboxes[0],
    ]) {
      expect(contactInbox).toMatchObject(profile)
      expect(
        conversationContactInboxResource.safeParse(contactInbox).success,
      ).toBe(true)
    }
  })

  test("the compact list carries the facts and validates", async () => {
    const profile = { followsBusiness: false, followerCount: 0 }
    mocks.findManyQuery.mockResolvedValue([
      buildConversation(buildContactInbox(profile)),
    ])

    const list = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, view: "compact" },
    )

    const contactInbox = list.data[0]?.contactInboxes[0]
    expect(contactInbox).toMatchObject(profile)
    expect(
      conversationCompactContactInboxResource.safeParse(contactInbox).success,
    ).toBe(true)
  })
})
