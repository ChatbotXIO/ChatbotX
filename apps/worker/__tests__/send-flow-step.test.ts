import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockRepositoryCreate,
  mockRepositoryCreateWithAttachments,
  mockCreateMessageRepository,
  mockDbInsert,
  mockDbUpdate,
  mockFindConversation,
  mockFindContactInbox,
  mockBroadcast,
  mockEmit,
  mockresolveTenantSettings,
  mockResolveContactVariables,
  mockUploadFileFromUrl,
  mockSendFlowStepToChannel,
  mockSendMessageToChannel,
  mockProcessWhatsappTemplate,
  mockProcessMessengerTemplate,
  mockDbSet,
  mockRecordOutboundMessage,
  mockRecordSendFailure,
  mockInvalidateTracking,
  mockConversationInvalidate,
  mockUpdateFlowStepState,
  mockFindAppointmentCalendarBySlug,
  mockSignAppointmentWebviewToken,
} = vi.hoisted(() => {
  const mockDbSet = vi.fn()
  const updateChain = { set: mockDbSet, where: vi.fn() }
  updateChain.set.mockReturnValue(updateChain)
  updateChain.where.mockResolvedValue(undefined)
  const mockDbUpdate = vi.fn().mockReturnValue(updateChain)

  const insertChain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue([]),
  }
  insertChain.values.mockReturnValue(insertChain)
  const mockDbInsert = vi.fn().mockReturnValue(insertChain)

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
    mockDbInsert,
    mockDbUpdate,
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
    mockUploadFileFromUrl: vi.fn().mockResolvedValue({
      originPath: "public/space/ws-1/conversations/conv-1/file-id",
      fileType: "image/jpeg",
      fileSize: 12_345,
      fileName: "image.jpg",
    }),
    mockSendFlowStepToChannel: vi
      .fn()
      .mockResolvedValue({ messageIds: ["provider-1"] }),
    mockSendMessageToChannel: vi
      .fn()
      .mockResolvedValue({ messageIds: ["provider-comment-1"] }),
    mockProcessWhatsappTemplate: vi
      .fn()
      .mockResolvedValue({ messageId: "msg-wa" }),
    mockProcessMessengerTemplate: vi
      .fn()
      .mockResolvedValue({ messageId: "msg-ms" }),
    mockDbSet,
    mockRecordOutboundMessage: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
    mockInvalidateTracking: vi.fn().mockResolvedValue(undefined),
    mockConversationInvalidate: vi.fn().mockResolvedValue(undefined),
    mockUpdateFlowStepState: vi.fn().mockResolvedValue(undefined),
    mockFindAppointmentCalendarBySlug: vi.fn(),
    mockSignAppointmentWebviewToken: vi.fn().mockResolvedValue("webview-token"),
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
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

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => unknown) =>
        fn({ update: mockDbUpdate }),
      ),
    query: {
      conversationModel: { findFirst: mockFindConversation },
      contactInboxModel: { findFirst: mockFindContactInbox },
    },
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  messageModel: { id: "id", sourceId: "sourceId" },
  contactInboxModel: { id: "id" },
  conversationModel: { id: "id", lastActivityAt: "lastActivityAt" },
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService: {
    findByPublicLinkSlug: mockFindAppointmentCalendarBySlug,
  },
  broadcastToWorkspaceParty: mockBroadcast,
  broadcastToGuestParty: vi.fn().mockResolvedValue(undefined),
  contactInboxService: {
    recordOutboundMessageCreated: mockRecordOutboundMessage,
    recordOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
    recordSendFailure: mockRecordSendFailure,
    invalidateTracking: mockInvalidateTracking,
  },
  conversationService: {
    invalidate: mockConversationInvalidate,
    updateFlowStepState: mockUpdateFlowStepState,
  },
  resolveTenantSettings: mockresolveTenantSettings,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  signAppointmentWebviewToken: mockSignAppointmentWebviewToken,
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: vi.fn((path: string, base: string) => `${base}/${path}`),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/sdk", () => ({
  parseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
  IntegrationException: class IntegrationException extends Error {},
}))

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

vi.mock("../src/chat/handlers/send-message", () => ({
  sendFlowStepToChannel: mockSendFlowStepToChannel,
  sendMessageToChannel: mockSendMessageToChannel,
}))

vi.mock("../src/chat/handlers/send-messenger-template", () => ({
  processMessengerTemplate: mockProcessMessengerTemplate,
}))

vi.mock("../src/chat/handlers/send-whatsapp-template", () => ({
  processWhatsappTemplate: mockProcessWhatsappTemplate,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

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
    mockSendFlowStepToChannel.mockResolvedValue({ messageIds: ["provider-1"] })
    mockSendMessageToChannel.mockResolvedValue({
      messageIds: ["provider-comment-1"],
    })
    mockEmit.mockResolvedValue(undefined)
    mockFindAppointmentCalendarBySlug.mockResolvedValue(null)
    mockSignAppointmentWebviewToken.mockResolvedValue("webview-token")
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
        sendFrom: "inbox",
      }),
    )
    expect(mockResolveContactVariables).toHaveBeenCalledWith(
      "contact-1",
      sendTextStep,
      expect.objectContaining({
        contactInbox: expect.objectContaining({ id: "ci-1" }),
      }),
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

  test("does NOT call db.insert directly for message creation", async () => {
    await sendFlowStep({ ...baseParams, step: sendTextStep })

    const { messageModel: messageModelMock } = await import(
      "@chatbotx.io/database/schema"
    )
    for (const call of mockDbInsert.mock.calls) {
      expect(call[0]).not.toBe(messageModelMock)
    }
  })

  test("updates contact inbox lastMessageAt and conversation lastActivityAt after creating a flow message", async () => {
    await sendFlowStep({ ...baseParams, step: sendTextStep })

    const createdMessage = await mockRepositoryCreate.mock.results[0]?.value
    expect(mockRecordOutboundMessage).toHaveBeenCalledWith({
      tx: expect.any(Object),
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      at: createdMessage.createdAt,
    })
    expect(mockUpdateFlowStepState).toHaveBeenCalledWith({
      tx: expect.any(Object),
      workspaceId: "ws-1",
      conversationId: "conv-1",
      lastActivityAt: createdMessage.createdAt,
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

  test("suppresses a private commentAnchor when the resolved contactInbox is not messenger", async () => {
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
    expect(mockRecordOutboundMessage).toHaveBeenCalledWith({
      tx: expect.any(Object),
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      at: createdMessage.createdAt,
    })
    expect(mockDbSet).toHaveBeenCalledWith({
      lastActivityAt: createdMessage.createdAt,
    })
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
})
