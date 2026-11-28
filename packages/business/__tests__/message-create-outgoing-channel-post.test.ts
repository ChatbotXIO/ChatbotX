// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockMarkAgentReplied = vi.fn()
const mockUpdateTracking = vi.fn()
const mockRepositoryCreate = vi.fn()
const mockCreateMessageRepository = vi.fn()
const mockChatQueueAdd = vi.fn()
const mockResolveTenantSettings = vi.fn()
const mockIntegrationQueueAdd = vi.fn()
const mockFlowExists = vi.fn()
const mockFindOrCreate = vi.fn()
const mockPrepareChannelPost = vi.fn()
const mockFindMediaFilesByIds = vi.fn()
const mockCopyObject = vi.fn()
const mockQueueMessageCreatedEvent = vi.fn()
const mockQueueWorkspaceRealtimeEvent = vi.fn()
const mockUpdateSendError = vi.fn()
const mockHardDeleteById = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
  flowRepository: { existsInWorkspace: mockFlowExists },
  mediaLibraryFileRepository: {
    findByPath: vi.fn(),
    findById: vi.fn(),
    findByIds: mockFindMediaFilesByIds,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  guessFileTypeFromMimeType: vi.fn(() => "image"),
  pathJoin: (...parts: string[]) => parts.join("/"),
  uploader: { copyObject: mockCopyObject, getPresignedDownload: vi.fn() },
  uploadMultipleFiles: vi.fn(async () => []),
}))

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: {
    messageCreated: "messageCreated",
    messageFailed: "messageFailed",
    messageRemoved: "messageRemoved",
  },
  routeForConversation: vi.fn(() => ({
    assignedTeamIds: [],
    assignedUserIds: [],
  })),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendChannelMessage: "sendChannelMessage",
    checkOutboundAutomatedResponse: "checkOutboundAutomatedResponse",
  },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("../src/conversation-participant/service", () => ({
  conversationParticipantService: { recordReply: vi.fn() },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { updateTracking: mockUpdateTracking },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: {
    markAgentReplied: mockMarkAgentReplied,
    findOrCreate: mockFindOrCreate,
  },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: vi.fn() },
}))

vi.mock("../src/working-hours/service", () => ({
  workingHoursService: { findForAgent: vi.fn() },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))

vi.mock("../src/channel-post/share.service", () => ({
  channelPostShareService: { prepareOutgoing: mockPrepareChannelPost },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mockResolveTenantSettings,
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  queueMessageCreatedEvent: mockQueueMessageCreatedEvent,
  queueWorkspaceRealtimeEvent: mockQueueWorkspaceRealtimeEvent,
}))

vi.mock("../src/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}/${path}`,
}))

const { createOutgoing } = await import("../src/message/create-outgoing")
const { ChannelPostShareRefusedError } = await import("../src/errors")

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}
const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
  channel: "messenger",
}

const entity = (shareMode: "nativeMedia" | "textLink") => ({
  type: "channel_post" as const,
  shareMode,
  channelPostId: "post-1",
  externalPostId: "ext-1",
  permalink: "https://example.com/p/1",
  thumbnail: "https://cdn.example.com/1.jpg",
  caption: "Summer sale",
})

const textLinkPrepared = {
  text: "Summer sale\nhttps://example.com/p/1",
  contentAttributes: entity("textLink"),
}
const nativePrepared = { text: null, contentAttributes: entity("nativeMedia") }

const send = (
  input: Record<string, unknown> = {},
  inbox: Record<string, unknown> = contactInbox,
) =>
  createOutgoing({
    conversation: conversation as never,
    contactInbox: inbox as never,
    input: { channelPost: { channelPostId: "post-1" }, ...input } as never,
    user: { id: "user-1" } as never,
    sendFrom: "inbox",
  })

describe("messageService.createOutgoing with a channel post", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
    })
    mockMarkAgentReplied.mockResolvedValue(undefined)
    mockUpdateTracking.mockResolvedValue(null)
    mockRepositoryCreate.mockImplementation((input) =>
      Promise.resolve({
        id: `msg-${mockRepositoryCreate.mock.calls.length}`,
        ...input,
        sourceId: null,
        updatedAt: input.createdAt,
      }),
    )
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: vi.fn(),
      updateSendError: mockUpdateSendError,
      hardDeleteById: mockHardDeleteById,
    })
    mockChatQueueAdd.mockResolvedValue(undefined)
    mockQueueMessageCreatedEvent.mockResolvedValue(undefined)
    mockPrepareChannelPost.mockResolvedValue(textLinkPrepared)
  })

  const expectNothingCreated = () => {
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockQueueMessageCreatedEvent).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
  }

  test("resolves through the service with the conversation's inbox and channel", async () => {
    await send()

    expect(mockPrepareChannelPost).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      channel: "messenger",
      channelPostId: "post-1",
    })
  })

  test("a text-link share stores the built text and the post card, and queues the existing channel send", async () => {
    await send({ clientId: "client-1" })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: textLinkPrepared.text,
        contentType: "text",
        contentAttributes: { ...entity("textLink"), sentFromInbox: true },
      }),
    )
    expect(mockQueueMessageCreatedEvent).toHaveBeenCalledTimes(1)
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "sendChannelMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          sendFrom: "inbox",
          message: expect.objectContaining({ clientId: "client-1" }),
        }),
      }),
    )
  })

  test("a native share stores no text, only the card", async () => {
    mockPrepareChannelPost.mockResolvedValue(nativePrepared)

    await send({}, { ...contactInbox, channel: "instagram" })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: null,
        contentAttributes: { ...entity("nativeMedia"), sentFromInbox: true },
      }),
    )
  })

  test("does not run outbound keyword automations on the built text", async () => {
    await send()

    expect(mockChatQueueAdd.mock.calls.map(([name]) => name)).toEqual([
      "sendChannelMessage",
    ])
  })

  test("keeps the routing-bypass flag next to the post card", async () => {
    await send({ bypassThreadControlLock: true })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: {
          ...entity("textLink"),
          metadata: { bypassThreadControlLock: true },
          sentFromInbox: true,
        },
      }),
    )
  })

  test.each([
    "channelPostNotFound",
    "channelPostInboxMismatch",
    "channelPostTypeNotShareable",
    "channelPostShareUnsupported",
    "channelPostLinkUnavailable",
    "channelPostLinkTooLong",
  ] as const)("a %s refusal is a 422 that keeps its reason and creates nothing", async (reason) => {
    mockPrepareChannelPost.mockRejectedValue(
      new ChannelPostShareRefusedError(reason),
    )

    await expect(send()).rejects.toMatchObject({
      code: "channelPostShareRefused",
      httpStatusCode: 422,
      reason,
    })
    expectNothingCreated()
  })

  test.each([
    ["a comment reply", { replyToMessageId: "parent-1" }],
    ["a private reply", { isPrivateReply: true }],
  ])("refuses a post as %s before resolving anything", async (_name, extra) => {
    await expect(send(extra)).rejects.toMatchObject({ code: "validation" })

    expect(mockPrepareChannelPost).not.toHaveBeenCalled()
    expectNothingCreated()
  })

  test("two concurrent sends keep their own client id, post card and job", async () => {
    mockPrepareChannelPost.mockImplementation(
      async ({ channelPostId }: { channelPostId: string }) => ({
        text: `post ${channelPostId}`,
        contentAttributes: { ...entity("textLink"), channelPostId },
      }),
    )

    await Promise.all([
      send({ clientId: "a", channelPost: { channelPostId: "p1" } }),
      send({ clientId: "b", channelPost: { channelPostId: "p2" } }),
    ])

    const jobs = mockChatQueueAdd.mock.calls.map(
      ([, job]) =>
        (job as { data: { message: { clientId: string; text: string } } }).data
          .message,
    )
    expect(jobs.map(({ clientId, text }) => [clientId, text]).sort()).toEqual([
      ["a", "post p1"],
      ["b", "post p2"],
    ])
    expect(mockQueueMessageCreatedEvent).toHaveBeenCalledTimes(2)
  })
})
