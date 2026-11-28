// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildConversationWhere: vi.fn().mockReturnValue({}),
  createMessageRepository: vi.fn(),
  findManyQuery: vi.fn(),
  findWithFullRelations: vi.fn(),
  listTagPreviewsByContactIds: vi.fn(),
  repo: { findLastByConversation: vi.fn().mockResolvedValue([]) },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findManyQuery: mocks.findManyQuery,
    findWithFullRelations: mocks.findWithFullRelations,
  },
  resolveContactAvatarUrl: vi.fn(async () => null),
  resolveTenantSettings: vi.fn(async () => ({
    storageUrl: "https://cdn.test",
  })),
  tagService: {
    listTagPreviewsByContactIds: mocks.listTagPreviewsByContactIds,
  },
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
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: (value: Date | undefined) => value,
}))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))
vi.mock(
  "../src/features/conversations/queries/build-conversation-where",
  () => ({ buildConversationWhere: mocks.buildConversationWhere }),
)

const { listConversations, findConversation } = await import(
  "../src/features/conversations/queries/list-conversations.query"
)

const conversationOf = (id: string, contactId: string | null) => ({
  id,
  contactId: contactId ?? "0",
  lastActivityAt: new Date("2026-01-01T00:00:00Z"),
  contactInboxes: [],
  contact: contactId ? { id: contactId, avatar: null } : null,
  assignedUser: null,
  assignedInboxTeam: null,
  conversationParticipants: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createMessageRepository.mockResolvedValue(mocks.repo)
  mocks.repo.findLastByConversation.mockResolvedValue([])
  mocks.buildConversationWhere.mockReturnValue({})
})

describe("conversation contact tag previews", () => {
  test("a page reads every contact's previews in one batched call, whatever the page size", async () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      conversationOf(`conv-${index}`, `contact-${index}`),
    )
    mocks.findManyQuery.mockResolvedValue(rows)
    mocks.listTagPreviewsByContactIds.mockResolvedValue(
      new Map([
        [
          "contact-0",
          {
            tagCount: 7,
            tagPreview: [{ id: "t-1", name: "alpha", color: "#1A2B3C" }],
          },
        ],
      ]),
    )

    const result = await listConversations(
      { workspaceId: "ws-1", perPage: 50 },
      { includeEmailAndPhone: true },
    )

    expect(mocks.listTagPreviewsByContactIds).toHaveBeenCalledTimes(1)
    expect(mocks.listTagPreviewsByContactIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: rows.map((row) => row.contactId),
      limit: 3,
    })
    expect(result.data[0]?.contact).toMatchObject({
      tagCount: 7,
      tagPreview: [{ id: "t-1", name: "alpha", color: "#1A2B3C" }],
    })
    // A contact the batch had no entry for still has the fields, empty.
    expect(result.data[1]?.contact).toMatchObject({
      tagCount: 0,
      tagPreview: [],
    })
  })

  test("the compact view carries the same previews", async () => {
    mocks.findManyQuery.mockResolvedValue([conversationOf("conv-1", "c-1")])
    mocks.listTagPreviewsByContactIds.mockResolvedValue(
      new Map([
        [
          "c-1",
          { tagCount: 2, tagPreview: [{ id: "t", name: "x", color: null }] },
        ],
      ]),
    )

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, view: "compact" },
    )

    expect(result.data[0]?.contact).toMatchObject({ tagCount: 2 })
  })

  test("a page of conversations without contacts reads no tags", async () => {
    mocks.findManyQuery.mockResolvedValue([conversationOf("conv-1", null)])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(mocks.listTagPreviewsByContactIds).not.toHaveBeenCalled()
  })

  test("findConversation adds the previews of its contact", async () => {
    mocks.findWithFullRelations.mockResolvedValue(
      conversationOf("conv-1", "c-1"),
    )
    mocks.listTagPreviewsByContactIds.mockResolvedValue(
      new Map([
        [
          "c-1",
          { tagCount: 4, tagPreview: [{ id: "t", name: "x", color: null }] },
        ],
      ]),
    )

    const { data } = await findConversation({
      id: "conv-1",
      workspaceId: "ws-1",
    })

    expect(mocks.listTagPreviewsByContactIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      limit: 3,
    })
    expect(data.contact).toMatchObject({ tagCount: 4 })
  })
})
