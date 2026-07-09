import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockRepositoryCreate,
  mockRepositoryUpdateSourceId,
  mockCreateMessageRepository,
  mockDbInsert,
  mockDbUpdate,
  mockBroadcast,
  mockEmit,
  mockValidateTemplate,
  mockReplaceVariables,
  mockContactVariables,
  mockSendFlowStep,
  mockDbSet,
} = vi.hoisted(() => {
  const insertChain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue([]),
  }
  insertChain.values.mockReturnValue(insertChain)
  const mockDbInsert = vi.fn().mockReturnValue(insertChain)

  const mockDbSet = vi.fn()
  const updateChain = { set: mockDbSet, where: vi.fn() }
  updateChain.set.mockReturnValue(updateChain)
  updateChain.where.mockResolvedValue(undefined)
  const mockDbUpdate = vi.fn().mockReturnValue(updateChain)

  const mockRepositoryCreate = vi.fn().mockResolvedValue({
    id: "msg-created",
    contactInboxId: "ci-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    messageType: "outgoing",
    contentType: "text",
    senderType: "bot",
    sourceId: null,
    text: "Template: my-template",
    contentAttributes: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  })
  const mockRepositoryUpdateSourceId = vi.fn().mockResolvedValue(undefined)

  const mockCreateMessageRepository = vi.fn().mockResolvedValue({
    create: mockRepositoryCreate,
    updateSourceId: mockRepositoryUpdateSourceId,
  })

  return {
    mockRepositoryCreate,
    mockRepositoryUpdateSourceId,
    mockCreateMessageRepository,
    mockDbInsert,
    mockDbUpdate,
    mockBroadcast: vi.fn(),
    mockEmit: vi.fn().mockResolvedValue(undefined),
    mockValidateTemplate: vi.fn().mockResolvedValue({
      template: {
        id: "tmpl-1",
        name: "my-template",
        language: "en",
        parameterFormat: "POSITIONAL",
        components: [],
      },
    }),
    mockReplaceVariables: vi.fn().mockResolvedValue([]),
    mockContactVariables: vi.fn().mockResolvedValue([]),
    mockSendFlowStep: vi
      .fn()
      .mockResolvedValue({ messageIds: ["provider-msg-1"] }),
    mockDbSet,
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
    transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => unknown) =>
        fn({ update: mockDbUpdate }),
      ),
    query: {
      flowModel: { findFirst: vi.fn().mockResolvedValue(null) },
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
  broadcastToWorkspaceParty: mockBroadcast,
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/sdk", () => ({
  parseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "test-id") }
})

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: mockContactVariables },
}))

vi.mock("../src/integration/handlers/messenger-template-handler", () => ({
  validateMessengerTemplate: mockValidateTemplate,
  replaceMessengerTemplateVariables: mockReplaceVariables,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/chat/handlers/send-message", () => ({
  sendFlowStepToChannel: mockSendFlowStep,
}))

vi.mock("@chatbotx.io/flow-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/flow-config")>()
  return {
    ...actual,
    messageEventTypeSchema: {
      enum: {
        "message:sent": "message:sent",
        "message:failed": "message:failed",
      },
    },
  }
})

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { ProcessMessengerTemplateParams } from "../src/chat/handlers/send-messenger-template"

const { processMessengerTemplate } = await import(
  "../src/chat/handlers/send-messenger-template"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Cast partial objects to satisfy strict model types in test context
const fakeConversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as ProcessMessengerTemplateParams["conversation"]

const fakeContactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  channel: "messenger",
} as unknown as ProcessMessengerTemplateParams["contactInbox"]

const fakeTemplate = {
  id: "tmpl-1",
  name: "my-template",
  language: "en" as const,
  parameterFormat: "POSITIONAL" as const,
  params: {} as ProcessMessengerTemplateParams["template"]["params"],
  inboxId: "inbox-1",
} as ProcessMessengerTemplateParams["template"]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processMessengerTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepositoryCreate.mockResolvedValue({
      id: "msg-created",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: "Template: my-template",
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    })
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      updateSourceId: mockRepositoryUpdateSourceId,
    })
    mockValidateTemplate.mockResolvedValue({
      template: {
        id: "tmpl-1",
        name: "my-template",
        language: "en",
        parameterFormat: "POSITIONAL",
        components: [],
      },
    })
    mockReplaceVariables.mockResolvedValue([])
    mockContactVariables.mockResolvedValue([])
    mockSendFlowStep.mockResolvedValue({ messageIds: ["provider-msg-1"] })
    mockEmit.mockResolvedValue(undefined)
  })

  test("calls repository.create() to insert outbound message", async () => {
    await processMessengerTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockCreateMessageRepository).toHaveBeenCalled()
    expect(mockRepositoryCreate).toHaveBeenCalledTimes(1)
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: "outgoing",
        senderType: "bot",
        workspaceId: "ws-1",
        conversationId: "conv-1",
      }),
    )
  })

  test("does NOT call db.insert directly for message creation", async () => {
    await processMessengerTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    const messageModelMock = (await import("@chatbotx.io/database/schema"))
      .messageModel
    for (const call of mockDbInsert.mock.calls) {
      expect(call[0]).not.toBe(messageModelMock)
    }
  })

  test("broadcasts realtime event after message created", async () => {
    await processMessengerTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "messageCreated" }),
    )
  })

  test("calls repository.updateSourceId when provider returns providerMessageId", async () => {
    mockSendFlowStep.mockResolvedValue({ messageIds: ["prov-msg-42"] })
    const createdAt = new Date("2026-01-01T00:00:00Z")

    await processMessengerTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockRepositoryUpdateSourceId).toHaveBeenCalledWith(
      "msg-created",
      "prov-msg-42",
      "ws-1",
      createdAt,
    )
    expect(mockDbUpdate).toHaveBeenCalledTimes(2)
    expect(mockDbSet).toHaveBeenCalledWith({ lastMessageAt: createdAt })
    expect(mockDbSet).toHaveBeenCalledWith({ lastActivityAt: createdAt })
  })

  test("does not rethrow when persisting sourceId fails after a successful send", async () => {
    // Regression: the template was already sent (billable, non-idempotent) —
    // a thrown error here must not propagate, or BullMQ redelivers the job
    // and sends the same template a second time.
    mockSendFlowStep.mockResolvedValue({ messageIds: ["prov-msg-42"] })
    mockRepositoryUpdateSourceId.mockRejectedValueOnce(
      new Error("shard write failed"),
    )

    await expect(
      processMessengerTemplate({
        conversation: fakeConversation,
        contactInbox: fakeContactInbox,
        template: fakeTemplate,
      }),
    ).resolves.toBeDefined()

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
  })
})
