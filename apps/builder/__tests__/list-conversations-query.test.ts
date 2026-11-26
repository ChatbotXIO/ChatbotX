// @vitest-environment node

import { endOfHour } from "date-fns"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    findLastByConversation: vi.fn().mockResolvedValue([]),
    findLastByConversations: vi.fn().mockResolvedValue(new Map()),
  }
  return {
    assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
    buildConversationWhere: vi.fn().mockReturnValue({}),
    createMessageRepository: vi.fn().mockResolvedValue(repo),
    findManyQuery: vi.fn().mockResolvedValue([]),
    findWithFullRelations: vi.fn().mockResolvedValue(null),
    // Identity mock: resolveLastMessageSinceTime's output becomes exactly the
    // anchor it was given, so assertions can compare sinceTime straight
    // against each conversation's own lastActivityAt.
    getSafeSinceTime: vi.fn((value: Date | undefined) => value),
    notFoundException: (message: string) => new Error(message),
    resolveTenantSettings: vi.fn(async () => ({
      storageUrl: "https://cdn.example.com",
    })),
    resolveContactAvatarUrl: vi.fn(
      async (
        input: {
          contact: { avatar: string | null }
          contactInboxes?: readonly { id: string; channel: string }[]
        },
        finalize: (key: string) => string | Promise<string>,
      ): Promise<string | null> =>
        input.contact.avatar
          ? await finalize(input.contact.avatar)
          : `https://app.example.com/media/avatar/${input.contactInboxes?.at(-1)?.id}`,
    ),
    repo,
  }
})

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findManyQuery: mocks.findManyQuery,
    findWithFullRelations: mocks.findWithFullRelations,
  },
  resolveContactAvatarUrl: mocks.resolveContactAvatarUrl,
  resolveTenantSettings: mocks.resolveTenantSettings,
}))
vi.mock("@chatbotx.io/business/utils", () => ({
  toPublicStorageUrl: (key: string, base: string) => `${base}/${key}`,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: mocks.notFoundException,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxOperationalColumns: { sourceIdentityHistory: false },
  recentParticipantsRelation: { limit: 3 },
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: mocks.getSafeSinceTime,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

vi.mock(
  "../src/features/conversations/queries/build-conversation-where",
  () => ({
    buildConversationWhere: mocks.buildConversationWhere,
  }),
)

const { listConversations, findConversation } = await import(
  "../src/features/conversations/queries/list-conversations.query"
)

describe("listConversations / findConversation last-message sinceTime", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
    mocks.repo.findLastByConversation.mockResolvedValue([])
    mocks.repo.findLastByConversations.mockResolvedValue(new Map())
    mocks.buildConversationWhere.mockReturnValue({})
  })

  test("anchors each conversation's sinceTime on its own lastActivityAt, not a shared contactInbox anchor", async () => {
    // Same contact, same shared ContactInbox (its lastMessageAt would reflect
    // whichever conversation was most recently active — irrelevant here since
    // the fix no longer reads it at all), but two conversations with
    // different lastActivityAt: an older comment thread and a newer DM.
    const sharedContactInbox = {
      id: "ci-1",
      contactId: "contact-1",
      lastMessageAt: new Date("2026-06-10T00:00:00Z"),
    }
    const olderCommentConversation = {
      id: "conv-comment",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [sharedContactInbox],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }
    const newerDmConversation = {
      id: "conv-dm",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-06-10T00:00:00Z"),
      contactInboxes: [sharedContactInbox],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }
    mocks.findManyQuery.mockResolvedValue([
      olderCommentConversation,
      newerDmConversation,
    ])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    // One batched read for the whole page, each row keeping its own window.
    expect(mocks.repo.findLastByConversations).toHaveBeenCalledTimes(1)
    expect(mocks.repo.findLastByConversations).toHaveBeenCalledWith(
      [
        {
          conversationId: "conv-comment",
          sinceTime: olderCommentConversation.lastActivityAt,
        },
        {
          conversationId: "conv-dm",
          sinceTime: newerDmConversation.lastActivityAt,
        },
      ],
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
    expect(mocks.repo.findLastByConversation).not.toHaveBeenCalled()
  })

  test("reads a full page of last messages in ONE repository call, not one per conversation", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `conv-${index}`,
      contactId: `contact-${index}`,
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }))
    mocks.findManyQuery.mockResolvedValue(rows)

    await listConversations(
      { workspaceId: "ws-1", perPage: 100 },
      { includeEmailAndPhone: true },
    )

    expect(mocks.repo.findLastByConversations).toHaveBeenCalledTimes(1)
    expect(mocks.repo.findLastByConversations.mock.calls[0]?.[0]).toHaveLength(
      100,
    )
    expect(mocks.repo.findLastByConversation).not.toHaveBeenCalled()
  })

  test("a conversation without lastActivityAt falls back to a full-history window", async () => {
    mocks.findManyQuery.mockResolvedValue([
      {
        id: "conv-imported",
        contactId: "contact-1",
        lastActivityAt: null,
        contactInboxes: [],
        contact: null,
        assignedUser: null,
        assignedInboxTeam: null,
        conversationParticipants: [],
      },
    ])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(mocks.repo.findLastByConversations).toHaveBeenCalledWith(
      [{ conversationId: "conv-imported", sinceTime: new Date(0) }],
      expect.anything(),
    )
  })

  test("an empty page still answers with an empty list", async () => {
    mocks.findManyQuery.mockResolvedValue([])

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(result.data).toEqual([])
  })

  test("findConversation anchors sinceTime on the conversation's own lastActivityAt", async () => {
    const conversation = {
      id: "conv-comment",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      conversationParticipants: [],
      contactInboxes: [
        {
          id: "ci-1",
          contactId: "contact-1",
          lastMessageAt: new Date("2026-06-10T00:00:00Z"),
        },
      ],
    }
    mocks.findWithFullRelations.mockResolvedValue(conversation)

    await findConversation({ id: "conv-comment", workspaceId: "ws-1" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-comment",
      expect.objectContaining({
        sinceTime: endOfHour(conversation.lastActivityAt),
      }),
    )
  })
})

describe("listConversations / findConversation attachment count", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
    mocks.repo.findLastByConversation.mockResolvedValue([])
    mocks.repo.findLastByConversations.mockResolvedValue(new Map())
    mocks.buildConversationWhere.mockReturnValue({})
  })

  test("listConversations requests attachmentCountOnly instead of full attachment rows", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }
    mocks.findManyQuery.mockResolvedValue([conversation])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(mocks.repo.findLastByConversations).toHaveBeenCalledWith(
      [expect.objectContaining({ conversationId: "conv-1" })],
      expect.objectContaining({ attachmentCountOnly: true }),
    )
    expect(mocks.repo.findLastByConversations).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ withAttachments: true }),
    )
  })

  test("listConversations loads the assigned user without the secret column", async () => {
    mocks.findManyQuery.mockResolvedValue([])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(mocks.findManyQuery.mock.calls[0]?.[0]?.with.assignedUser).toEqual({
      columns: { connectionAuthorizations: false },
    })
  })

  describe("recentParticipants", () => {
    const repliedAt = new Date("2026-11-20T10:00:00Z")
    const participant = (userId: string, overrides = {}) => ({
      userId,
      lastRepliedAt: repliedAt,
      user: {
        id: userId,
        name: `Name ${userId}`,
        image: null,
      },
      ...overrides,
    })
    const row = (conversationParticipants: unknown[]) => ({
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants,
    })

    test("listConversations loads the shared preview relation in the same statement", async () => {
      mocks.findManyQuery.mockResolvedValue([])

      await listConversations(
        { workspaceId: "ws-1" },
        { includeEmailAndPhone: true },
      )

      expect(
        mocks.findManyQuery.mock.calls[0]?.[0]?.with.conversationParticipants,
      ).toEqual({ limit: 3 })
    })

    test("maps the relation to a flat recentParticipants list and drops the raw key", async () => {
      mocks.findManyQuery.mockResolvedValue([
        row([participant("u-1"), participant("u-2")]),
      ])

      const result = await listConversations(
        { workspaceId: "ws-1" },
        { includeEmailAndPhone: true },
      )

      expect(result.data[0]?.recentParticipants).toEqual([
        {
          userId: "u-1",
          name: "Name u-1",
          image: null,
          lastRepliedAt: repliedAt,
        },
        {
          userId: "u-2",
          name: "Name u-2",
          image: null,
          lastRepliedAt: repliedAt,
        },
      ])
      expect(result.data[0]).not.toHaveProperty("conversationParticipants")
    })

    test("the compact view carries the same recentParticipants", async () => {
      mocks.findManyQuery.mockResolvedValue([row([participant("u-1")])])

      const result = await listConversations(
        { workspaceId: "ws-1" },
        { includeEmailAndPhone: true, view: "compact" },
      )

      expect(result.data[0]?.recentParticipants).toHaveLength(1)
    })

    test("a conversation nobody replied in has an empty list", async () => {
      mocks.findManyQuery.mockResolvedValue([row([])])

      const result = await listConversations(
        { workspaceId: "ws-1" },
        { includeEmailAndPhone: true },
      )

      expect(result.data[0]?.recentParticipants).toEqual([])
    })

    test("skips a row without its member or reply time", async () => {
      mocks.findManyQuery.mockResolvedValue([
        row([
          participant("u-1", { user: null }),
          participant("u-2", { lastRepliedAt: null }),
          participant("u-3"),
        ]),
      ])

      const result = await listConversations(
        { workspaceId: "ws-1" },
        { includeEmailAndPhone: true },
      )

      expect(result.data[0]?.recentParticipants.map((p) => p.userId)).toEqual([
        "u-3",
      ])
    })

    test("findConversation returns recentParticipants too", async () => {
      mocks.findWithFullRelations.mockResolvedValue({
        ...row([participant("u-1")]),
        contact: null,
      })

      const result = await findConversation({
        id: "conv-1",
        workspaceId: "ws-1",
      })

      expect(result.data.recentParticipants.map((p) => p.userId)).toEqual([
        "u-1",
      ])
      expect(result.data).not.toHaveProperty("conversationParticipants")
    })
  })

  test("findConversation requests attachmentCountOnly instead of full attachment rows", async () => {
    const conversation = {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      conversationParticipants: [],
    }
    mocks.findWithFullRelations.mockResolvedValue(conversation)

    await findConversation({ id: "conv-1", workspaceId: "ws-1" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ attachmentCountOnly: true }),
    )
    expect(mocks.repo.findLastByConversation).not.toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ withAttachments: true }),
    )
  })

  test("propagates attachmentCount from the repository into the response", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }
    mocks.findManyQuery.mockResolvedValue([conversation])
    mocks.repo.findLastByConversations.mockResolvedValue(
      new Map([
        [
          "conv-1",
          { id: "msg-1", text: "", attachmentCount: 2, attachments: [] },
        ],
      ]),
    )

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(result.data[0]?.messages[0]?.attachmentCount).toBe(2)
  })

  test("a conversation the batch found no message for gets an empty messages list", async () => {
    mocks.findManyQuery.mockResolvedValue([
      {
        id: "conv-1",
        contactId: "contact-1",
        lastActivityAt: new Date("2026-01-01T00:00:00Z"),
        contactInboxes: [],
        contact: null,
        assignedUser: null,
        assignedInboxTeam: null,
        conversationParticipants: [],
      },
    ])
    mocks.repo.findLastByConversations.mockResolvedValue(
      new Map([["conv-1", null]]),
    )

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, view: "compact" },
    )

    expect(result.data[0]?.messages).toEqual([])
  })

  test("returns a proxy avatar URL for a contact whose newest capable inbox is pending", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [
        {
          id: "ci-old",
          channel: "messenger",
          lastMessageAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "ci-new",
          channel: "instagram",
          lastMessageAt: new Date("2026-02-01T00:00:00Z"),
        },
      ],
      contact: { id: "contact-1", avatar: null },
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }
    mocks.findManyQuery.mockResolvedValue([conversation])

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(result.data[0]?.contact?.avatar).toBe(
      "https://app.example.com/media/avatar/ci-new",
    )
    expect(mocks.resolveContactAvatarUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contact: conversation.contact,
        contactInboxes: conversation.contactInboxes,
      }),
      expect.any(Function),
    )
  })

  test("keeps a mirrored contact avatar's raw storage key unchanged", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [
        {
          id: "ci-1",
          channel: "messenger",
          lastMessageAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      contact: { id: "contact-1", avatar: "avatars/contact-1.png" },
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }
    mocks.findManyQuery.mockResolvedValue([conversation])

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(result.data[0]?.contact?.avatar).toBe("avatars/contact-1.png")
  })

  test("returns null for a WhatsApp contact without an avatar or contact inbox", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      contact: { id: "contact-1", avatar: null },
      assignedUser: null,
      assignedInboxTeam: null,
      conversationParticipants: [],
    }
    mocks.findManyQuery.mockResolvedValue([conversation])
    mocks.resolveContactAvatarUrl.mockResolvedValueOnce(null)

    const result = await listConversations(
      { workspaceId: "ws-1", channel: "whatsapp" },
      { includeEmailAndPhone: true },
    )

    expect(result.data[0]?.contact?.avatar).toBeNull()
  })

  test("publicUrls returns a stored avatar key as an absolute URL", async () => {
    mocks.findManyQuery.mockResolvedValue([
      {
        id: "conv-1",
        contactId: "contact-1",
        lastActivityAt: new Date("2026-01-01T00:00:00Z"),
        contactInboxes: [],
        contact: { id: "contact-1", avatar: "avatars/contact-1.png" },
        assignedUser: null,
        assignedInboxTeam: null,
        conversationParticipants: [],
      },
    ])

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, publicUrls: true },
    )

    expect(result.data[0]?.contact?.avatar).toBe(
      "https://cdn.example.com/avatars/contact-1.png",
    )
  })

  const conversationRow = (
    id: string,
    contact: { id: string; avatar: string | null },
  ) => ({
    id,
    contactId: contact.id,
    lastActivityAt: new Date("2026-01-01T00:00:00Z"),
    contactInboxes: [],
    contact,
    assignedUser: null,
    assignedInboxTeam: null,
    conversationParticipants: [],
  })

  test("publicUrls reads tenant settings once for the whole page, not per row", async () => {
    mocks.findManyQuery.mockResolvedValue([
      conversationRow("conv-1", { id: "contact-1", avatar: "a/1.png" }),
      conversationRow("conv-2", { id: "contact-2", avatar: "a/2.png" }),
      conversationRow("conv-3", { id: "contact-3", avatar: "a/3.png" }),
    ])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, publicUrls: true },
    )

    expect(mocks.resolveTenantSettings).toHaveBeenCalledTimes(1)
  })

  test("without publicUrls tenant settings are never read", async () => {
    mocks.findManyQuery.mockResolvedValue([
      conversationRow("conv-1", { id: "contact-1", avatar: "a/1.png" }),
    ])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true },
    )

    expect(mocks.resolveTenantSettings).not.toHaveBeenCalled()
  })

  test("publicUrls on an empty page does not read tenant settings", async () => {
    mocks.findManyQuery.mockResolvedValue([])

    await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, publicUrls: true },
    )

    expect(mocks.resolveTenantSettings).not.toHaveBeenCalled()
  })

  test("resolves one contact's avatar once when it appears in several conversations", async () => {
    const contact = { id: "contact-1", avatar: "a/1.png" }
    mocks.findManyQuery.mockResolvedValue([
      conversationRow("conv-dm", contact),
      conversationRow("conv-comment-1", contact),
      conversationRow("conv-comment-2", contact),
    ])

    const result = await listConversations(
      { workspaceId: "ws-1" },
      { includeEmailAndPhone: true, publicUrls: true },
    )

    expect(mocks.resolveContactAvatarUrl).toHaveBeenCalledTimes(1)
    expect(result.data.map((c) => c.contact?.avatar)).toEqual([
      "https://cdn.example.com/a/1.png",
      "https://cdn.example.com/a/1.png",
      "https://cdn.example.com/a/1.png",
    ])
  })

  test("findConversation with publicUrls returns an absolute avatar URL", async () => {
    mocks.findWithFullRelations.mockResolvedValue({
      id: "conv-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      contact: { id: "contact-1", avatar: "avatars/contact-1.png" },
      conversationParticipants: [],
    })

    const result = await findConversation(
      { id: "conv-1", workspaceId: "ws-1" },
      { publicUrls: true },
    )

    expect(result.data.contact?.avatar).toBe(
      "https://cdn.example.com/avatars/contact-1.png",
    )
  })
})
