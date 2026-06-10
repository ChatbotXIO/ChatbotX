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
  mockResolvePlatformSettings,
  mockResolveContactVariables,
  mockUploadFileFromUrl,
  mockSendFlowStepToChannel,
  mockProcessWhatsappTemplate,
  mockProcessMessengerTemplate,
} = vi.hoisted(() => {
  const updateChain = { set: vi.fn(), where: vi.fn() }
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
    mockResolvePlatformSettings: vi
      .fn()
      .mockResolvedValue({ storageUrl: "https://storage.example.com" }),
    mockResolveContactVariables: vi
      .fn()
      .mockImplementation((_contactId: string, step: unknown) =>
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
    mockProcessWhatsappTemplate: vi
      .fn()
      .mockResolvedValue({ messageId: "msg-wa" }),
    mockProcessMessengerTemplate: vi
      .fn()
      .mockResolvedValue({ messageId: "msg-ms" }),
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mockDbInsert,
    update: mockDbUpdate,
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
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mockBroadcast,
  broadcastToGuestParty: vi.fn().mockResolvedValue(undefined),
  resolvePlatformSettings: mockResolvePlatformSettings,
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

vi.mock("@chatbotx.io/filesystem/node-upload", () => ({
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
  sendMessageToChannel: vi.fn().mockResolvedValue(undefined),
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

const { sendFlowStep } = await import("../src/chat/handlers/send-flow-step")

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
    mockResolvePlatformSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
    })
    mockResolveContactVariables.mockImplementation(
      (_contactId: string, step: unknown) => Promise.resolve(step),
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
    mockEmit.mockResolvedValue(undefined)
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
})
