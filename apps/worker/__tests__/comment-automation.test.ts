import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockFindContactInboxBy,
  mockFindActiveAutomations,
  mockIsWithinSchedule,
  mockFindDedup,
  mockInsertDedup,
  mockIncrementRepliesCount,
  mockGetPriorContactInboxCount,
  mockHasRepliedOnOtherPost,
  mockWorkspaceFindById,
  mockIsActiveNow,
  mockAiAgentFindBy,
  mockConversationFindBy,
  mockIdentifyInboxAndIntegrationAuth,
  mockCreateMessageRepository,
  mockMessageCreate,
  mockIntegrationQueueAdd,
  mockChatQueueAdd,
  mockSendPrivateReply,
  mockSendInstagramPrivateReply,
  mockSendInstagramFacebookPrivateReply,
  mockGenerateAIReplyText,
  mockLoggerInfo,
  mockLoggerWarn,
  mockContactVariableGetAll,
  mockContactVariableReplaceAll,
} = vi.hoisted(() => ({
  mockFindContactInboxBy: vi.fn(),
  mockFindActiveAutomations: vi.fn(),
  mockIsWithinSchedule: vi.fn(),
  mockFindDedup: vi.fn(),
  mockInsertDedup: vi.fn(),
  mockIncrementRepliesCount: vi.fn(),
  mockGetPriorContactInboxCount: vi.fn(),
  mockHasRepliedOnOtherPost: vi.fn(),
  mockWorkspaceFindById: vi.fn(),
  mockIsActiveNow: vi.fn(),
  mockAiAgentFindBy: vi.fn(),
  mockConversationFindBy: vi.fn(),
  mockIdentifyInboxAndIntegrationAuth: vi.fn(),
  mockCreateMessageRepository: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockIntegrationQueueAdd: vi.fn(),
  mockChatQueueAdd: vi.fn(),
  mockSendPrivateReply: vi.fn(),
  mockSendInstagramPrivateReply: vi.fn(),
  mockSendInstagramFacebookPrivateReply: vi.fn(),
  mockGenerateAIReplyText: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockContactVariableGetAll: vi.fn(),
  mockContactVariableReplaceAll: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: vi.fn().mockResolvedValue(undefined),
  contactInboxService: { findBy: mockFindContactInboxBy },
  aiAgentService: { findBy: mockAiAgentFindBy },
  conversationService: { findBy: mockConversationFindBy },
  fbCommentAutomationService: {
    findActiveAutomations: mockFindActiveAutomations,
    isWithinSchedule: mockIsWithinSchedule,
    findDedup: mockFindDedup,
    insertDedup: mockInsertDedup,
    incrementRepliesCount: mockIncrementRepliesCount,
    getPriorContactInboxCount: mockGetPriorContactInboxCount,
    hasRepliedOnOtherPost: mockHasRepliedOnOtherPost,
  },
  workspaceService: {
    findById: mockWorkspaceFindById,
    isActiveNow: mockIsActiveNow,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  sendPrivateReply: mockSendPrivateReply,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  sendPrivateReply: mockSendInstagramPrivateReply,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  sendPrivateReply: mockSendInstagramFacebookPrivateReply,
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: mockContactVariableGetAll,
    replaceAll: mockContactVariableReplaceAll,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    changeChannelMessageState: "changeChannelMessageState",
    sendChannelMessage: "sendChannelMessage",
  },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: {
    processCommentAutomation: "processCommentAutomation",
    commentAIReply: "commentAIReply",
    sendFlow: "sendFlow",
  },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    debug: vi.fn(),
  },
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier:
      mockIdentifyInboxAndIntegrationAuth,
  },
}))

vi.mock(
  "../src/integration/handlers/comment-automation/comment-attachment",
  () => ({
    createAttachmentInfoResolver: vi
      .fn()
      .mockReturnValue(
        vi.fn().mockResolvedValue({ hasImage: false, hasVideo: false }),
      ),
    needsAttachmentInfo: vi.fn().mockReturnValue(false),
  }),
)

vi.mock("../src/integration/handlers/automated-response/replies", () => ({
  generateAIReplyText: mockGenerateAIReplyText,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { isCommentReply, processCommentAutomation } = await import(
  "../src/integration/handlers/comment-automation"
)
const { processCommentAIReply } = await import(
  "../src/integration/handlers/comment-automation/ai-reply"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE_ID = "2094067177305463"
const STORY_ID = "2357494887629356"
const POST_ID = `${PAGE_ID}_${STORY_ID}`
const COMMENT_ID = `${STORY_ID}_1544045903933592`
const OTHER_COMMENT_ID = `${STORY_ID}_9999999999999999`

type AutomationOverrides = {
  options?: Record<string, boolean>
  post?: { type: string; value: string[] }
  publicReply?: { type: string; value: string | null }
  privateReply?: { type: string; value: string | null }
  hideComments?: Record<string, unknown>
}

function buildAutomation(overrides: AutomationOverrides = {}) {
  return {
    id: "automation-1",
    post: overrides.post ?? { type: "all", value: [] },
    includeKeywords: { type: "all", value: [] },
    excludeKeywords: [],
    publicReply: overrides.publicReply ?? { type: "none", value: null },
    privateReply: overrides.privateReply ?? { type: "none", value: null },
    options: {
      replyToNewContactsOnly: false,
      replyOncePerUserPerPost: false,
      likeUserComment: false,
      replyToUsersWhoCommentedOnOtherPosts: true,
      ignoreCommentReplies: true,
      trackUserTags: false,
      ...overrides.options,
    },
    hideComments: {
      all: false,
      hasPhoneNumber: false,
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      hasKeywords: false,
      keywords: [],
      showCommentsAfter: "none",
      ...overrides.hideComments,
    },
    replyAfter: { type: "immediately", value: 0 },
  }
}

function buildJobData(
  overrides: { parentId?: string; postId?: string; message?: string } = {},
) {
  return {
    integrationType: "messenger",
    integrationIdentifier: PAGE_ID,
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    commentId: COMMENT_ID,
    postId: overrides.postId ?? POST_ID,
    parentId: overrides.parentId,
    fromId: "user-1",
    message: overrides.message ?? "2",
    createdTime: 1_783_674_105,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIdentifyInboxAndIntegrationAuth.mockResolvedValue({
    integrationRow: { auth: { accessToken: "token" } },
  })
  mockFindContactInboxBy.mockResolvedValue({
    id: "contact-inbox-1",
    contactId: "contact-1",
  })
  mockWorkspaceFindById.mockResolvedValue({ timezone: "UTC" })
  mockIsActiveNow.mockReturnValue(true)
  mockConversationFindBy.mockResolvedValue({
    id: "conversation-1",
    workspaceId: "workspace-1",
    contactId: "contact-1",
  })
  mockIsWithinSchedule.mockReturnValue(true)
  mockHasRepliedOnOtherPost.mockResolvedValue(false)
  mockMessageCreate.mockResolvedValue({
    id: "message-1",
    createdAt: new Date("2026-07-10T00:00:00Z"),
  })
  mockCreateMessageRepository.mockResolvedValue({
    findBySourceId: vi.fn().mockResolvedValue(null),
    create: mockMessageCreate,
  })
  mockInsertDedup.mockResolvedValue(undefined)
  mockChatQueueAdd.mockResolvedValue(undefined)
  mockIntegrationQueueAdd.mockResolvedValue(undefined)
  mockContactVariableGetAll.mockResolvedValue({})
  mockContactVariableReplaceAll.mockImplementation(({ text }) => text)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isCommentReply", () => {
  test("top-level comment: parentId equals postId", () => {
    expect(isCommentReply(POST_ID, POST_ID)).toBe(false)
  })

  test("reply: parentId is another comment id", () => {
    expect(isCommentReply(OTHER_COMMENT_ID, POST_ID)).toBe(true)
  })

  test("no parentId", () => {
    expect(isCommentReply(undefined, POST_ID)).toBe(false)
  })
})

describe("processCommentAutomation reply filtering", () => {
  test("runs the automation for a top-level comment whose parentId equals postId (production Facebook payload)", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(buildJobData({ parentId: POST_ID }) as any)

    expect(mockInsertDedup).toHaveBeenCalledWith({
      automationId: "automation-1",
      contactId: "contact-1",
      postId: POST_ID,
      workspaceId: "workspace-1",
    })
  })

  test("skips a real comment reply when ignoreCommentReplies is on", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(
      buildJobData({ parentId: OTHER_COMMENT_ID }) as any,
    )

    expect(mockInsertDedup).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "comment is a reply" }),
      "Comment automation skipped",
    )
  })

  test("runs the automation for a real comment reply when ignoreCommentReplies is off", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ options: { ignoreCommentReplies: false } }),
    ])

    await processCommentAutomation(
      buildJobData({ parentId: OTHER_COMMENT_ID }) as any,
    )

    expect(mockInsertDedup).toHaveBeenCalled()
  })

  test("runs the automation when the payload has no parentId", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).toHaveBeenCalled()
  })
})

describe("processCommentAutomation matchPost normalization", () => {
  test("matches a reel stored as a bare id against the composite webhook post_id", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ post: { type: "postIds", value: [STORY_ID] } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).toHaveBeenCalled()
  })

  test("matches a manually entered id missing the pageId prefix", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ post: { type: "postIds", value: [STORY_ID] } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).toHaveBeenCalled()
  })

  test("does not match a different post", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ post: { type: "postIds", value: ["8888888888"] } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "post does not match" }),
      "Comment automation skipped",
    )
  })
})

describe("processCommentAutomation replyToUsersWhoCommentedOnOtherPosts", () => {
  test("skips when option is off and the user was replied on another post", async () => {
    mockHasRepliedOnOtherPost.mockResolvedValue(true)
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        options: { replyToUsersWhoCommentedOnOtherPosts: false },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "user already engaged on another post",
      }),
      "Comment automation skipped",
    )
  })

  test("runs when option is off but the user has not been replied elsewhere", async () => {
    mockHasRepliedOnOtherPost.mockResolvedValue(false)
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        options: { replyToUsersWhoCommentedOnOtherPosts: false },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).toHaveBeenCalled()
  })

  test("does not query when option is on (default)", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(buildJobData() as any)

    expect(mockHasRepliedOnOtherPost).not.toHaveBeenCalled()
  })
})

describe("processCommentAutomation AIAgent reply", () => {
  test("public AIAgent enqueues a commentAIReply job with the selected agent + channel", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "AIAgent", value: "agent-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "commentAIReply",
      expect.objectContaining({
        type: "commentAIReply",
        data: expect.objectContaining({
          agentId: "agent-1",
          replyChannel: "public",
          commentId: COMMENT_ID,
        }),
      }),
      expect.anything(),
    )
    // no more silent sendFlow-without-flowId
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalledWith(
      "sendFlow",
      expect.anything(),
      expect.anything(),
    )
  })

  test("private AIAgent enqueues a commentAIReply job on the private channel", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "AIAgent", value: "agent-9" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "commentAIReply",
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: "agent-9",
          replyChannel: "private",
        }),
      }),
      expect.anything(),
    )
  })

  test("AIAgent with an empty value does not dispatch or count", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "AIAgent", value: null } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalledWith(
      "commentAIReply",
      expect.anything(),
      expect.anything(),
    )
    expect(mockIncrementRepliesCount).not.toHaveBeenCalled()
  })
})

describe("processCommentAutomation text private reply channel routing", () => {
  test("instagram sends the DM through the Instagram Login sendPrivateReply endpoint", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "text", value: "Hi from IG" } }),
    ])

    await processCommentAutomation({
      ...buildJobData(),
      integrationType: "instagram",
    } as any)

    expect(mockSendInstagramPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "Hi from IG",
    )
    // The Messenger private-reply endpoint must not be used for Instagram.
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
  })

  test("messenger still routes the text DM through the Messenger endpoint", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "text", value: "Hi from FB" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "Hi from FB",
    )
    expect(mockSendInstagramPrivateReply).not.toHaveBeenCalled()
  })

  test("instagramFacebook sends the DM through the Instagram-via-Facebook sendPrivateReply endpoint", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        privateReply: { type: "text", value: "Hi from IG-FB" },
      }),
    ])

    await processCommentAutomation({
      ...buildJobData(),
      integrationType: "instagramFacebook",
    } as any)

    expect(mockSendInstagramFacebookPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "Hi from IG-FB",
    )
    // Neither the Messenger nor the Instagram Login endpoint must be used.
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
    expect(mockSendInstagramPrivateReply).not.toHaveBeenCalled()
  })
})

describe("processCommentAutomation text reply variable resolution", () => {
  test("private reply text is resolved through contactVariableService before sending", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        privateReply: { type: "text", value: "Hi {{contact.firstName}}" },
      }),
    ])
    mockContactVariableReplaceAll.mockResolvedValue("Hi Jane")

    await processCommentAutomation(buildJobData() as any)

    expect(mockContactVariableGetAll).toHaveBeenCalledWith({
      contactId: "contact-1",
      contactInbox: { id: "contact-inbox-1", contactId: "contact-1" },
    })
    expect(mockContactVariableReplaceAll).toHaveBeenCalledWith({
      text: "Hi {{contact.firstName}}",
      variables: {},
    })
    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "Hi Jane",
    )
  })

  test("public reply text is resolved through contactVariableService before the outgoing message is created", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "Hi {{contact.firstName}}" },
      }),
    ])
    mockContactVariableReplaceAll.mockResolvedValue("Hi Jane")

    await processCommentAutomation(buildJobData() as any)

    expect(mockContactVariableGetAll).toHaveBeenCalledWith({
      contactId: "contact-1",
      contactInbox: { id: "contact-inbox-1", contactId: "contact-1" },
    })
    expect(mockContactVariableReplaceAll).toHaveBeenCalledWith({
      text: "Hi {{contact.firstName}}",
      variables: {},
    })
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hi Jane" }),
    )
  })

  test("private reply falls back to the raw text when variable resolution fails", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        privateReply: { type: "text", value: "Hi {{contact.firstName}}" },
      }),
    ])
    mockContactVariableReplaceAll.mockRejectedValue(new Error("db down"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "Hi {{contact.firstName}}",
    )
  })

  test("public reply falls back to the raw text when variable resolution fails", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "Hi {{contact.firstName}}" },
      }),
    ])
    mockContactVariableGetAll.mockRejectedValue(new Error("db down"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hi {{contact.firstName}}" }),
    )
  })
})

describe("processCommentAutomation flow private reply", () => {
  test("messenger: enqueues a sendFlow job carrying commentAnchor with the triggering commentId", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "flow", value: "flow-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        type: "sendFlow",
        data: expect.objectContaining({
          flowId: "flow-1",
          commentAnchor: { commentId: COMMENT_ID, replyChannel: "private" },
        }),
      }),
      expect.anything(),
    )
  })

  test("instagram: enqueues sendFlow without a commentAnchor (no private_replies API)", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "flow", value: "flow-1" } }),
    ])

    await processCommentAutomation({
      ...buildJobData(),
      integrationType: "instagram",
    } as any)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.not.objectContaining({ commentAnchor: expect.anything() }),
      }),
      expect.anything(),
    )
  })
})

describe("processCommentAutomation flow public reply", () => {
  test("messenger: enqueues a sendFlow job carrying a public commentAnchor with the triggering commentId", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "flow", value: "flow-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        type: "sendFlow",
        data: expect.objectContaining({
          flowId: "flow-1",
          commentAnchor: { commentId: COMMENT_ID, replyChannel: "public" },
        }),
      }),
      expect.anything(),
    )
  })

  test("instagram: ALSO enqueues a public commentAnchor (no channelType gate, unlike private)", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "flow", value: "flow-1" } }),
    ])

    await processCommentAutomation({
      ...buildJobData(),
      integrationType: "instagram",
    } as any)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({
          commentAnchor: { commentId: COMMENT_ID, replyChannel: "public" },
        }),
      }),
      expect.anything(),
    )
  })
})

describe("processCommentAIReply", () => {
  beforeEach(() => {
    mockAiAgentFindBy.mockResolvedValue({ id: "agent-1", prompt: "hi" })
    mockGenerateAIReplyText.mockResolvedValue({
      text: "AI answer",
      provider: "openai",
      modelId: "gpt",
    })
  })

  function buildAIJobData(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      integrationType: "messenger",
      integrationIdentifier: PAGE_ID,
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      commentId: COMMENT_ID,
      agentId: "agent-1",
      replyChannel: "public" as const,
      channelType: "messenger" as const,
      message: "hello",
      parentMessageId: null,
      parentMessageCreatedAt: null,
      ...overrides,
    }
  }

  test("public: posts an AI-generated public comment reply", async () => {
    await processCommentAIReply(buildAIJobData() as any)

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "comment",
        text: "AI answer",
        contentAttributes: { replyToCommentId: COMMENT_ID },
      }),
    )
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "sendChannelMessage",
      expect.objectContaining({ type: "sendChannelMessage" }),
    )
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
  })

  test("private (messenger): sends an AI-generated DM", async () => {
    await processCommentAIReply(
      buildAIJobData({ replyChannel: "private" }) as any,
    )

    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "AI answer",
    )
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
  })

  test("image-only comment (no message) does not generate or send", async () => {
    await processCommentAIReply(buildAIJobData({ message: "" }) as any)

    expect(mockGenerateAIReplyText).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
  })

  test("missing agent logs a warning and does not send", async () => {
    mockAiAgentFindBy.mockResolvedValue(undefined)

    await processCommentAIReply(buildAIJobData() as any)

    expect(mockGenerateAIReplyText).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
    expect(mockLoggerWarn).toHaveBeenCalled()
  })

  test("no generated text does not send", async () => {
    mockGenerateAIReplyText.mockResolvedValue(null)

    await processCommentAIReply(buildAIJobData() as any)

    expect(mockChatQueueAdd).not.toHaveBeenCalled()
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
  })

  test("workspace outside active hours logs and does not send", async () => {
    mockIsActiveNow.mockReturnValue(false)

    await processCommentAIReply(buildAIJobData() as any)

    expect(mockGenerateAIReplyText).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: COMMENT_ID }),
      "comment AI reply skipped: workspace outside active hours",
    )
  })

  test("missing conversation logs a warning and does not send", async () => {
    mockConversationFindBy.mockResolvedValue(undefined)

    await processCommentAIReply(buildAIJobData() as any)

    expect(mockGenerateAIReplyText).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conversation-1" }),
      "comment AI reply skipped: conversation not found",
    )
  })

  test("passes the full conversation through to generateAIReplyText", async () => {
    await processCommentAIReply(buildAIJobData() as any)

    expect(mockGenerateAIReplyText).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: {
          id: "conversation-1",
          workspaceId: "workspace-1",
          contactId: "contact-1",
        },
      }),
    )
  })
})

describe("applyHideComments case-insensitivity", () => {
  test("hides a comment matching a keyword regardless of case", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        hideComments: { hasKeywords: true, keywords: ["SPAM"] },
      }),
    ])
    // hide only runs when the incoming comment DB message exists
    mockCreateMessageRepository.mockResolvedValue({
      findBySourceId: vi.fn().mockResolvedValue({
        id: "message-1",
        createdAt: new Date("2026-07-10T00:00:00Z"),
      }),
      create: mockMessageCreate,
    })

    await processCommentAutomation(
      buildJobData({ message: "this is spam" }) as any,
    )

    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "changeChannelMessageState",
      expect.objectContaining({
        type: "changeChannelMessageState",
        data: expect.objectContaining({ hidden: true }),
      }),
    )
  })
})

describe("applyHideComments link detection", () => {
  async function runWithMessage(message: string) {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ hideComments: { hasLink: true } }),
    ])
    mockCreateMessageRepository.mockResolvedValue({
      findBySourceId: vi.fn().mockResolvedValue({
        id: "message-1",
        createdAt: new Date("2026-07-10T00:00:00Z"),
      }),
      create: mockMessageCreate,
    })

    await processCommentAutomation(buildJobData({ message }) as any)
  }

  test("hides a bare domain with no scheme", async () => {
    await runWithMessage("check out yahoo.com for more")

    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "changeChannelMessageState",
      expect.objectContaining({
        data: expect.objectContaining({ hidden: true }),
      }),
    )
  })

  test("does not hide a run-on sentence with a capitalized continuation word", async () => {
    await runWithMessage("Cam on ban.Shop co ship khong a")

    expect(mockChatQueueAdd).not.toHaveBeenCalledWith(
      "changeChannelMessageState",
      expect.anything(),
    )
  })
})
