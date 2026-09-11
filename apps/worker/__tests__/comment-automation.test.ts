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
  mockDeleteDedup,
  mockIncrementRepliesCount,
  mockGetPriorContactInboxCount,
  mockHasRepliedOnOtherPost,
  mockWorkspaceFindById,
  mockIsActiveNow,
  mockAiAgentFindBy,
  mockConversationFindBy,
  mockConversationFindDMByContact,
  mockConversationFindOrCreate,
  mockIdentifyInboxAndIntegrationAuth,
  mockCreateMessageRepository,
  mockMessageCreate,
  mockAiAgentQueueAdd,
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
  mockDeleteDedup: vi.fn(),
  mockIncrementRepliesCount: vi.fn(),
  mockGetPriorContactInboxCount: vi.fn(),
  mockHasRepliedOnOtherPost: vi.fn(),
  mockWorkspaceFindById: vi.fn(),
  mockIsActiveNow: vi.fn(),
  mockAiAgentFindBy: vi.fn(),
  mockConversationFindBy: vi.fn(),
  mockConversationFindDMByContact: vi.fn(),
  mockConversationFindOrCreate: vi.fn(),
  mockIdentifyInboxAndIntegrationAuth: vi.fn(),
  mockCreateMessageRepository: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockAiAgentQueueAdd: vi.fn(),
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

const mockLogProviderError = vi.fn().mockResolvedValue(undefined)
const mockFlowFindBy = vi
  .fn()
  .mockResolvedValue({ id: "flow-1", name: "Flow 1" })
const mockRecordEvent = vi.fn().mockResolvedValue(undefined)
const mockSettleEvent = vi.fn().mockResolvedValue(undefined)
const mockDiscardEvent = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService: {
    recordEvent: mockRecordEvent,
    settleEvent: mockSettleEvent,
    discardEvent: mockDiscardEvent,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: vi.fn().mockResolvedValue(undefined),
  logProviderError: mockLogProviderError,
  flowService: { findBy: mockFlowFindBy },
  contactInboxService: { findBy: mockFindContactInboxBy },
  aiAgentService: { findBy: mockAiAgentFindBy },
  conversationService: {
    findBy: mockConversationFindBy,
    findDMByContact: mockConversationFindDMByContact,
    findOrCreate: mockConversationFindOrCreate,
  },
  fbCommentAutomationService: {
    findActiveAutomations: mockFindActiveAutomations,
    isWithinSchedule: mockIsWithinSchedule,
    findDedup: mockFindDedup,
    insertDedup: mockInsertDedup,
    deleteDedup: mockDeleteDedup,
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
  AIJobAction: {
    commentAIReply: "commentAIReply",
  },
  aiAgentQueue: { add: mockAiAgentQueueAdd },
  ChatJobAction: {
    changeChannelMessageState: "changeChannelMessageState",
    sendChannelMessage: "sendChannelMessage",
  },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: {
    processCommentAutomation: "processCommentAutomation",
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
const { IntegrationNotFoundError } = await import(
  "../src/services/orphaned-integration-cleanup"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE_ID = "2094067177305463"
const STORY_ID = "2357494887629356"
const POST_ID = `${PAGE_ID}_${STORY_ID}`
const COMMENT_ID = `${STORY_ID}_1544045903933592`
const OTHER_COMMENT_ID = `${STORY_ID}_9999999999999999`

// Ids captured from production `feed` webhooks on one Page (2026-09-11). The
// shape of `parent_id` differs per post type and is the whole reason
// `isCommentReply` cannot compare it to `post_id` verbatim, so these are kept
// verbatim rather than reduced to a synthetic pattern.
const REAL_PAGE_ID = "698869923319232"
const PHOTO_STORY_ID = "122101949313003083"
const PHOTO_POST_ID = `${REAL_PAGE_ID}_${PHOTO_STORY_ID}`
const PHOTO_ALBUM_PARENT_ID = `39455509950714790_${PHOTO_STORY_ID}`
const PHOTO_COMMENT_ID = `${PHOTO_STORY_ID}_1777723936764611`
const PHOTO_REPLY_COMMENT_ID = `${PHOTO_STORY_ID}_1828228944833185`
const REEL_STORY_ID = "122151505431003083"
const REEL_POST_ID = `${REAL_PAGE_ID}_${REEL_STORY_ID}`
const REEL_COMMENT_ID = `${REEL_STORY_ID}_1779826613208365`

type AutomationOverrides = {
  id?: string
  options?: Record<string, boolean>
  post?: { type: string; value: string[] }
  publicReply?: { type: string; value: string | null }
  privateReply?: { type: string; value: string | null }
  hideComments?: Record<string, unknown>
  replyAfter?: { type: string; value: number }
}

function buildAutomation(overrides: AutomationOverrides = {}) {
  return {
    id: overrides.id ?? "automation-1",
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
    replyAfter: overrides.replyAfter ?? { type: "immediately", value: 0 },
  }
}

const ONE_DAY_SECONDS = 24 * 60 * 60

function buildJobData(
  overrides: {
    parentId?: string
    postId?: string
    message?: string
    createdTime?: number
  } = {},
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
    // A fresh comment by default: private replies are gated by Meta's 7-day
    // comment_id window, so a hardcoded past timestamp would silently turn
    // every private-reply case into a skip as the fixture ages.
    createdTime: overrides.createdTime ?? Math.floor(Date.now() / 1000) - 60,
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
    channel: "messenger",
  })
  mockWorkspaceFindById.mockResolvedValue({ timezone: "UTC" })
  mockIsActiveNow.mockReturnValue(true)
  mockConversationFindBy.mockResolvedValue({
    id: "conversation-1",
    workspaceId: "workspace-1",
    contactId: "contact-1",
  })
  // The DM conversation (sourceId IS NULL), distinct from the comment-anchored
  // "conversation-1" the job carries.
  mockConversationFindDMByContact.mockResolvedValue({
    id: "dm-conversation-1",
    workspaceId: "workspace-1",
    contactId: "contact-1",
    sourceId: null,
  })
  mockConversationFindOrCreate.mockResolvedValue({
    id: "dm-conversation-created",
    workspaceId: "workspace-1",
    contactId: "contact-1",
    sourceId: null,
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
  mockDeleteDedup.mockResolvedValue(undefined)
  // `clearAllMocks` wipes call history but keeps implementations, so a test
  // that makes a sender reject would leak that into every later test.
  mockSendPrivateReply.mockResolvedValue(undefined)
  mockSendInstagramPrivateReply.mockResolvedValue(undefined)
  mockSendInstagramFacebookPrivateReply.mockResolvedValue(undefined)
  mockChatQueueAdd.mockResolvedValue(undefined)
  mockAiAgentQueueAdd.mockResolvedValue(undefined)
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

  // Production payload: on a photo post the leading half of `parent_id` is the
  // ALBUM, not the Page, so `parentId !== postId` read every top-level comment
  // as a reply and — with `ignoreCommentReplies` on by default — swallowed the
  // whole automation. Only the trailing story id agrees between the two.
  test("photo post, top-level comment: parentId is {albumId}_{storyId}", () => {
    expect(
      isCommentReply(PHOTO_ALBUM_PARENT_ID, PHOTO_POST_ID, PHOTO_COMMENT_ID),
    ).toBe(false)
  })

  // Production payload: a reel sends `parent_id` byte-identical to `post_id`.
  test("reel post, top-level comment: parentId equals postId", () => {
    expect(isCommentReply(REEL_POST_ID, REEL_POST_ID, REEL_COMMENT_ID)).toBe(
      false,
    )
  })

  // Production payload: a reply's own `comment_id` stays anchored to the story,
  // never to the comment it answers — which is what keeps the `objectIdOf`
  // safety net from misreading a reply as top-level.
  test("reply: comment_id stays anchored to the story, parentId is the parent comment", () => {
    expect(
      isCommentReply(PHOTO_COMMENT_ID, PHOTO_POST_ID, PHOTO_REPLY_COMMENT_ID),
    ).toBe(true)
  })

  // Production payloads: Instagram ids are bare and a top-level comment carries
  // no `parent_id` at all, on both the IG-Login and the Facebook-Login variant.
  test.each([
    ["instagramFacebook", "17981236959118569", "17967295770157071"],
    ["instagram", "18055975949799859", "17876890326629016"],
  ])("%s top-level comment: no parentId", (_variant, mediaId, commentId) => {
    expect(isCommentReply(undefined, mediaId, commentId)).toBe(false)
  })

  test("instagram reply: bare parent comment id is still a reply", () => {
    expect(
      isCommentReply(
        "17967295770157071",
        "17981236959118569",
        "17967295770157099",
      ),
    ).toBe(true)
  })

  test("reply: parentId is another comment id", () => {
    expect(isCommentReply(OTHER_COMMENT_ID, POST_ID)).toBe(true)
    expect(isCommentReply(OTHER_COMMENT_ID, POST_ID, COMMENT_ID)).toBe(true)
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

  test("runs the automation for a top-level comment whose parentId is the bare story id", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(buildJobData({ parentId: STORY_ID }) as any)

    expect(mockInsertDedup).toHaveBeenCalled()
    expect(mockLoggerInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({ reason: "comment is a reply" }),
      "Comment automation skipped",
    )
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

    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      "commentAIReply",
      expect.objectContaining({
        type: "commentAIReply",
        data: expect.objectContaining({
          agentId: "agent-1",
          automationId: "automation-1",
          replyChannel: "public",
          commentId: COMMENT_ID,
        }),
      }),
      expect.objectContaining({
        jobId: `comment-ai-reply-automation-1-${COMMENT_ID}-public`,
      }),
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

    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      "commentAIReply",
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: "agent-9",
          automationId: "automation-1",
          replyChannel: "private",
        }),
      }),
      expect.objectContaining({
        jobId: `comment-ai-reply-automation-1-${COMMENT_ID}-private`,
      }),
    )
  })

  test("AIAgent with an empty value does not dispatch or count", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "AIAgent", value: null } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockAiAgentQueueAdd).not.toHaveBeenCalledWith(
      "commentAIReply",
      expect.anything(),
      expect.anything(),
    )
    expect(mockIncrementRepliesCount).not.toHaveBeenCalled()
  })

  test("keeps matching automations distinct for the same comment and channel", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        id: "automation-1",
        publicReply: { type: "AIAgent", value: "agent-1" },
      }),
      buildAutomation({
        id: "automation-2",
        publicReply: { type: "AIAgent", value: "agent-2" },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    const jobIds = mockAiAgentQueueAdd.mock.calls.map((call) => call[2]?.jobId)
    expect(jobIds).toEqual([
      `comment-ai-reply-automation-1-${COMMENT_ID}-public`,
      `comment-ai-reply-automation-2-${COMMENT_ID}-public`,
    ])
    expect(new Set(jobIds).size).toBe(2)
    expect(jobIds.every((jobId) => !jobId?.includes(":"))).toBe(true)
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
      contactInbox: {
        id: "contact-inbox-1",
        contactId: "contact-1",
        channel: "messenger",
      },
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
      contactInbox: {
        id: "contact-inbox-1",
        contactId: "contact-1",
        channel: "messenger",
      },
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

  test("instagram: enqueues a sendFlow job carrying a private commentAnchor", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "flow", value: "flow-1" } }),
    ])
    mockFindContactInboxBy.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "instagram",
    })

    await processCommentAutomation({
      ...buildJobData(),
      integrationType: "instagram",
    } as any)

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

  test("instagramFacebook: enqueues a sendFlow job carrying a private commentAnchor", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "flow", value: "flow-1" } }),
    ])
    mockFindContactInboxBy.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "instagramFacebook",
    })

    await processCommentAutomation({
      ...buildJobData(),
      integrationType: "instagramFacebook",
    } as any)

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
})

// #1063: the flow's state has to live on the DM conversation, where the
// contact's replies arrive — the comment-anchored conversation only governs how
// the first message is delivered (commentAnchor).
describe("processCommentAutomation flow private reply DM conversation", () => {
  test("runs the flow on the existing DM conversation, not the comment-anchored one", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "flow", value: "flow-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockConversationFindDMByContact).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      channel: "messenger",
    })
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "dm-conversation-1",
          // The anchor still rides along untouched.
          commentAnchor: { commentId: COMMENT_ID, replyChannel: "private" },
        }),
      }),
      expect.anything(),
    )
    expect(mockConversationFindOrCreate).not.toHaveBeenCalled()
  })

  test("opens the DM conversation when the comment is the contact's first interaction", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "flow", value: "flow-1" } }),
    ])
    mockConversationFindDMByContact.mockResolvedValue(undefined)

    await processCommentAutomation(buildJobData() as any)

    expect(mockConversationFindOrCreate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      sourceId: null,
    })
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "dm-conversation-created",
        }),
      }),
      expect.anything(),
    )
  })

  test("falls back to the comment conversation and still dispatches when the DM lookup fails", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "flow", value: "flow-1" } }),
    ])
    mockConversationFindDMByContact.mockRejectedValue(new Error("db down"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockLoggerWarn).toHaveBeenCalled()
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: "conversation-1" }),
      }),
      expect.anything(),
    )
    // A throw here would skip the dedup row and let a retry post the public
    // reply twice.
    expect(mockInsertDedup).toHaveBeenCalled()
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

  test("keeps the comment-anchored conversation — a public flow is answered on the post (#1063 applies to private only)", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "flow", value: "flow-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: "conversation-1" }),
      }),
      expect.anything(),
    )
    expect(mockConversationFindDMByContact).not.toHaveBeenCalled()
    expect(mockConversationFindOrCreate).not.toHaveBeenCalled()
  })
})

describe("processCommentAutomation dedup on partial dispatch failure", () => {
  test("writes the dedup row when the public branch dispatched but the private one threw", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        privateReply: { type: "text", value: "private answer" },
      }),
    ])
    mockSendPrivateReply.mockRejectedValue(new Error("send failed"))

    await processCommentAutomation(buildJobData() as any)

    // Without the row, the contact's next comment would post the public reply
    // a second time.
    expect(mockInsertDedup).toHaveBeenCalledWith({
      automationId: "automation-1",
      contactId: "contact-1",
      postId: POST_ID,
      workspaceId: "workspace-1",
    })
    expect(mockIncrementRepliesCount).toHaveBeenCalledTimes(1)
  })

  test("does not write the dedup row when every configured branch failed", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        privateReply: { type: "text", value: "private answer" },
      }),
    ])
    mockSendPrivateReply.mockRejectedValue(new Error("send failed"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).not.toHaveBeenCalled()
    expect(mockIncrementRepliesCount).not.toHaveBeenCalled()
  })

  test("still writes the dedup row for a like/hide-only automation that sends nothing", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).toHaveBeenCalled()
    expect(mockIncrementRepliesCount).not.toHaveBeenCalled()
  })
})

describe("processCommentAutomation private reply budget per comment", () => {
  test("only the first matching automation spends the comment's single DM", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        id: "automation-1",
        privateReply: { type: "text", value: "first DM" },
      }),
      buildAutomation({
        id: "automation-2",
        privateReply: { type: "text", value: "second DM" },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockSendPrivateReply).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "first DM",
    )
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "automation-2",
        reason: "private reply already claimed for this comment",
      }),
      "Comment automation skipped",
    )
  })

  test("the skipped automation's public reply still goes out", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        id: "automation-1",
        privateReply: { type: "text", value: "first DM" },
      }),
      buildAutomation({
        id: "automation-2",
        privateReply: { type: "text", value: "second DM" },
        publicReply: { type: "text", value: "public answer" },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "public answer" }),
    )
  })

  test("a failed private reply does not consume the budget", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        id: "automation-1",
        privateReply: { type: "text", value: "first DM" },
      }),
      buildAutomation({
        id: "automation-2",
        privateReply: { type: "text", value: "second DM" },
      }),
    ])
    mockSendPrivateReply.mockRejectedValueOnce(new Error("send failed"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockSendPrivateReply).toHaveBeenCalledTimes(2)
  })
})

describe("processCommentAutomation private reply 7-day window", () => {
  test("skips the DM for a comment older than 7 days and logs the reason", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        privateReply: { type: "text", value: "too late" },
      }),
    ])

    await processCommentAutomation(
      buildJobData({
        createdTime: Math.floor(Date.now() / 1000) - 8 * ONE_DAY_SECONDS,
      }) as any,
    )

    expect(mockSendPrivateReply).not.toHaveBeenCalled()
    // The gate now lives in the caller, so the skip is logged there.
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "comment older than the 7-day private reply window",
      }),
      "Comment automation skipped",
    )
    // Nothing was delivered, so the contact must stay eligible.
    expect(mockInsertDedup).not.toHaveBeenCalled()
  })

  test("counts the reply delay: a 6-day-old comment with a 2-day delay is out of window", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        privateReply: { type: "text", value: "too late" },
        replyAfter: { type: "hours", value: 48 },
      }),
    ])

    await processCommentAutomation(
      buildJobData({
        createdTime: Math.floor(Date.now() / 1000) - 6 * ONE_DAY_SECONDS,
      }) as any,
    )

    expect(mockSendPrivateReply).not.toHaveBeenCalled()
  })

  test("still sends the public reply for an out-of-window comment", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        privateReply: { type: "text", value: "too late" },
      }),
    ])

    await processCommentAutomation(
      buildJobData({
        createdTime: Math.floor(Date.now() / 1000) - 8 * ONE_DAY_SECONDS,
      }) as any,
    )

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "public answer" }),
    )
    expect(mockInsertDedup).toHaveBeenCalled()
  })

  test("a comment just inside the window is still answered", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "text", value: "in time" } }),
    ])

    await processCommentAutomation(
      buildJobData({
        createdTime: Math.floor(Date.now() / 1000) - 6 * ONE_DAY_SECONDS,
      }) as any,
    )

    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "in time",
    )
  })
})

describe("processCommentAutomation dedup key handed to async reply jobs", () => {
  test("the AIAgent job carries the dedup row it has to roll back", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "AIAgent", value: "agent-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      "commentAIReply",
      expect.objectContaining({
        data: expect.objectContaining({
          commentDedup: {
            automationId: "automation-1",
            contactId: "contact-1",
            postId: POST_ID,
            workspaceId: "workspace-1",
          },
        }),
      }),
      expect.anything(),
    )
  })
})

describe("processCommentAutomation missing incoming message row", () => {
  test("warns and still dispatches the reply", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "text", value: "answer" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: COMMENT_ID }),
      "Comment automation: incoming comment message row not found, skipping like/hide and parent threading",
    )
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "answer" }),
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
      automationId: "automation-1",
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
        contentAttributes: {
          replyToCommentId: COMMENT_ID,
          commentAutomation: {
            automationId: "automation-1",
            replyChannel: "public",
          },
        },
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

  test("private (instagram): sends an AI-generated DM through the Instagram Login endpoint", async () => {
    await processCommentAIReply(
      buildAIJobData({
        replyChannel: "private",
        channelType: "instagram",
        integrationType: "instagram",
      }) as any,
    )

    expect(mockSendInstagramPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "AI answer",
    )
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
    expect(mockSendInstagramFacebookPrivateReply).not.toHaveBeenCalled()
  })

  test("private (instagramFacebook): sends an AI-generated DM through the Instagram-via-Facebook endpoint", async () => {
    await processCommentAIReply(
      buildAIJobData({
        replyChannel: "private",
        channelType: "instagramFacebook",
        integrationType: "instagramFacebook",
      }) as any,
    )

    expect(mockSendInstagramFacebookPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "AI answer",
    )
    expect(mockSendPrivateReply).not.toHaveBeenCalled()
    expect(mockSendInstagramPrivateReply).not.toHaveBeenCalled()
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

  // The dispatcher writes the dedup row when it enqueues this job, so a job
  // that answers nothing has to release it — otherwise replyOncePerUserPerPost
  // blocks the contact on this post forever.
  describe("dedup rollback", () => {
    const COMMENT_DEDUP = {
      automationId: "automation-1",
      contactId: "contact-1",
      postId: POST_ID,
      workspaceId: "workspace-1",
    }

    test("releases the row when the agent is gone", async () => {
      mockAiAgentFindBy.mockResolvedValue(undefined)

      await processCommentAIReply(
        buildAIJobData({ commentDedup: COMMENT_DEDUP }) as any,
      )

      expect(mockDeleteDedup).toHaveBeenCalledWith(COMMENT_DEDUP)
    })

    test("releases the row when the agent produces no text", async () => {
      mockGenerateAIReplyText.mockResolvedValue(null)

      await processCommentAIReply(
        buildAIJobData({ commentDedup: COMMENT_DEDUP }) as any,
      )

      expect(mockDeleteDedup).toHaveBeenCalledWith(COMMENT_DEDUP)
    })

    test("releases the row for an image-only comment", async () => {
      await processCommentAIReply(
        buildAIJobData({ message: "", commentDedup: COMMENT_DEDUP }) as any,
      )

      expect(mockDeleteDedup).toHaveBeenCalledWith(COMMENT_DEDUP)
    })

    test("releases the row outside the workspace's active hours", async () => {
      mockIsActiveNow.mockReturnValue(false)

      await processCommentAIReply(
        buildAIJobData({ commentDedup: COMMENT_DEDUP }) as any,
      )

      expect(mockDeleteDedup).toHaveBeenCalledWith(COMMENT_DEDUP)
    })

    test("keeps the row on the happy path", async () => {
      await processCommentAIReply(
        buildAIJobData({ commentDedup: COMMENT_DEDUP }) as any,
      )

      expect(mockDeleteDedup).not.toHaveBeenCalled()
    })

    test("is a no-op for an in-flight job enqueued before the field existed", async () => {
      mockAiAgentFindBy.mockResolvedValue(undefined)

      await processCommentAIReply(buildAIJobData() as any)

      expect(mockDeleteDedup).not.toHaveBeenCalled()
    })

    test("a failed cleanup does not escalate into a job failure", async () => {
      mockAiAgentFindBy.mockResolvedValue(undefined)
      mockDeleteDedup.mockRejectedValue(new Error("db down"))

      await expect(
        processCommentAIReply(
          buildAIJobData({ commentDedup: COMMENT_DEDUP }) as any,
        ),
      ).resolves.toBeUndefined()
    })
  })

  // A skip is not a failure: `FBCommentAutomationEvent` only counts work the
  // automation actually attempted, so a deliberate decline must leave no row
  // rather than one Error Logs entry per off-hours comment.
  describe("skip vs failure on the analytics event", () => {
    test("outside the workspace's active hours discards the event instead of failing it", async () => {
      mockIsActiveNow.mockReturnValue(false)

      await processCommentAIReply(buildAIJobData() as any)

      expect(mockDiscardEvent).toHaveBeenCalledWith({
        automationId: "automation-1",
        commentId: COMMENT_ID,
        replyChannel: "public",
      })
      expect(mockSettleEvent).not.toHaveBeenCalled()
    })

    test("an image-only comment discards the event", async () => {
      await processCommentAIReply(buildAIJobData({ message: "" }) as any)

      expect(mockDiscardEvent).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: COMMENT_ID }),
      )
      expect(mockSettleEvent).not.toHaveBeenCalled()
    })

    test("a missing agent still fails the event — the workspace has to see it", async () => {
      mockAiAgentFindBy.mockResolvedValue(undefined)

      await processCommentAIReply(buildAIJobData() as any)

      expect(mockSettleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorDetail: "agent not found",
        }),
      )
      expect(mockDiscardEvent).not.toHaveBeenCalled()
    })

    test("an agent that produces no text still fails the event", async () => {
      mockGenerateAIReplyText.mockResolvedValue(null)

      await processCommentAIReply(buildAIJobData() as any)

      expect(mockSettleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorDetail: "agent produced no text",
        }),
      )
      expect(mockDiscardEvent).not.toHaveBeenCalled()
    })
  })

  // Without this the row stays `sent` with a null replyText forever: the send
  // threw, the job dead-lettered, and nothing ever revisited the event.
  describe("a send that throws", () => {
    test("private: records the failure with the generated text and rethrows", async () => {
      mockSendPrivateReply.mockRejectedValue(new Error("token revoked"))

      await expect(
        processCommentAIReply(
          buildAIJobData({ replyChannel: "private" }) as any,
        ),
      ).rejects.toThrow("token revoked")

      expect(mockSettleEvent).toHaveBeenCalledWith({
        automationId: "automation-1",
        commentId: COMMENT_ID,
        replyChannel: "private",
        status: "failed",
        replyText: "AI answer",
        errorDetail: "token revoked",
      })
    })

    test("does not record on an attempt that will be retried", async () => {
      mockSendPrivateReply.mockRejectedValue(new Error("token revoked"))

      await expect(
        processCommentAIReply(
          buildAIJobData({ replyChannel: "private" }) as any,
          true,
        ),
      ).rejects.toThrow("token revoked")

      expect(mockSettleEvent).not.toHaveBeenCalled()
    })

    test("generation that throws is recorded with no replyText — the row keeps its null", async () => {
      mockGenerateAIReplyText.mockRejectedValue(new Error("bad provider key"))

      await expect(
        processCommentAIReply(buildAIJobData() as any),
      ).rejects.toThrow("bad provider key")

      expect(mockSettleEvent).toHaveBeenCalledWith({
        automationId: "automation-1",
        commentId: COMMENT_ID,
        replyChannel: "public",
        status: "failed",
        errorDetail: "bad provider key",
      })
      const [settled] = mockSettleEvent.mock.calls[0]
      expect(settled).not.toHaveProperty("replyText")
    })

    test("a lookup that throws is recorded too", async () => {
      mockAiAgentFindBy.mockRejectedValue(new Error("db down"))

      await expect(
        processCommentAIReply(buildAIJobData() as any),
      ).rejects.toThrow("db down")

      expect(mockSettleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", errorDetail: "db down" }),
      )
      expect(mockGenerateAIReplyText).not.toHaveBeenCalled()
    })

    // `runWithOrphanedIntegrationCleanup` converts this into a BullMQ
    // `UnrecoverableError` from outside this handler, so the attempt counter
    // still says "retry coming" while BullMQ will in fact never run it again.
    test("an orphaned integration is terminal even on a non-final attempt", async () => {
      mockIdentifyInboxAndIntegrationAuth.mockRejectedValue(
        new IntegrationNotFoundError("messenger" as never, PAGE_ID),
      )

      await expect(
        processCommentAIReply(
          buildAIJobData({ replyChannel: "private" }) as any,
          true,
        ),
      ).rejects.toThrow("Integration not found")

      expect(mockSettleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          replyText: "AI answer",
        }),
      )
    })

    test("public: a failure creating the outgoing message is recorded too", async () => {
      mockMessageCreate.mockRejectedValue(new Error("shard down"))

      await expect(
        processCommentAIReply(buildAIJobData() as any),
      ).rejects.toThrow("shard down")

      expect(mockSettleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          replyChannel: "public",
          status: "failed",
          errorDetail: "shard down",
        }),
      )
    })
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

describe("processCommentAutomation analytics events", () => {
  test("records a sent event per dispatched branch, carrying the text that went out", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        privateReply: { type: "text", value: "private answer" },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).toHaveBeenCalledTimes(2)
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "automation-1",
        commentId: COMMENT_ID,
        replyChannel: "public",
        replyType: "text",
        replyText: "public answer",
        status: "sent",
      }),
    )
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "private",
        replyType: "text",
        replyText: "private answer",
        status: "sent",
      }),
    )
  })

  test("records a flow reply under the flow's name — a flow has no text of its own", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "flow", value: "flow-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyType: "flow",
        replyText: "Flow: Flow 1",
        status: "sent",
      }),
    )
  })

  test("opens an AIAgent event with no text — the AI job settles it later", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ publicReply: { type: "AIAgent", value: "agent-1" } }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyType: "AIAgent",
        replyText: null,
        status: "sent",
      }),
    )
  })

  test("records a failed event and a workspace error log when a branch throws", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        privateReply: { type: "text", value: "private answer" },
      }),
    ])
    mockSendPrivateReply.mockRejectedValue(new Error("send failed"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "private",
        status: "failed",
        errorDetail: "send failed",
      }),
    )
    expect(mockLogProviderError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "messenger",
        workspaceId: "workspace-1",
        contactId: "contact-1",
      }),
    )
  })

  test("a failing analytics write cannot cost the dedup row", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        privateReply: { type: "text", value: "private answer" },
      }),
    ])
    mockSendPrivateReply.mockRejectedValue(new Error("send failed"))
    // The failure path runs inside a catch block that still owes the dedup
    // write — bookkeeping must not be able to reopen the duplicate-reply hole.
    mockLogProviderError.mockRejectedValueOnce(new Error("event bus down"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockInsertDedup).toHaveBeenCalledWith({
      automationId: "automation-1",
      contactId: "contact-1",
      postId: POST_ID,
      workspaceId: "workspace-1",
    })
  })

  test("records no event for a branch that declined to send", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "none", value: null },
        privateReply: { type: "none", value: null },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).not.toHaveBeenCalled()
  })
})

// An automation that blew up before either branch reported an outcome used to
// leave nothing behind: no `sent`, no `failed`, and a customer with no reply.
describe("processCommentAutomation pre-dispatch failure", () => {
  test("records a failed event for every configured branch", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        privateReply: { type: "flow", value: "flow-1" },
        options: { replyToNewContactsOnly: true },
      }),
    ])
    mockGetPriorContactInboxCount.mockRejectedValue(new Error("shard timeout"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).toHaveBeenCalledTimes(2)
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "public",
        replyType: "text",
        status: "failed",
        errorDetail: "shard timeout",
        replyText: null,
      }),
    )
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "private",
        replyType: "flow",
        status: "failed",
        errorDetail: "shard timeout",
      }),
    )
  })

  test("does not report an internal failure as a third-party one", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        options: { replyToNewContactsOnly: true },
      }),
    ])
    mockGetPriorContactInboxCount.mockRejectedValue(new Error("shard timeout"))

    await processCommentAutomation(buildJobData() as any)

    // `ErrorLog.action` names the vendor that failed, and Meta was never called.
    expect(mockLogProviderError).not.toHaveBeenCalled()
  })

  test("records nothing extra when the failure comes after both branches dispatched", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        privateReply: { type: "text", value: "private answer" },
      }),
    ])
    mockInsertDedup.mockRejectedValue(new Error("db down"))

    await processCommentAutomation(buildJobData() as any)

    // Two `sent` rows from dispatch; the catch's inserts lose to the unique
    // index, so the service is asked at most once more per branch and the
    // existing rows keep their status.
    const failedCalls = mockRecordEvent.mock.calls.filter(
      ([input]) => input.status === "failed",
    )
    expect(failedCalls).toHaveLength(2)
    expect(
      mockRecordEvent.mock.calls.filter(([input]) => input.status === "sent"),
    ).toHaveLength(2)
  })

  test("records nothing for a like/hide-only automation", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "none", value: null },
        privateReply: { type: "none", value: null },
        options: { replyToNewContactsOnly: true },
      }),
    ])
    mockGetPriorContactInboxCount.mockRejectedValue(new Error("shard timeout"))

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).not.toHaveBeenCalled()
  })
})

// Neither of these is a filtered-out comment — it passed every filter and then
// hit a Meta rule, so the workspace needs to be able to see it.
describe("processCommentAutomation blocked private reply", () => {
  test("records the 7-day window as a failed event", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ privateReply: { type: "text", value: "too late" } }),
    ])

    await processCommentAutomation(
      buildJobData({
        createdTime: Math.floor(Date.now() / 1000) - 8 * ONE_DAY_SECONDS,
      }) as any,
    )

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "private",
        replyType: "text",
        status: "failed",
        errorDetail:
          "Private reply not sent: the comment is outside Meta's 7-day private reply window",
      }),
    )
    expect(mockLogProviderError).not.toHaveBeenCalled()
  })

  test("records the claimed single-DM budget as a failed event on the second automation", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        id: "automation-1",
        privateReply: { type: "text", value: "first" },
      }),
      buildAutomation({
        id: "automation-2",
        privateReply: { type: "text", value: "second" },
      }),
    ])

    await processCommentAutomation(buildJobData() as any)

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "automation-1",
        replyChannel: "private",
        status: "sent",
      }),
    )
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "automation-2",
        replyChannel: "private",
        status: "failed",
        errorDetail:
          "Private reply not sent: another automation already used this comment's single private reply",
      }),
    )
    expect(mockLogProviderError).not.toHaveBeenCalled()
  })

  test("the blocked automation's public reply still goes out", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({
        publicReply: { type: "text", value: "public answer" },
        privateReply: { type: "text", value: "too late" },
      }),
    ])

    await processCommentAutomation(
      buildJobData({
        createdTime: Math.floor(Date.now() / 1000) - 8 * ONE_DAY_SECONDS,
      }) as any,
    )

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "public",
        status: "sent",
        replyText: "public answer",
      }),
    )
  })
})
