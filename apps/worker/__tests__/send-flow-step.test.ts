import { beforeEach, describe, expect, test, vi } from "vitest"

const HTTP_URL_RE = /^https?:\/\//i

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockRepositoryCreate,
  mockRepositoryCreateWithAttachments,
  mockCreateMessageRepository,
  mockFindConversation,
  mockFindContactInbox,
  mockBroadcast,
  mockEmit,
  mockresolveTenantSettings,
  mockResolveContactVariables,
  mockResolveMediaUrl,
  mockUploadFileFromUrl,
  mockSendFlowStepToChannel,
  mockSendMessageToChannel,
  mockProcessWhatsappTemplate,
  mockProcessMessengerTemplate,
  mockRecordOutboundFlowStep,
  mockRecordOutboundMessageActivity,
  mockRecordSendFailure,
  mockInvalidateTracking,
  mockConversationInvalidate,
  mockFindAppointmentCalendarBySlug,
  mockSignAppointmentWebviewToken,
  mockMarkReadByOutbound,
  mockPrepareProductMessage,
  mockLogProviderErrorForChannel,
} = vi.hoisted(() => {
  const mockFindConversation = vi.fn()
  const mockFindContactInbox = vi.fn()

  const mockRepositoryCreate = vi.fn().mockResolvedValue({
    id: "msg-created",
    contactInboxId: "ci-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    messageType: "outgoing",
    contentType: "text",
    senderType: "bot",
    sourceId: null,
    text: "hello",
    contentAttributes: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  })

  const mockRepositoryCreateWithAttachments = vi.fn().mockResolvedValue({
    id: "msg-with-att",
    contactInboxId: "ci-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    messageType: "outgoing",
    contentType: "text",
    senderType: "bot",
    sourceId: null,
    text: null,
    contentAttributes: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    attachments: [],
  })

  const mockCreateMessageRepository = vi.fn().mockResolvedValue({
    create: mockRepositoryCreate,
    createWithAttachments: mockRepositoryCreateWithAttachments,
  })

  return {
    mockRepositoryCreate,
    mockRepositoryCreateWithAttachments,
    mockCreateMessageRepository,
    mockFindConversation,
    mockFindContactInbox,
    mockBroadcast: vi.fn(),
    mockEmit: vi.fn().mockResolvedValue(undefined),
    mockresolveTenantSettings: vi
      .fn()
      .mockResolvedValue({ storageUrl: "https://storage.example.com" }),
    mockResolveContactVariables: vi
      .fn()
      .mockImplementation(
        (_contactId: string, step: unknown, _source: unknown) =>
          Promise.resolve(step),
      ),
    mockResolveMediaUrl: vi.fn(
      async (
        ref: {
          attachmentId: string
          channel: string
          kind: "attachment"
          originPath: string
        },
        finalize: (key: string) => string | Promise<string>,
      ) => {
        if (ref.originPath.startsWith("failed:")) {
          return null
        }
        return ["messenger", "instagram", "whatsapp"].includes(ref.channel) &&
          HTTP_URL_RE.test(ref.originPath)
          ? `https://app.example.com/media/attachment/${ref.attachmentId}`
          : await finalize(ref.originPath)
      },
    ),
    mockUploadFileFromUrl: vi.fn().mockResolvedValue({
      originPath: "public/space/ws-1/conversations/conv-1/file-id",
      fileType: "image/jpeg",
      fileSize: 12_345,
      fileName: "image.jpg",
    }),
    mockSendFlowStepToChannel: vi
      .fn()
      .mockResolvedValue({ messageIds: ["provider-1"], sentCount: 1 }),
    mockSendMessageToChannel: vi
      .fn()
      .mockResolvedValue({ messageIds: ["provider-comment-1"], sentCount: 1 }),
    mockProcessWhatsappTemplate: vi
      .fn()
      .mockResolvedValue({ messageId: "msg-wa" }),
    mockProcessMessengerTemplate: vi
      .fn()
      .mockResolvedValue({ messageId: "msg-ms" }),
    mockRecordOutboundFlowStep: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    mockRecordOutboundMessageActivity: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
    mockInvalidateTracking: vi.fn().mockResolvedValue(undefined),
    mockConversationInvalidate: vi.fn().mockResolvedValue(undefined),
    mockFindAppointmentCalendarBySlug: vi.fn(),
    mockSignAppointmentWebviewToken: vi.fn().mockResolvedValue("webview-token"),
    mockMarkReadByOutbound: vi.fn().mockResolvedValue(true),
    mockPrepareProductMessage: vi.fn(),
    mockLogProviderErrorForChannel: vi.fn().mockResolvedValue(undefined),
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  botMessageFallbackReasons: {
    enum: {
      button_not_found: "button_not_found",
      handler_error_to_fallback: "handler_error_to_fallback",
      no_content: "no_content",
      unsupported_message_type: "unsupported_message_type",
    },
  },
  botMessageResults: { enum: { fallback: "fallback", success: "success" } },
  botMessageRouteTypes: {
    enum: { agent: "agent", fallback: "fallback", flow: "flow" },
  },
  trackingResponseTypes: {
    enum: {
      ai_agent: "ai_agent",
      automated_response: "automated_response",
      flow: "flow",
      none: "none",
    },
  },
}))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = { pick: vi.fn(() => schema) }
  return {
    createSelectSchema: vi.fn(() => schema),
    integrationWebchatModel: {},
    messageModel: { id: "id", sourceId: "sourceId" },
    contactInboxModel: { id: "id" },
    conversationModel: { id: "id", lastActivityAt: "lastActivityAt" },
  }
})

vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService: {
    findByPublicLinkSlug: mockFindAppointmentCalendarBySlug,
  },
  publishWorkspaceRealtimeEvent: mockBroadcast,
  queueWorkspaceRealtimeEvent: mockBroadcast,
  queueMessageCreatedEvent: (
    workspaceId: string,
    data: unknown,
    conversation: {
      assignedInboxTeamId?: string | null
      assignedUserId?: string | null
      inboxId?: string | null
    },
    inboxId?: string,
  ) => {
    const resolvedInboxId = inboxId ?? conversation.inboxId
    return mockBroadcast(workspaceId, {
      eventType: "messageCreated",
      data,
      route: {
        assignedTeamIds: conversation.assignedInboxTeamId
          ? [conversation.assignedInboxTeamId]
          : [],
        assignedUserIds: conversation.assignedUserId
          ? [conversation.assignedUserId]
          : [],
        ...(resolvedInboxId ? { inboxId: resolvedInboxId } : {}),
      },
    })
  },
  publishGuestRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  contactInboxService: {
    findByUncached: mockFindContactInbox,
    findRecentByContactId: mockFindContactInbox,
    recordSendFailure: mockRecordSendFailure,
    invalidateTracking: mockInvalidateTracking,
  },
  conversationService: {
    findByIdWithContactUnscoped: mockFindConversation,
    invalidate: mockConversationInvalidate,
    recordOutboundFlowStep: mockRecordOutboundFlowStep,
    recordOutboundMessageActivity: mockRecordOutboundMessageActivity,
    markReadByOutbound: mockMarkReadByOutbound,
  },
  productMessageService: { prepareOutgoing: mockPrepareProductMessage },
  resolveTenantSettings: mockresolveTenantSettings,
  messageService: {
    create: mockRepositoryCreate,
    createWithAttachments: (input: {
      attachments: unknown[]
      message: unknown
    }) => mockRepositoryCreateWithAttachments(input.message, input.attachments),
  },
  resolveMediaUrl: mockResolveMediaUrl,
}))

vi.mock("@chatbotx.io/business/error-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/business/error-log")>()
  return {
    ...actual,
    logProviderErrorForChannel: mockLogProviderErrorForChannel,
  }
})

vi.mock("@chatbotx.io/encryption", () => ({
  signAppointmentWebviewToken: mockSignAppointmentWebviewToken,
}))

// Its own subpath, not the barrel: `node:crypto` modules stay out of
// `@chatbotx.io/encryption`'s index so the builder's Edge bundle can load it.
// Only the HMAC is stubbed here — `@chatbotx.io/business/open-link` runs for
// real, so the exemptions it decides (same origin, self channel) stay covered.
vi.mock("@chatbotx.io/encryption/open-link-token", () => ({
  signOpenLinkUrl: vi.fn(() => "open-link-signature"),
  verifyOpenLinkUrl: vi.fn(() => true),
}))

// No step here carries an Open Mini App button, so the Mini App lookup is
// never reached; mocked only to keep its DB-backed module out of the import.
vi.mock("@chatbotx.io/business/mini-app", () => ({
  miniAppService: { findUnscoped: vi.fn() },
}))
vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: vi.fn((path: string, base: string) => `${base}/${path}`),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
  routeForConversation: vi.fn(
    (
      conversation: {
        assignedInboxTeamId?: string | null
        assignedUserId?: string | null
        inboxId?: string | null
      },
      inboxId?: string | null,
    ) => ({
      assignedTeamIds: conversation.assignedInboxTeamId
        ? [conversation.assignedInboxTeamId]
        : [],
      assignedUserIds: conversation.assignedUserId
        ? [conversation.assignedUserId]
        : [],
      inboxId: inboxId ?? conversation.inboxId,
    }),
  ),
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    parseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
    IntegrationException: class IntegrationException extends Error {},
  }
})

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "test-id") }
})

vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: mockResolveContactVariables,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadFileFromUrl: mockUploadFileFromUrl,
}))

vi.mock("@chatbotx.io/flow-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/flow-config")>()
  return { ...actual }
})

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {},
  resolveIntegrationContextFromContactInbox: vi.fn(),
}))

vi.mock("../src/chat/handlers/send-message", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/chat/handlers/send-message")>()
  return {
    ...actual,
    sendFlowStepToChannel: mockSendFlowStepToChannel,
    sendMessageToChannel: mockSendMessageToChannel,
    recordMessageSendError: vi.fn().mockResolvedValue(undefined),
    markConversationReadAfterDelivery: mockMarkReadByOutbound,
  }
})

vi.mock("../src/chat/handlers/send-messenger-template", () => ({
  processMessengerTemplate: mockProcessMessengerTemplate,
}))

vi.mock("../src/chat/handlers/send-whatsapp-template", () => ({
  processWhatsappTemplate: mockProcessWhatsappTemplate,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  BROADCAST_PAYLOAD_TYPE,
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import type { ChatJobSendFlowStep } from "@chatbotx.io/worker-config"

const { sendChatMessage, sendFlowStep } = await import(
  "../src/chat/handlers/send-flow-step"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type SendFlowStepData = ChatJobSendFlowStep["data"]

const fakeConversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  contact: { id: "contact-1" },
} as unknown as NonNullable<SendFlowStepData["conversationId"]>

const fakeContactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  channel: "messenger",
  contactId: "contact-1",
  sourceId: "src-ci-1",
  source: "messenger",
  lastMessageAt: new Date("2026-01-01T00:00:00Z"),
} as unknown as NonNullable<SendFlowStepData>

// sendText step — no url
const sendTextStep = {
  id: "step-1",
  nodeId: "node-1",
  stepType: "sendText",
  text: "hello from flow",
  buttons: [],
} as unknown as SendFlowStepData["step"]

// sendImage step — has url property
const sendImageStep = {
  id: "step-2",
  nodeId: "node-2",
  stepType: "sendImage",
  url: "https://example.com/img.jpg",
  buttons: [],
} as unknown as SendFlowStepData["step"]

const baseParams: SendFlowStepData = {
  conversationId: "conv-1",
  flowId: "flow-1",
  flowVersionId: "fv-1",
  step: sendTextStep,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendFlowStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindConversation.mockResolvedValue(fakeConversation)
    mockFindContactInbox.mockResolvedValue(fakeContactInbox)
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: mockRepositoryCreateWithAttachments,
    })
    mockresolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
      appUrl: "https://app.example.test",
    })
    mockResolveContactVariables.mockImplementation(
      (_contactId: string, step: unknown, _source: unknown) =>
        Promise.resolve(step),
    )
    mockRepositoryCreate.mockResolvedValue({
      id: "msg-created",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: "hello from flow",
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    })
    mockRepositoryCreateWithAttachments.mockResolvedValue({
      id: "msg-with-att",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: null,
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      attachments: [],
    })
    mockUploadFileFromUrl.mockResolvedValue({
      originPath: "public/space/ws-1/conversations/conv-1/test-id",
      fileType: "image/jpeg",
      fileSize: 12_345,
      fileName: "image.jpg",
    })
    mockSendFlowStepToChannel.mockResolvedValue({
      messageIds: ["provider-1"],
      sentCount: 1,
    })
    mockSendMessageToChannel.mockResolvedValue({
      messageIds: ["provider-comment-1"],
      sentCount: 1,
    })
    mockEmit.mockResolvedValue(undefined)
    mockFindAppointmentCalendarBySlug.mockResolvedValue(null)
    mockSignAppointmentWebviewToken.mockResolvedValue("webview-token")
    mockMarkReadByOutbound.mockResolvedValue(true)
  })

  test("returns early when conversation not found — repository not called", async () => {
    mockFindConversation.mockResolvedValue(null)

    await sendFlowStep(baseParams)

    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
  })

  test("returns early when contactInbox not found — repository not called", async () => {
    mockFindContactInbox.mockResolvedValue(null)

    await sendFlowStep(baseParams)

    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
  })

  test("forwards appointmentId when resolving contact variables", async () => {
    await sendFlowStep({
      ...baseParams,
      appointmentId: "appointment-1",
    })

    expect(mockResolveContactVariables).toHaveBeenCalledWith(
      "contact-1",
      sendTextStep,
      expect.objectContaining({
        appointmentId: "appointment-1",
      }),
      expect.anything(),
    )
  })

  test("forwards sentByUserId when resolving contact variables", async () => {
    await sendFlowStep({
      ...baseParams,
      sentByUserId: "user-1",
    })

    expect(mockResolveContactVariables).toHaveBeenCalledWith(
      "contact-1",
      sendTextStep,
      expect.objectContaining({ sentByUserId: "user-1" }),
      expect.anything(),
    )
  })

  test("does not set sentByUserId when the flow was not sent by an inbox user", async () => {
    await sendFlowStep(baseParams)

    const source = mockResolveContactVariables.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >
    expect(source).not.toHaveProperty("sentByUserId")
  })

  // Only deliverable steps reach this resolve, so every string in them is
  // author copy — unlike the external-request/JavaScript handlers, which
  // resolve separately and must leave `{a|b}` alone.
  test("opts into spintax when resolving a deliverable step", async () => {
    await sendFlowStep(baseParams)

    expect(mockResolveContactVariables).toHaveBeenCalledWith(
      "contact-1",
      sendTextStep,
      expect.anything(),
      { spintax: true },
    )
  })

  test("skips non-deliverable AI steps instead of sending an empty channel message", async () => {
    const aiAnalyzeImageStep = {
      id: "step-ai-image",
      nodeId: "node-ai",
      stepType: "aiAnalyzeImage",
      provider: "openaiCompatible",
      integrationId: "integration-1",
      model: "vision-model",
      prompt: "Describe this image",
      inputFieldId: "image-field",
      outputFieldId: "output-field",
      temperature: 0.4,
      maxOutputTokens: 512,
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({ ...baseParams, step: aiAnalyzeImageStep })

    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockRepositoryCreateWithAttachments).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
  })

  test("skips blank sendText steps instead of sending an empty Messenger payload", async () => {
    const blankSendTextStep = {
      ...sendTextStep,
      text: "",
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({ ...baseParams, step: blankSendTextStep })

    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockRepositoryCreateWithAttachments).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
  })

  test.each([
    ["sendQuickReply", { message: "   ", quickReplies: [] }],
    ["whatsappCallButton", { text: "   ", buttonLabel: "Call" }],
    ["sendViewCatalog", { text: "   ", footer: "", thumbnailProductId: "" }],
  ])("skips a whitespace-only %s step instead of sending an empty message", async (stepType, fields) => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "whatsapp",
    })
    const blankStep = {
      id: "step-blank",
      nodeId: "node-blank",
      stepType,
      ...fields,
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({ ...baseParams, step: blankStep })

    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
  })

  test.each([
    ["sendText", { text: "Hello", buttons: [] }],
    ["whatsappCallButton", { text: "Hello", buttonLabel: "Call" }],
    [
      "sendViewCatalog",
      { text: "Hello", footer: "Bye", thumbnailProductId: "sku-1" },
    ],
  ])("stores the %s body as the message text so the inbox shows it", async (stepType, fields) => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "whatsapp",
    })
    const step = {
      id: "step-text",
      nodeId: "node-text",
      stepType,
      ...fields,
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({ ...baseParams, step })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello" }),
    )
    expect(mockSendFlowStepToChannel).toHaveBeenCalledTimes(1)
  })

  test("marks a sendViewCatalog message with its resolved footer so the inbox can show the catalog button", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "whatsapp",
    })
    const step = {
      id: "step-catalog",
      nodeId: "node-catalog",
      stepType: "sendViewCatalog",
      text: "Browse",
      footer: "Free shipping",
      thumbnailProductId: "sku-1",
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({ ...baseParams, step })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          viewCatalog: { footer: "Free shipping" },
        }),
      }),
    )
  })

  test("does not mark other text steps as a view-catalog message", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "whatsapp",
    })
    const step = {
      id: "step-text-plain",
      nodeId: "node-text-plain",
      stepType: "sendText",
      text: "Hello",
      buttons: [],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({ ...baseParams, step })

    expect(
      mockRepositoryCreate.mock.calls.at(-1)?.[0]?.contentAttributes,
    ).not.toHaveProperty("viewCatalog")
  })

  test("skips a step the RESOLVED channel's policy marks unsupported (omnichannel sendCard reaching Telegram)", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "telegram",
    })
    const cardStep = {
      id: "step-card-telegram",
      nodeId: "node-card",
      stepType: "sendCard",
      cards: [{ id: "card-1", title: "Card", buttons: [] }],
      buttons: [],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({ ...baseParams, step: cardStep })

    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockRepositoryCreateWithAttachments).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
  })

  describe("whatsappLocation step", () => {
    const locationStep = {
      id: "step-location",
      nodeId: "node-location",
      stepType: "whatsappLocation",
      name: "Head office",
      address: "1 Main St",
      latitude: 15.5614,
      longitude: 108.4867,
    } as unknown as SendFlowStepData["step"]

    test("stores a location message with its coordinates on WhatsApp", async () => {
      mockFindContactInbox.mockResolvedValue({
        ...fakeContactInbox,
        channel: "whatsapp",
      })

      await sendFlowStep({ ...baseParams, step: locationStep })

      expect(mockRepositoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "location",
          text: "Head office: 1 Main St",
          contentAttributes: expect.objectContaining({
            latitude: "15.5614",
            longitude: "108.4867",
            name: "Head office",
            address: "1 Main St",
            stepId: "step-location",
          }),
        }),
      )
      expect(mockSendFlowStepToChannel).toHaveBeenCalledTimes(1)
    })

    test("skips the step when an omnichannel flow reaches a non-WhatsApp contact", async () => {
      await sendFlowStep({ ...baseParams, step: locationStep })

      expect(mockRepositoryCreate).not.toHaveBeenCalled()
      expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
    })
  })

  test("calls repository.create() for step without url (sendText)", async () => {
    await sendFlowStep({
      ...baseParams,
      sendFrom: "inbox",
      step: sendTextStep,
    })

    expect(mockRepositoryCreate).toHaveBeenCalledTimes(1)
    expect(mockRepositoryCreateWithAttachments).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: "outgoing",
        senderType: "bot",
        workspaceId: "ws-1",
        conversationId: "conv-1",
      }),
    )
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        botSentAnalytics: {
          triggerHandler: "sendFlowStep",
          triggerType: "message_bot_sent_flow",
        },
        sendFrom: "inbox",
      }),
    )
    expect(mockResolveContactVariables).toHaveBeenCalledWith(
      "contact-1",
      sendTextStep,
      expect.objectContaining({
        contactInbox: expect.objectContaining({ id: "ci-1" }),
      }),
      expect.anything(),
    )
  })

  test("uses the job contactInboxId instead of falling back to the latest inbox", async () => {
    const broadcastContactInbox = {
      ...fakeContactInbox,
      id: "ci-broadcast",
      sourceId: "src-ci-broadcast",
    } as unknown as typeof fakeContactInbox
    mockFindContactInbox.mockResolvedValueOnce(broadcastContactInbox)

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-broadcast",
      isBulkBroadcast: true,
      metadata: {
        type: "broadcast",
        broadcastId: "broadcast-1",
        contactInboxId: "ci-broadcast",
      },
    })

    expect(mockFindContactInbox).toHaveBeenCalledWith({
      where: {
        id: "ci-broadcast",
        contactId: "contact-1",
      },
    })
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contactInboxId: "ci-broadcast",
        contentAttributes: expect.objectContaining({
          metadata: expect.objectContaining({
            type: "broadcast",
            contactInboxId: "ci-broadcast",
          }),
        }),
      }),
    )
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        contactInbox: expect.objectContaining({ id: "ci-broadcast" }),
        messageId: "msg-created",
      }),
    )
    expect(mockBroadcast).not.toHaveBeenCalled()
    expect(mockRecordOutboundFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({ bumpActivity: false }),
    )
    expect(mockMarkReadByOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true }),
    )
  })

  test("publishes a broadcast button continuation with preserved metadata", async () => {
    await sendFlowStep({
      ...baseParams,
      metadata: {
        type: "broadcast",
        broadcastId: "broadcast-1",
        contactInboxId: "ci-1",
      },
    })

    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "messageCreated" }),
    )
    expect(mockRecordOutboundFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        bumpActivity: true,
        // Proactive broadcast sends never close the waiting window.
        closeHumanReplyWindow: false,
      }),
    )
    expect(mockMarkReadByOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ silent: false }),
    )
  })

  test("a plain bot flow step closes the human reply window", async () => {
    await sendFlowStep(baseParams)

    expect(mockRecordOutboundFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({ closeHumanReplyWindow: true }),
    )
  })

  test("an inbox-originated flow step leaves the window to the producer claim", async () => {
    await sendFlowStep({ ...baseParams, sendFrom: "inbox" })

    expect(mockRecordOutboundFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({ closeHumanReplyWindow: false }),
    )
  })

  test("sequence schedule and bulk broadcast steps keep the window open", async () => {
    await sendFlowStep({
      ...baseParams,
      metadata: { type: "sequenceSchedule" },
    })
    await sendFlowStep({
      ...baseParams,
      isBulkBroadcast: true,
      metadata: { type: "broadcast", broadcastId: "b", contactInboxId: "ci-1" },
    })

    expect(mockRecordOutboundFlowStep).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ closeHumanReplyWindow: false }),
    )
    expect(mockRecordOutboundFlowStep).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ closeHumanReplyWindow: false }),
    )
  })

  test("keeps a second automatic broadcast step out of realtime and the inbox sort", async () => {
    await sendFlowStep({
      ...baseParams,
      isBulkBroadcast: true,
      metadata: {
        type: "broadcast",
        broadcastId: "broadcast-1",
        contactInboxId: "ci-1",
      },
      step: { ...sendTextStep, id: "step-2" },
    })

    expect(mockBroadcast).not.toHaveBeenCalled()
    expect(mockRecordOutboundFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({ bumpActivity: false }),
    )
    expect(mockMarkReadByOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true }),
    )
  })

  test("signs pasted appointment booking links at send time", async () => {
    mockFindAppointmentCalendarBySlug.mockResolvedValueOnce({
      id: "calendar-1",
    })
    const bookingButtonStep = {
      ...sendTextStep,
      buttons: [
        {
          id: "button-1",
          label: "Book appointment",
          buttonType: "openWebsite",
          beforeStep: {
            id: "before-1",
            stepType: "openWebsite",
            url: "https://app.example.test/booking/public-slug",
            browserSize: 100,
          },
          steps: [],
        },
      ],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: bookingButtonStep,
    })

    expect(mockFindAppointmentCalendarBySlug).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      publicLinkSlug: "public-slug",
    })
    expect(mockSignAppointmentWebviewToken).toHaveBeenCalledWith({
      mode: "book",
      workspaceId: "ws-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "fv-1",
      stepId: "step-1",
    })
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({
          buttons: [
            expect.objectContaining({
              beforeStep: expect.objectContaining({
                url: "https://app.example.test/booking/picker?token=webview-token",
              }),
            }),
          ],
        }),
      }),
    )
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          payload: expect.objectContaining({
            buttons: [
              expect.objectContaining({
                url: "https://app.example.test/booking/picker?token=webview-token",
              }),
            ],
          }),
        }),
      }),
    )
  })

  test("signs pasted appointment booking links from another origin", async () => {
    mockFindAppointmentCalendarBySlug.mockResolvedValueOnce({
      id: "calendar-1",
    })
    const bookingButtonStep = {
      ...sendTextStep,
      buttons: [
        {
          id: "button-1",
          label: "Book appointment",
          buttonType: "openWebsite",
          beforeStep: {
            id: "before-1",
            stepType: "openWebsite",
            url: "https://other.example.test/booking/public-slug",
            browserSize: 100,
          },
          steps: [],
        },
      ],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: bookingButtonStep,
    })

    expect(mockFindAppointmentCalendarBySlug).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      publicLinkSlug: "public-slug",
    })
    expect(mockSignAppointmentWebviewToken).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        calendarId: "calendar-1",
      }),
    )
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({
          buttons: [
            expect.objectContaining({
              beforeStep: expect.objectContaining({
                url: "https://app.example.test/booking/picker?token=webview-token",
              }),
            }),
          ],
        }),
      }),
    )
  })

  // -------------------------------------------------------------------------
  // Deep-link interstitial (`/go`)
  // -------------------------------------------------------------------------

  const openWebsiteStep = (url: string) =>
    ({
      ...sendTextStep,
      buttons: [
        {
          id: "button-1",
          label: "Open",
          buttonType: "openWebsite",
          beforeStep: {
            id: "before-1",
            stepType: "openWebsite",
            url,
            browserSize: 100,
          },
          steps: [],
        },
      ],
    }) as unknown as SendFlowStepData["step"]

  const sentButtonUrl = () =>
    mockSendFlowStepToChannel.mock.calls.at(-1)?.[0]?.step?.buttons?.[0]
      ?.beforeStep?.url

  const persistedButtonUrl = () =>
    mockRepositoryCreate.mock.calls.at(-1)?.[0]?.contentAttributes?.payload
      ?.buttons?.[0]?.url

  const GO_PREFIX = "https://app.example.test/go/ws-1?u="

  test("routes an open-website button through the interstitial, in both sinks", async () => {
    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: openWebsiteStep("https://zalo.me/g/owfqvp123"),
    })

    // The wire payload and the persisted Message row are encoded separately and
    // must not drift — that is the whole reason the rewrite happens upstream of
    // both.
    expect(sentButtonUrl()).toContain(GO_PREFIX)
    expect(persistedButtonUrl()).toBe(sentButtonUrl())
  })

  test("leaves every link outside the deep-link table untouched", async () => {
    // The detour exists to open a native app. A link it cannot open gains
    // nothing from it and would only put the builder in the path of a link that
    // worked fine without it.
    const url = "https://example.com/promo"

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: openWebsiteStep(url),
    })

    expect(sentButtonUrl()).toBe(url)
    expect(persistedButtonUrl()).toBe(url)
  })

  test("leaves a magic link alone so its click code can still be attached", async () => {
    // Covered twice over — a magic link is not in the deep-link table, and it is
    // same-origin. Pinned because the second guard is what stops a future table
    // entry from breaking attribution: `appendCodeToMagicLink` recognises magic
    // links by a `^/r/` pathname regex, so wrapping one means `?code=` is never
    // attached and every click on it goes unattributed.
    const magicLink = "https://app.example.test/r/ws-1/promo"

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: openWebsiteStep(magicLink),
    })

    expect(sentButtonUrl()).toBe(magicLink)
  })

  test("still routes an m.me link sent over Messenger", async () => {
    // The self-channel exemption must not catch this one: `m.me` inside
    // Messenger's own iOS webview is exactly the case that does nothing, so the
    // rule carries no channel and the link takes the detour.
    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: openWebsiteStep("https://m.me/9679565075442614"),
    })

    expect(sentButtonUrl()).toContain(GO_PREFIX)
  })

  test("leaves a Zalo link alone when the message goes out over Zalo", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "zalo",
    })
    const url = "https://zalo.me/g/owfqvp123"

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: openWebsiteStep(url),
    })

    expect(sentButtonUrl()).toBe(url)
  })

  test("routes card buttons and quick replies through the interstitial", async () => {
    const cardStep = {
      id: "step-1",
      nodeId: "node-1",
      stepType: "sendCard",
      cards: [
        {
          id: "card-1",
          title: "Card",
          buttons: [
            {
              id: "button-1",
              label: "Open",
              buttonType: "openWebsite",
              beforeStep: {
                id: "before-1",
                stepType: "openWebsite",
                url: "https://zalo.me/g/owfqvp123",
                browserSize: 100,
              },
              steps: [],
            },
          ],
        },
      ],
      buttons: [],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: cardStep,
      quickReplies: [
        {
          id: "qr-1",
          label: "Open",
          buttonType: "openWebsite",
          beforeStep: {
            id: "before-qr-1",
            stepType: "openWebsite",
            url: "https://zalo.me/g/quickreply1",
            browserSize: 100,
          },
          steps: [],
        },
      ],
    } as unknown as SendFlowStepData)

    const call = mockSendFlowStepToChannel.mock.calls.at(-1)?.[0]
    expect(call?.step?.cards?.[0]?.buttons?.[0]?.beforeStep?.url).toContain(
      GO_PREFIX,
    )
    expect(call?.quickReplies?.[0]?.url).toContain(GO_PREFIX)
  })

  test.each([
    ["broadcast", { type: "broadcast", broadcastId: "bc-1" }],
    ["sequence", { type: "sequence_schedule", sequenceStepId: "seq-step-1" }],
  ])("routes %s buttons through the interstitial as well", async (_label, metadata) => {
    // Broadcasts and sequences reach the channel through this same handler,
    // so they are covered by construction — pinned here because that is a
    // conclusion about a call chain, not something visible in this file.
    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: openWebsiteStep("https://zalo.me/g/owfqvp123"),
      metadata,
    } as unknown as SendFlowStepData)

    expect(sentButtonUrl()).toContain(GO_PREFIX)
  })

  test("signs latest-version appointment booking links with executed version", async () => {
    mockFindAppointmentCalendarBySlug.mockResolvedValueOnce({
      id: "calendar-1",
    })
    const bookingButtonStep = {
      ...sendTextStep,
      buttons: [
        {
          id: "button-1",
          label: "Book appointment",
          buttonType: "openWebsite",
          beforeStep: {
            id: "before-1",
            stepType: "openWebsite",
            url: "https://builder.chatbotx.online/booking/public-slug",
            browserSize: 100,
          },
          steps: [],
        },
      ],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({
      ...baseParams,
      flowVersionId: undefined,
      executedFlowVersionId: "fv-latest",
      contactInboxId: "ci-1",
      step: bookingButtonStep,
    })

    expect(mockSignAppointmentWebviewToken).toHaveBeenCalledWith({
      mode: "book",
      workspaceId: "ws-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "fv-latest",
      stepId: "step-1",
    })
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          payload: expect.objectContaining({
            buttons: [
              expect.objectContaining({
                url: "https://app.example.test/booking/picker?token=webview-token",
              }),
            ],
          }),
        }),
      }),
    )
  })

  test("does not sign appointment booking links when flowVersionId is missing", async () => {
    const bookingButtonStep = {
      ...sendTextStep,
      buttons: [
        {
          id: "button-1",
          label: "Book appointment",
          buttonType: "openWebsite",
          beforeStep: {
            id: "before-1",
            stepType: "openWebsite",
            url: "https://app.example.test/booking/public-slug",
            browserSize: 100,
          },
          steps: [],
        },
      ],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({
      ...baseParams,
      flowVersionId: undefined,
      contactInboxId: "ci-1",
      step: bookingButtonStep,
    })

    expect(mockFindAppointmentCalendarBySlug).not.toHaveBeenCalled()
    expect(mockSignAppointmentWebviewToken).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({
          buttons: [
            expect.objectContaining({
              beforeStep: expect.objectContaining({
                url: "https://app.example.test/booking/public-slug",
              }),
            }),
          ],
        }),
      }),
    )
  })

  test("does not sign non-booking open website links", async () => {
    const nonBookingButtonStep = {
      ...sendTextStep,
      buttons: [
        {
          id: "button-1",
          label: "Open docs",
          buttonType: "openWebsite",
          beforeStep: {
            id: "before-1",
            stepType: "openWebsite",
            url: "https://app.example.test/docs",
            browserSize: 100,
          },
          steps: [],
        },
      ],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: nonBookingButtonStep,
    })

    expect(mockFindAppointmentCalendarBySlug).not.toHaveBeenCalled()
    expect(mockSignAppointmentWebviewToken).not.toHaveBeenCalled()
  })

  test("signs pasted appointment booking links inside carousel cards", async () => {
    mockFindAppointmentCalendarBySlug.mockResolvedValueOnce({
      id: "calendar-1",
    })
    const carouselStep = {
      id: "carousel-step",
      nodeId: "node-1",
      stepType: "sendCarousel",
      layout: "horizontal",
      cards: [
        {
          id: "card-1",
          nodeId: "node-1",
          stepType: "sendCard",
          title: "Demo Calendar",
          subtitle: "",
          buttons: [
            {
              id: "button-1",
              label: "Book appointment",
              buttonType: "openWebsite",
              beforeStep: {
                id: "before-1",
                stepType: "openWebsite",
                url: "https://app.example.test/booking/public-slug",
                browserSize: 100,
              },
              steps: [],
            },
          ],
        },
      ],
    } as unknown as SendFlowStepData["step"]

    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      step: carouselStep,
    })

    expect(mockSignAppointmentWebviewToken).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "flow-1",
        flowVersionId: "fv-1",
        stepId: "carousel-step",
      }),
    )
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({
          cards: [
            expect.objectContaining({
              buttons: [
                expect.objectContaining({
                  beforeStep: expect.objectContaining({
                    url: "https://app.example.test/booking/picker?token=webview-token",
                  }),
                }),
              ],
            }),
          ],
        }),
      }),
    )
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          payload: expect.objectContaining({
            cards: [
              expect.objectContaining({
                buttons: [
                  expect.objectContaining({
                    url: "https://app.example.test/booking/picker?token=webview-token",
                  }),
                ],
              }),
            ],
          }),
        }),
      }),
    )
  })

  test("emits message:sent for a 24h broadcast flow step with message and provider ids", async () => {
    await sendFlowStep({
      ...baseParams,
      contactInboxId: "ci-1",
      metadata: {
        type: "broadcast",
        broadcastId: "broadcast-1",
        contactInboxId: "ci-1",
      },
    })

    expect(mockEmit).toHaveBeenCalledWith(
      "message:sent",
      expect.objectContaining({
        context: expect.objectContaining({
          contactInboxId: "ci-1",
          contactId: "contact-1",
          workspaceId: "ws-1",
        }),
        action: expect.objectContaining({
          flowId: "flow-1",
          flowVersionId: "fv-1",
          messageId: "msg-created",
          sourceId: "provider-1",
        }),
        metadata: expect.objectContaining({
          type: "broadcast",
          broadcastId: "broadcast-1",
          contactInboxId: "ci-1",
        }),
      }),
    )
  })

  test("persists and forwards rich response metadata to channel sender", async () => {
    const richResponse = {
      executionId: "exec-1",
      buttonPayloads: {
        "button-1": {
          executionId: "exec-1",
          buttonId: "button-1",
          payload: {
            type: "actions" as const,
            actions: [{ action: "add_tag", tag_name: "lead" }],
          },
        },
      },
    }

    await sendFlowStep({
      ...baseParams,
      richResponse,
      step: sendTextStep,
    })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({ richResponse }),
      }),
    )
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({ richResponse }),
    )
  })

  test("forwards and persists quick replies on the carrier message", async () => {
    const quickReplies = [
      {
        id: "qr-1",
        label: "Yes",
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
    ]
    const stepWithButtons = {
      ...sendTextStep,
      buttons: [
        {
          id: "btn-1",
          label: "Existing",
          buttonType: null,
          beforeStep: null,
          steps: [],
        },
      ],
    }

    await sendFlowStep({
      ...baseParams,
      step: stepWithButtons,
      quickReplies,
    } as SendFlowStepData & { quickReplies: typeof quickReplies })

    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        quickReplies: [
          expect.objectContaining({
            id: "qr-1",
            label: "Yes",
            buttonType: "postback",
            postback: expect.stringContaining("flow-1"),
          }),
        ],
      }),
    )
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          payload: expect.objectContaining({
            buttons: expect.arrayContaining([
              expect.objectContaining({ id: "btn-1", label: "Existing" }),
              expect.objectContaining({ id: "qr-1", label: "Yes" }),
            ]),
          }),
        }),
      }),
    )
  })

  test("calls repository.createWithAttachments() for step with url (sendImage)", async () => {
    await sendFlowStep({ ...baseParams, step: sendImageStep })

    expect(mockUploadFileFromUrl).toHaveBeenCalledWith(
      "https://example.com/img.jpg",
      expect.stringContaining("public/space/ws-1/conversations/conv-1/"),
    )
    expect(mockRepositoryCreateWithAttachments).toHaveBeenCalledTimes(1)
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
  })

  test("decorates a mirrored flow attachment without mutating the repository row", async () => {
    const repositoryMessage = {
      id: "msg-with-att",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: null,
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      attachments: [
        {
          id: "att-mirrored",
          originPath: "public/space/ws-1/conversations/conv-1/mirrored.jpg",
        },
      ],
    }
    mockRepositoryCreateWithAttachments.mockResolvedValueOnce(repositoryMessage)

    await sendFlowStep({ ...baseParams, step: sendImageStep })

    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-with-att",
      }),
    )
    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              url: "https://storage.example.com/public/space/ws-1/conversations/conv-1/mirrored.jpg",
            }),
          ],
        }),
      }),
    )
    expect(repositoryMessage.attachments[0]).not.toHaveProperty("url")
  })

  test.each([
    "tiktok",
    "api",
  ])("finalizes a fresh mirrored attachment for the %s channel", async (channel) => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel,
    })
    mockRepositoryCreateWithAttachments.mockResolvedValueOnce({
      id: `msg-${channel}`,
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: null,
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      attachments: [
        {
          id: `att-${channel}`,
          originPath: `public/space/ws-1/conversations/conv-1/${channel}.jpg`,
        },
      ],
    })

    await sendFlowStep({ ...baseParams, step: sendImageStep })

    expect(mockResolveMediaUrl).toHaveBeenCalledWith(
      expect.objectContaining({ channel }),
      expect.any(Function),
    )
    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              url: `https://storage.example.com/public/space/ws-1/conversations/conv-1/${channel}.jpg`,
            }),
          ],
        }),
      }),
    )
  })

  test("keeps a mirrored flow attachment's public URL unchanged", async () => {
    mockRepositoryCreateWithAttachments.mockResolvedValueOnce({
      id: "msg-with-att",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: null,
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      attachments: [
        {
          id: "att-mirrored",
          originPath: "public/space/ws-1/messages/a.jpg",
        },
      ],
    })

    await sendFlowStep({ ...baseParams, step: sendImageStep })

    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              url: "https://storage.example.com/public/space/ws-1/messages/a.jpg",
            }),
          ],
        }),
      }),
    )
  })

  test("does NOT call db.insert directly for message creation — goes through the message repository", async () => {
    await sendFlowStep({ ...baseParams, step: sendTextStep })

    expect(mockRepositoryCreate).toHaveBeenCalledTimes(1)
  })

  test("updates contact inbox lastMessageAt and conversation lastActivityAt after creating a flow message", async () => {
    await sendFlowStep({ ...baseParams, step: sendTextStep })

    const createdMessage = await mockRepositoryCreate.mock.results[0]?.value
    expect(mockRecordOutboundFlowStep).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      at: createdMessage.createdAt,
      bumpActivity: true,
      closeHumanReplyWindow: true,
      lastStep: undefined,
      currentStep: "step-1",
    })
    expect(mockInvalidateTracking).toHaveBeenCalledWith({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
    expect(mockConversationInvalidate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["conv-1"],
    })
    expect(mockMarkReadByOutbound).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      inboxId: "inbox-1",
      readAt: createdMessage.createdAt,
      silent: false,
    })
  })

  test("does not mark the conversation read when a flow send accepts no messages", async () => {
    mockSendFlowStepToChannel.mockResolvedValueOnce({
      messageIds: [],
      sentCount: 0,
    })

    await sendFlowStep(baseParams)

    expect(mockMarkReadByOutbound).not.toHaveBeenCalled()
  })

  test("marks the conversation read for a broadcast flow send", async () => {
    await sendFlowStep({
      ...baseParams,
      metadata: { broadcastId: "broadcast-1" },
    })

    expect(mockMarkReadByOutbound).toHaveBeenCalledTimes(1)
  })

  test("does not mark the conversation read when no message row was created", async () => {
    mockRepositoryCreate.mockResolvedValueOnce(undefined)

    await sendFlowStep(baseParams)

    expect(mockMarkReadByOutbound).not.toHaveBeenCalled()
  })

  test("delegates to processWhatsappTemplate for sendWaTemplateMessage step — does not call createMessageRepository directly", async () => {
    const waStep = {
      id: "step-wa",
      nodeId: "node-wa",
      stepType: "sendWaTemplateMessage",
      template: { id: "tmpl-1", name: "template", language: "en", params: {} },
      buttons: [],
    } as unknown as SendFlowStepData["step"]

    const waContactInbox = {
      ...fakeContactInbox,
      channel: "whatsapp",
    } as unknown as typeof fakeContactInbox
    mockFindContactInbox.mockResolvedValue(waContactInbox)

    await sendFlowStep({ ...baseParams, step: waStep })

    expect(mockProcessWhatsappTemplate).toHaveBeenCalled()
    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
  })

  test("hands the inbox sender to processWhatsappTemplate for a template step", async () => {
    const waStep = {
      id: "step-wa",
      nodeId: "node-wa",
      stepType: "sendWaTemplateMessage",
      template: { id: "tmpl-1", name: "template", language: "en", params: {} },
      buttons: [],
    } as unknown as SendFlowStepData["step"]
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "whatsapp",
    } as unknown as typeof fakeContactInbox)

    await sendFlowStep({ ...baseParams, step: waStep, sentByUserId: "user-1" })

    expect(mockProcessWhatsappTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ sentByUserId: "user-1" }),
    )
  })

  test("delegates to processMessengerTemplate for sendMessengerTemplateMessage step — does not call createMessageRepository directly", async () => {
    const msStep = {
      id: "step-ms",
      nodeId: "node-ms",
      stepType: "sendMessengerTemplateMessage",
      template: {
        id: "tmpl-2",
        name: "ms-template",
        language: "en",
        parameterFormat: "POSITIONAL",
        params: {},
      },
      buttons: [],
    } as unknown as SendFlowStepData["step"]

    const msContactInbox = {
      ...fakeContactInbox,
      channel: "messenger",
    } as unknown as typeof fakeContactInbox
    mockFindContactInbox.mockResolvedValue(msContactInbox)

    await sendFlowStep({ ...baseParams, step: msStep })

    expect(mockProcessMessengerTemplate).toHaveBeenCalled()
    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
  })

  test("hands the inbox sender to processMessengerTemplate for a template step", async () => {
    const msStep = {
      id: "step-ms",
      nodeId: "node-ms",
      stepType: "sendMessengerTemplateMessage",
      template: {
        id: "tmpl-2",
        name: "ms-template",
        language: "en",
        parameterFormat: "POSITIONAL",
        params: {},
      },
      buttons: [],
    } as unknown as SendFlowStepData["step"]
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "messenger",
    } as unknown as typeof fakeContactInbox)

    await sendFlowStep({ ...baseParams, step: msStep, sentByUserId: "user-1" })

    expect(mockProcessMessengerTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ sentByUserId: "user-1" }),
    )
  })

  test("forwards a private commentAnchor to sendFlowStepToChannel when the resolved contactInbox is messenger", async () => {
    await sendFlowStep({
      ...baseParams,
      commentAnchor: { commentId: "comment-1", replyChannel: "private" },
    })

    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        commentAnchor: { commentId: "comment-1", replyChannel: "private" },
      }),
    )
    expect(mockSendMessageToChannel).not.toHaveBeenCalled()
  })

  test("forwards a private commentAnchor when the resolved contactInbox is instagram", async () => {
    const instagramContactInbox = {
      ...fakeContactInbox,
      channel: "instagram",
    } as unknown as typeof fakeContactInbox
    mockFindContactInbox.mockResolvedValue(instagramContactInbox)

    await sendFlowStep({
      ...baseParams,
      commentAnchor: { commentId: "comment-1", replyChannel: "private" },
    })

    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        commentAnchor: { commentId: "comment-1", replyChannel: "private" },
      }),
    )
    expect(mockSendMessageToChannel).not.toHaveBeenCalled()
  })

  test("suppresses a private commentAnchor when the resolved contactInbox is neither messenger nor instagram", async () => {
    const webchatContactInbox = {
      ...fakeContactInbox,
      channel: "webchat",
    } as unknown as typeof fakeContactInbox
    mockFindContactInbox.mockResolvedValue(webchatContactInbox)

    await sendFlowStep({
      ...baseParams,
      commentAnchor: { commentId: "comment-1", replyChannel: "private" },
    })

    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({ commentAnchor: undefined }),
    )
    expect(mockSendMessageToChannel).not.toHaveBeenCalled()
  })

  test("routes to sendMessageToChannel with a type:comment message when commentAnchor.replyChannel is public", async () => {
    await sendFlowStep({
      ...baseParams,
      commentAnchor: { commentId: "comment-1", replyChannel: "public" },
    })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "comment",
        contentAttributes: expect.objectContaining({
          replyToCommentId: "comment-1",
        }),
      }),
    )
    expect(mockSendMessageToChannel).toHaveBeenCalledOnce()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
    expect(mockMarkReadByOutbound).not.toHaveBeenCalled()
  })

  test("routes to sendMessageToChannel for a public commentAnchor even when the contactInbox is instagram", async () => {
    const instagramContactInbox = {
      ...fakeContactInbox,
      channel: "instagram",
    } as unknown as typeof fakeContactInbox
    mockFindContactInbox.mockResolvedValue(instagramContactInbox)

    await sendFlowStep({
      ...baseParams,
      commentAnchor: { commentId: "comment-1", replyChannel: "public" },
    })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "comment",
        contentAttributes: expect.objectContaining({
          replyToCommentId: "comment-1",
        }),
      }),
    )
    expect(mockSendMessageToChannel).toHaveBeenCalledOnce()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
    expect(mockMarkReadByOutbound).not.toHaveBeenCalled()
  })

  // A public anchor now survives every step of the run, so a media step reaches
  // the comment channel too — with its attachment on the row, which is what
  // makes an unsupported send (Instagram comment replies are text-only) show up
  // as a failed message in the inbox instead of vanishing.
  test("routes a media step with a public commentAnchor through the comment channel, attachment included", async () => {
    const instagramContactInbox = {
      ...fakeContactInbox,
      channel: "instagram",
    } as unknown as typeof fakeContactInbox
    mockFindContactInbox.mockResolvedValue(instagramContactInbox)

    await sendFlowStep({
      ...baseParams,
      step: sendImageStep,
      commentAnchor: { commentId: "comment-1", replyChannel: "public" },
    })

    expect(mockRepositoryCreateWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "comment",
        contentAttributes: expect.objectContaining({
          replyToCommentId: "comment-1",
        }),
      }),
      expect.arrayContaining([
        expect.objectContaining({ workspaceId: "ws-1" }),
      ]),
    )
    expect(mockSendMessageToChannel).toHaveBeenCalledOnce()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
  })
})

describe("sendChatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: mockRepositoryCreateWithAttachments,
    })
    mockresolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
    })
    mockRepositoryCreate.mockResolvedValue({
      id: "msg-chat",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: "hello from chat",
      contentAttributes: {},
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    })
  })

  test("updates contact inbox lastMessageAt and conversation lastActivityAt after creating a chat message", async () => {
    await sendChatMessage({
      conversation: fakeConversation as never,
      contactInbox: fakeContactInbox as never,
      text: "hello from chat",
    })

    const createdMessage = await mockRepositoryCreate.mock.results[0]?.value
    expect(mockRecordOutboundMessageActivity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      at: createdMessage.createdAt,
      bumpActivity: true,
      closeHumanReplyWindow: true,
    })
    expect(mockInvalidateTracking).toHaveBeenCalledWith({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
  })

  test("uses the resolved fallback inbox when routing the realtime message", async () => {
    mockFindContactInbox.mockResolvedValue(fakeContactInbox)

    await sendChatMessage({
      conversation: fakeConversation as never,
      text: "hello from chat",
    })

    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        route: expect.objectContaining({ inboxId: fakeContactInbox.inboxId }),
      }),
    )
  })

  test("keeps a broadcast continuation visible in realtime and the inbox sort", async () => {
    await sendChatMessage({
      conversation: fakeConversation as never,
      contactInbox: fakeContactInbox as never,
      text: "broadcast follow-up",
      metadata: { type: "broadcast", broadcastId: "b-1" } as never,
    })

    expect(mockRecordOutboundMessageActivity).toHaveBeenCalledWith(
      expect.objectContaining({ bumpActivity: true }),
    )
    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "messageCreated" }),
    )
  })

  test("keeps an initial broadcast chat prompt out of realtime and the inbox sort", async () => {
    await sendChatMessage({
      conversation: fakeConversation as never,
      contactInbox: fakeContactInbox as never,
      text: "broadcast prompt",
      metadata: { type: "broadcast", broadcastId: "b-1" } as never,
      isBulkBroadcast: true,
    })

    expect(mockRecordOutboundMessageActivity).toHaveBeenCalledWith(
      expect.objectContaining({ bumpActivity: false }),
    )
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  test("falls back to text url when chat message media download fails", async () => {
    mockUploadFileFromUrl.mockRejectedValueOnce(
      new Error("Failed to download file: 403"),
    )

    await sendChatMessage({
      conversation: fakeConversation as never,
      contactInbox: fakeContactInbox as never,
      url: "https://storage.googleapis.com/private/image.png",
    })

    expect(mockRepositoryCreateWithAttachments).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "https://storage.googleapis.com/private/image.png",
      }),
    )
  })

  test("broadcasts a null URL when defensive resolution marks a chat attachment failed", async () => {
    mockRepositoryCreateWithAttachments.mockResolvedValueOnce({
      id: "msg-chat-att",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: null,
      contentAttributes: {},
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      attachments: [
        {
          id: "att-chat-failed",
          originPath: "failed:unresolvable",
        },
      ],
    })

    await sendChatMessage({
      conversation: fakeConversation as never,
      contactInbox: fakeContactInbox as never,
      url: "https://source.example.com/image.jpg",
    })

    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              url: null,
            }),
          ],
        }),
      }),
    )
  })
})

describe("sendFlowStep — sendProducts", () => {
  const whatsappContactInbox = {
    ...fakeContactInbox,
    channel: "whatsapp",
  } as unknown as typeof fakeContactInbox

  const sendProductsStep = {
    id: "step-products",
    nodeId: "node-products",
    stepType: "sendProducts",
    display: "products",
    header: "Our picks",
    body: "Have a look",
    sections: [{ title: "Shoes", productIds: ["11", "12"] }],
  } as unknown as SendFlowStepData["step"]

  const productMessage = {
    display: "products" as const,
    header: "Our picks",
    body: "Have a look",
    sections: [
      {
        title: "Shoes",
        items: [{ productId: "11" }, { productId: "12" }],
      },
    ],
  }

  const prepared = (
    message: typeof productMessage,
    missing: { productId: string }[] = [],
  ) => ({
    message,
    missing,
    text: message.body,
    contentAttributes: { type: "product_message", payload: message },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindConversation.mockResolvedValue(fakeConversation)
    mockFindContactInbox.mockResolvedValue(whatsappContactInbox)
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: mockRepositoryCreateWithAttachments,
    })
    mockresolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
      appUrl: "https://app.example.test",
    })
    mockResolveContactVariables.mockImplementation(
      (_contactId: string, step: unknown) => Promise.resolve(step),
    )
    mockRepositoryCreate.mockResolvedValue({
      id: "msg-products",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: "Have a look",
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    })
    mockSendFlowStepToChannel.mockResolvedValue({
      messageIds: ["provider-1"],
      sentCount: 1,
    })
    mockEmit.mockResolvedValue(undefined)
    mockPrepareProductMessage.mockResolvedValue(prepared(productMessage))
  })

  const run = () =>
    sendFlowStep({
      conversationId: "conv-1",
      flowId: "flow-1",
      flowVersionId: "fv-1",
      step: sendProductsStep,
    })

  test("resolves the products for the contact's channel and persists the snapshot", async () => {
    await run()

    expect(mockPrepareProductMessage).toHaveBeenCalledTimes(1)
    expect(mockPrepareProductMessage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
      content: sendProductsStep,
      onMissing: "drop",
    })
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Have a look",
        contentAttributes: expect.objectContaining({
          type: "product_message",
          payload: productMessage,
          stepId: "step-products",
        }),
      }),
    )
  })

  test("hands the resolved products to the channel and leaves the step as authored", async () => {
    await run()

    expect(mockSendFlowStepToChannel).toHaveBeenCalledTimes(1)
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        productMessage,
        step: expect.objectContaining({
          stepType: "sendProducts",
          sections: [{ title: "Shoes", productIds: ["11", "12"] }],
        }),
      }),
    )
    expect(mockRecordOutboundFlowStep).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith(
      "message:sent",
      expect.objectContaining({
        action: expect.objectContaining({ messageId: "msg-products" }),
      }),
    )
  })

  test("stores the text the product service prepared", async () => {
    mockPrepareProductMessage.mockResolvedValue({
      ...prepared(productMessage),
      text: "Only a header",
    })

    await run()

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Only a header" }),
    )
  })

  test("an unresolvable step creates no message, sends nothing and is recorded once", async () => {
    mockPrepareProductMessage.mockRejectedValue(
      new Error("Product message cannot be sent: catalogNotConnected"),
    )

    await run()

    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockRepositoryCreateWithAttachments).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
    expect(mockRecordOutboundFlowStep).not.toHaveBeenCalled()
    const failed = mockEmit.mock.calls.filter(
      ([type]) => type === "message:failed",
    )
    expect(failed).toHaveLength(1)
    expect(failed[0]?.[1]).toMatchObject({
      action: { messageId: "", flowId: "flow-1" },
      willRetry: false,
      context: { channel: "whatsapp" },
    })
    expect(mockEmit).not.toHaveBeenCalledWith("message:sent", expect.anything())
  })

  test("sends what is left and logs the products that were dropped, once", async () => {
    mockPrepareProductMessage.mockResolvedValue(
      prepared(productMessage, [{ productId: "13" }, { productId: "14" }]),
    )

    await run()

    expect(mockSendFlowStepToChannel).toHaveBeenCalledTimes(1)
    expect(mockLogProviderErrorForChannel).toHaveBeenCalledTimes(1)
    expect(mockLogProviderErrorForChannel).toHaveBeenCalledWith(
      "whatsapp",
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        sourceId: "src-ci-1",
        error: expect.objectContaining({
          message: expect.stringContaining("13, 14"),
        }),
      }),
    )
  })

  test.each([
    BROADCAST_PAYLOAD_TYPE,
    SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
  ])("still sends but writes no ErrorLog row for a %s recipient", async (type) => {
    mockPrepareProductMessage.mockResolvedValue(
      prepared(productMessage, [{ productId: "13" }]),
    )

    await sendFlowStep({
      conversationId: "conv-1",
      flowId: "flow-1",
      flowVersionId: "fv-1",
      step: sendProductsStep,
      metadata: { type, contactInboxId: "ci-1" } as never,
    })

    expect(mockSendFlowStepToChannel).toHaveBeenCalledTimes(1)
    expect(mockLogProviderErrorForChannel).not.toHaveBeenCalled()
  })

  test("does not log anything when every product was sendable", async () => {
    await run()

    expect(mockLogProviderErrorForChannel).not.toHaveBeenCalled()
  })

  test("skips the step on a channel that cannot send products, before resolving anything", async () => {
    mockFindContactInbox.mockResolvedValue(fakeContactInbox)

    await run()

    expect(mockPrepareProductMessage).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).not.toHaveBeenCalled()
  })

  test("a step of another type never touches the product service", async () => {
    mockFindContactInbox.mockResolvedValue(whatsappContactInbox)

    await sendFlowStep({ ...baseParams })

    expect(mockPrepareProductMessage).not.toHaveBeenCalled()
    expect(mockSendFlowStepToChannel).toHaveBeenCalledWith(
      expect.not.objectContaining({ productMessage: expect.anything() }),
    )
  })
})
