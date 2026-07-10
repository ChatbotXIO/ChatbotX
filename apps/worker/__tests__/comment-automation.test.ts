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
  mockWorkspaceFindById,
  mockIdentifyInboxAndIntegrationAuth,
  mockCreateMessageRepository,
  mockLoggerInfo,
} = vi.hoisted(() => ({
  mockFindContactInboxBy: vi.fn(),
  mockFindActiveAutomations: vi.fn(),
  mockIsWithinSchedule: vi.fn(),
  mockFindDedup: vi.fn(),
  mockInsertDedup: vi.fn(),
  mockIncrementRepliesCount: vi.fn(),
  mockGetPriorContactInboxCount: vi.fn(),
  mockWorkspaceFindById: vi.fn(),
  mockIdentifyInboxAndIntegrationAuth: vi.fn(),
  mockCreateMessageRepository: vi.fn(),
  mockLoggerInfo: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: vi.fn(),
  contactInboxService: { findBy: mockFindContactInboxBy },
  fbCommentAutomationService: {
    findActiveAutomations: mockFindActiveAutomations,
    isWithinSchedule: mockIsWithinSchedule,
    findDedup: mockFindDedup,
    insertDedup: mockInsertDedup,
    incrementRepliesCount: mockIncrementRepliesCount,
    getPriorContactInboxCount: mockGetPriorContactInboxCount,
  },
  workspaceService: { findById: mockWorkspaceFindById },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  sendPrivateReply: vi.fn(),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { changeChannelMessageState: "changeChannelMessageState" },
  chatQueue: { add: vi.fn().mockResolvedValue(undefined) },
  IntegrationJobAction: {
    processCommentAutomation: "processCommentAutomation",
  },
  integrationQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { isCommentReply, processCommentAutomation } = await import(
  "../src/integration/handlers/comment-automation"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE_ID = "2094067177305463"
const POST_ID = `${PAGE_ID}_2357494887629356`
const COMMENT_ID = "2357494887629356_1544045903933592"
const OTHER_COMMENT_ID = "2357494887629356_9999999999999999"

function buildAutomation(options: Partial<Record<string, boolean>> = {}) {
  return {
    id: "automation-1",
    post: { type: "all", value: [] },
    includeKeywords: { type: "all", value: [] },
    excludeKeywords: [],
    publicReply: { type: "none", value: null },
    privateReply: { type: "none", value: null },
    options: {
      replyToNewContactsOnly: false,
      replyOncePerUserPerPost: false,
      likeUserComment: false,
      replyToUsersWhoCommentedOnOtherPosts: true,
      ignoreCommentReplies: true,
      trackUserTags: false,
      ...options,
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
    },
    replyAfter: { type: "immediately", value: 0 },
  }
}

function buildJobData(parentId: string | undefined) {
  return {
    integrationType: "messenger",
    integrationIdentifier: PAGE_ID,
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    commentId: COMMENT_ID,
    postId: POST_ID,
    parentId,
    fromId: "user-1",
    message: "2",
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
  mockIsWithinSchedule.mockReturnValue(true)
  mockCreateMessageRepository.mockResolvedValue({
    findBySourceId: vi.fn().mockResolvedValue(null),
  })
  mockInsertDedup.mockResolvedValue(undefined)
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

    await processCommentAutomation(buildJobData(POST_ID) as any)

    expect(mockInsertDedup).toHaveBeenCalledWith({
      automationId: "automation-1",
      contactId: "contact-1",
      postId: POST_ID,
      workspaceId: "workspace-1",
    })
  })

  test("skips a real comment reply when ignoreCommentReplies is on", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(buildJobData(OTHER_COMMENT_ID) as any)

    expect(mockInsertDedup).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "comment is a reply" }),
      "Comment automation skipped",
    )
  })

  test("runs the automation for a real comment reply when ignoreCommentReplies is off", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ ignoreCommentReplies: false }),
    ])

    await processCommentAutomation(buildJobData(OTHER_COMMENT_ID) as any)

    expect(mockInsertDedup).toHaveBeenCalled()
  })

  test("runs the automation when the payload has no parentId", async () => {
    mockFindActiveAutomations.mockResolvedValue([buildAutomation()])

    await processCommentAutomation(buildJobData(undefined) as any)

    expect(mockInsertDedup).toHaveBeenCalled()
  })
})
