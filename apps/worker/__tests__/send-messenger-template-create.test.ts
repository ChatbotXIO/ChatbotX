import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockRepositoryCreate,
  mockRepositoryUpdateSourceId,
  mockCreateMessageRepository,
  mockBroadcast,
  mockEmit,
  mockValidateTemplate,
  mockReplaceVariables,
  mockContactVariables,
  mockSendFlowStep,
  mockRecordSendFailure,
  mockRecordOutboundMessageActivity,
  mockInvalidateTracking,
  mockFindAnyActiveFlow,
  mockEnqueueIntegrationJob,
  mockFindSendableBroadcast,
  mockResetContactForResume,
} = vi.hoisted(() => {
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
    mockBroadcast: vi.fn(),
    mockEmit: vi.fn().mockResolvedValue(undefined),
    mockValidateTemplate: vi.fn().mockResolvedValue({
      inbox: { id: "inbox-1", integrationMessenger: { id: "intg-1" } },
      template: {
        id: "tmpl-1",
        name: "my-template",
        language: "en",
        parameterFormat: "POSITIONAL",
        components: [],
      },
    }),
    mockEnqueueIntegrationJob: vi.fn().mockResolvedValue(undefined),
    mockReplaceVariables: vi.fn().mockResolvedValue([]),
    mockContactVariables: vi.fn().mockResolvedValue([]),
    mockSendFlowStep: vi
      .fn()
      .mockResolvedValue({ messageIds: ["provider-msg-1"] }),
    mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
    mockRecordOutboundMessageActivity: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    mockInvalidateTracking: vi.fn().mockResolvedValue(undefined),
    mockFindAnyActiveFlow: vi.fn().mockResolvedValue(null),
    mockFindSendableBroadcast: vi.fn().mockResolvedValue({ id: "broadcast-1" }),
    mockResetContactForResume: vi.fn().mockResolvedValue(undefined),
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  messageModel: { id: "id", sourceId: "sourceId" },
  contactInboxModel: { id: "id" },
  conversationModel: { id: "id", lastActivityAt: "lastActivityAt" },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mockBroadcast,
  contactInboxService: {
    recordSendFailure: mockRecordSendFailure,
    invalidateTracking: mockInvalidateTracking,
  },
  conversationService: {
    recordOutboundMessageActivity: mockRecordOutboundMessageActivity,
  },
  flowService: {
    findAnyActive: mockFindAnyActiveFlow,
  },
  broadcastService: {
    findSendableBroadcast: mockFindSendableBroadcast,
    resetContactForResume: mockResetContactForResume,
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    parseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
  }
})

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

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    evaluateTemplateSent: "evaluateTemplateSent",
  },
  enqueueIntegrationJob: mockEnqueueIntegrationJob,
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

const { processMessengerTemplate, sendMessengerTemplateMessage } = await import(
  "../src/chat/handlers/send-messenger-template"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

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

const broadcastTemplateJobData: Parameters<
  typeof sendMessengerTemplateMessage
>[0] = {
  conversation: fakeConversation,
  contactInbox: {
    ...fakeContactInbox,
    contactId: "contact-1",
  },
  templateId: "tmpl-1",
  broadcastId: "broadcast-1",
  templateData: {},
  metadata: { type: "broadcast", broadcastId: "broadcast-1" },
}

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
      inbox: { id: "inbox-1", integrationMessenger: { id: "intg-1" } },
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
    mockEnqueueIntegrationJob.mockResolvedValue(undefined)
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

  test("does NOT call db.insert directly for message creation — goes through the message repository", async () => {
    await processMessengerTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockRepositoryCreate).toHaveBeenCalledTimes(1)
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
    expect(mockRecordOutboundMessageActivity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: undefined,
      at: createdAt,
    })
    expect(mockInvalidateTracking).toHaveBeenCalledWith({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
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

  test("does not throw permanent ChannelError from broadcast template send", async () => {
    const error = new ChannelError(
      "(#551) This person isn't available at the moment.",
      ChannelErrorCategory.USER_BLOCKED,
      { code: 551 },
    )
    mockSendFlowStep.mockRejectedValueOnce(error)

    await expect(
      sendMessengerTemplateMessage(broadcastTemplateJobData),
    ).resolves.toBeUndefined()

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({ occurredAt: expect.any(Date) }),
    )
  })

  test("rethrows non-ChannelError from Messenger broadcast template send", async () => {
    const error = new Error("unexpected provider failure")
    mockSendFlowStep.mockRejectedValueOnce(error)

    await expect(
      sendMessengerTemplateMessage(broadcastTemplateJobData),
    ).rejects.toBe(error)

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
  })

  test("template-not-found failure emits message:failed with inboxId in context", async () => {
    mockValidateTemplate.mockResolvedValueOnce(null)

    await expect(
      sendMessengerTemplateMessage(broadcastTemplateJobData),
    ).rejects.toThrow("Messenger template not found")

    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        context: expect.objectContaining({
          contactInboxId: "ci-1",
          inboxId: "inbox-1",
        }),
      }),
    )
  })
})

describe("sendMessengerTemplateMessage — stop/resume guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindSendableBroadcast.mockResolvedValue({ id: "broadcast-1" })
    mockResetContactForResume.mockResolvedValue(undefined)
    mockValidateTemplate.mockResolvedValue({
      inbox: { id: "inbox-1", integrationMessenger: { id: "intg-1" } },
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
    mockEnqueueIntegrationJob.mockResolvedValue(undefined)
  })

  test("checks findSendableBroadcast before doing anything else", async () => {
    await sendMessengerTemplateMessage(broadcastTemplateJobData)

    expect(mockFindSendableBroadcast).toHaveBeenCalledWith("broadcast-1")
  })

  test("skips the send and resets the recipient when the broadcast is no longer sendable", async () => {
    mockFindSendableBroadcast.mockResolvedValue(null)

    const result = await sendMessengerTemplateMessage(broadcastTemplateJobData)

    expect(result).toBeUndefined()
    expect(mockValidateTemplate).not.toHaveBeenCalled()
    expect(mockSendFlowStep).not.toHaveBeenCalled()
    expect(mockResetContactForResume).toHaveBeenCalledWith({
      broadcastId: "broadcast-1",
      contactKey: { contactId: "contact-1" },
    })
  })

  test("proceeds with the send when the broadcast is still sendable", async () => {
    mockFindSendableBroadcast.mockResolvedValue({ id: "broadcast-1" })

    await sendMessengerTemplateMessage(broadcastTemplateJobData)

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
    expect(mockResetContactForResume).not.toHaveBeenCalled()
  })
})
