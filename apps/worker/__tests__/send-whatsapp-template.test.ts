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
  mockConvertButtons,
  mockParseSdkError,
  mockRecordSendFailure,
  mockDbSet,
  mockEnqueueIntegrationJob,
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

  const mockRepositoryCreate = vi.fn().mockResolvedValue({
    id: "msg-created",
    contactInboxId: "ci-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    messageType: "outgoing",
    contentType: "text",
    senderType: "bot",
    sourceId: null,
    text: "Template: wa-template",
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
      inbox: { integrationWhatsapp: { id: "iw-1" } },
      template: {
        id: "tmpl-wa-1",
        name: "wa-template",
        language: "en",
        components: [],
      },
    }),
    mockReplaceVariables: vi.fn().mockResolvedValue([]),
    mockContactVariables: vi.fn().mockResolvedValue([]),
    mockSendFlowStep: vi
      .fn()
      .mockResolvedValue({ messageIds: ["provider-wa-1"] }),
    mockConvertButtons: vi.fn().mockReturnValue([]),
    mockParseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
    mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
    mockDbSet,
    mockEnqueueIntegrationJob: vi.fn().mockResolvedValue(undefined),
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
      conversationModel: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  messageModel: { id: "id", sourceId: "sourceId" },
  contactInboxModel: { id: "id" },
  conversationModel: { id: "id", lastActivityAt: "lastActivityAt" },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    evaluateTemplateSent: "evaluateTemplateSent",
  },
  enqueueIntegrationJob: mockEnqueueIntegrationJob,
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mockBroadcast,
  contactInboxService: {
    recordOutboundMessageCreated: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    recordOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
    recordSendFailure: mockRecordSendFailure,
    invalidateTracking: vi.fn().mockResolvedValue(undefined),
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
    parseSdkError: mockParseSdkError,
  }
})

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "test-id") }
})

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: mockContactVariables },
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

vi.mock("../src/integration/handlers/wa-template-handler", () => ({
  validateWhatsappTemplate: mockValidateTemplate,
  replaceWhatsappTemplateVariables: mockReplaceVariables,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/chat/handlers/send-message", () => ({
  sendFlowStepToChannel: mockSendFlowStep,
}))

vi.mock("../src/chat/handlers/send-flow-step", () => ({
  convertButtonsToTemplate: mockConvertButtons,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { ProcessWhatsappTemplateParams } from "../src/chat/handlers/send-whatsapp-template"

const { processWhatsappTemplate, sendWhatsappTemplateMessage } = await import(
  "../src/chat/handlers/send-whatsapp-template"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeConversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as ProcessWhatsappTemplateParams["conversation"]

const fakeContactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  channel: "whatsapp",
} as unknown as ProcessWhatsappTemplateParams["contactInbox"]

const fakeTemplate: ProcessWhatsappTemplateParams["template"] = {
  id: "tmpl-wa-1",
  name: "wa-template",
  language: "en",
  params: {},
}

const broadcastTemplateJobData: Parameters<
  typeof sendWhatsappTemplateMessage
>[0] = {
  conversation: fakeConversation,
  contactInbox: {
    ...fakeContactInbox,
    contactId: "contact-1",
  },
  templateId: "tmpl-wa-1",
  broadcastId: "broadcast-1",
  templateData: {},
  metadata: { type: "broadcast", broadcastId: "broadcast-1" },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processWhatsappTemplate", () => {
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
      text: "Template: wa-template",
      contentAttributes: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    })
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      updateSourceId: mockRepositoryUpdateSourceId,
    })
    mockValidateTemplate.mockResolvedValue({
      inbox: { integrationWhatsapp: { id: "iw-1" } },
      template: {
        id: "tmpl-wa-1",
        name: "wa-template",
        language: "en",
        components: [],
      },
    })
    mockReplaceVariables.mockResolvedValue([])
    mockContactVariables.mockResolvedValue([])
    mockSendFlowStep.mockResolvedValue({ messageIds: ["provider-wa-1"] })
    mockEmit.mockResolvedValue(undefined)
  })

  test("calls repository.create() to insert outbound message", async () => {
    await processWhatsappTemplate({
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
    await processWhatsappTemplate({
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
    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockBroadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "messageCreated" }),
    )
  })

  test("sends the variable-resolved params to the channel, not the raw template params", async () => {
    // Regression: replaceWhatsappTemplateVariables resolved the params but the
    // channel send received the raw `template`, so WhatsApp received literal
    // tokens like {{first_name}} instead of the contact's attribute values.
    const resolvedParams = { body: [{ type: "text", text: "John Doe" }] }
    mockReplaceVariables.mockResolvedValue(resolvedParams)

    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: {
        id: "tmpl-wa-1",
        name: "wa-template",
        language: "en",
        params: { body: [{ type: "text", text: "{{first_name}}" }] },
      } as unknown as ProcessWhatsappTemplateParams["template"],
    })

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
    const sentStep = mockSendFlowStep.mock.calls[0][0].step
    expect(sentStep.template.params).toEqual(resolvedParams)
  })

  test("throws when validateWhatsappTemplate returns null — repository.create not called", async () => {
    mockValidateTemplate.mockResolvedValue(null)

    await expect(
      processWhatsappTemplate({
        conversation: fakeConversation,
        contactInbox: fakeContactInbox,
        template: fakeTemplate,
      }),
    ).rejects.toThrow()

    expect(mockRepositoryCreate).not.toHaveBeenCalled()
  })

  test("throws 'Failed to insert message record' when repository.create returns null", async () => {
    mockRepositoryCreate.mockResolvedValue(null)

    await expect(
      processWhatsappTemplate({
        conversation: fakeConversation,
        contactInbox: fakeContactInbox,
        template: fakeTemplate,
      }),
    ).rejects.toThrow("Failed to insert message record")
  })

  test("calls repository.updateSourceId when provider returns providerMessageId", async () => {
    mockSendFlowStep.mockResolvedValue({ messageIds: ["prov-123"] })
    const createdAt = new Date("2026-01-01T00:00:00Z")

    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockRepositoryUpdateSourceId).toHaveBeenCalledWith(
      "msg-created",
      "prov-123",
      "ws-1",
      createdAt,
    )
    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
    expect(mockDbSet).toHaveBeenCalledWith({ lastActivityAt: createdAt })
  })

  test("does not rethrow when persisting sourceId fails after a successful send", async () => {
    // Regression: the template was already sent (billable, non-idempotent) —
    // a thrown error here must not propagate, or BullMQ redelivers the job
    // and sends the same template a second time.
    mockSendFlowStep.mockResolvedValue({ messageIds: ["prov-123"] })
    mockRepositoryUpdateSourceId.mockRejectedValueOnce(
      new Error("shard write failed"),
    )

    await expect(
      processWhatsappTemplate({
        conversation: fakeConversation,
        contactInbox: fakeContactInbox,
        template: fakeTemplate,
      }),
    ).resolves.toBeDefined()

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
  })

  test("enqueues ads conversion evaluation after a successful template send", async () => {
    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockEnqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "evaluateTemplateSent",
        data: {
          workspaceId: "ws-1",
          channel: "whatsapp",
          integrationId: "iw-1",
          contactInboxId: "ci-1",
          templateId: "tmpl-wa-1",
        },
      },
      { jobId: "ads-conversion-evaluate-template-msg-created" },
    )
    expect(mockEnqueueIntegrationJob.mock.calls[0][1].jobId).not.toContain(":")
  })

  test("swallows ads conversion evaluation enqueue failures after send success", async () => {
    mockEnqueueIntegrationJob.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      processWhatsappTemplate({
        conversation: fakeConversation,
        contactInbox: fakeContactInbox,
        template: fakeTemplate,
      }),
    ).resolves.toBeDefined()

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
    expect(mockEnqueueIntegrationJob).toHaveBeenCalledTimes(1)
  })

  test("emits message:failed on error and rethrows", async () => {
    mockRepositoryCreate.mockRejectedValue(new Error("db fail"))

    await expect(
      processWhatsappTemplate({
        conversation: fakeConversation,
        contactInbox: fakeContactInbox,
        template: fakeTemplate,
      }),
    ).rejects.toThrow("db fail")

    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({ occurredAt: expect.any(Date) }),
    )
  })

  test("does not throw permanent ChannelError from broadcast template send", async () => {
    const error = new ChannelError(
      "integration auth failed",
      ChannelErrorCategory.AUTH_FAILED,
      { code: "auth_failed" },
    )
    mockSendFlowStep.mockRejectedValueOnce(error)

    await expect(
      sendWhatsappTemplateMessage(broadcastTemplateJobData),
    ).resolves.toBeUndefined()

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({ occurredAt: expect.any(Date) }),
    )
  })

  test("rethrows retryable ChannelError from WhatsApp broadcast template send", async () => {
    const error = new ChannelError(
      "rate limited",
      ChannelErrorCategory.RATE_LIMITED,
      { code: "rate_limited" },
    )
    mockSendFlowStep.mockRejectedValueOnce(error)

    await expect(
      sendWhatsappTemplateMessage(broadcastTemplateJobData),
    ).rejects.toBe(error)

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
  })

  test("rethrows non-ChannelError from WhatsApp broadcast template send", async () => {
    const error = new Error("unexpected provider failure")
    mockSendFlowStep.mockRejectedValueOnce(error)

    await expect(
      sendWhatsappTemplateMessage(broadcastTemplateJobData),
    ).rejects.toBe(error)

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
  })

  test("template-not-found failure emits message:failed with inboxId in context", async () => {
    mockValidateTemplate.mockResolvedValueOnce(null)

    await expect(
      sendWhatsappTemplateMessage(broadcastTemplateJobData),
    ).rejects.toThrow("WhatsApp template not found")

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

describe("processWhatsappTemplate — template quick-reply flow routing", () => {
  const quickReplyTemplateComponents = [
    {
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Open", url: "https://example.com" },
        { type: "QUICK_REPLY", text: "Stop" },
      ],
    },
  ]

  const statusButtons = [
    { id: "btn-delivered", label: "Delivered" },
    { id: "btn-failed", label: "Failed" },
  ]
  const quickReplyButton = { id: "btn-qr", label: "Stop" }

  const flowWithQuickReply = {
    id: "flow-1",
    versionId: "fv-1",
    buttons: [...statusButtons, quickReplyButton] as unknown as NonNullable<
      ProcessWhatsappTemplateParams["flow"]
    >["buttons"],
  }

  const encodedFlowButtons = [
    {
      id: "btn-delivered",
      label: "Delivered",
      buttonType: "postback",
      postback: "flow-1:fv-1:btn-delivered",
    },
    {
      id: "btn-failed",
      label: "Failed",
      buttonType: "postback",
      postback: "flow-1:fv-1:btn-failed",
    },
    {
      id: "btn-qr",
      label: "Stop",
      buttonType: "postback",
      postback: "flow-1:fv-1:btn-qr",
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      updateSourceId: mockRepositoryUpdateSourceId,
    })
    mockValidateTemplate.mockResolvedValue({
      inbox: { integrationWhatsapp: { id: "iw-1" } },
      template: {
        id: "tmpl-wa-1",
        name: "wa-template",
        language: "en",
        components: quickReplyTemplateComponents,
      },
    })
    mockReplaceVariables.mockResolvedValue({})
    mockContactVariables.mockResolvedValue([])
    mockSendFlowStep.mockResolvedValue({ messageIds: ["provider-wa-1"] })
    mockConvertButtons.mockReturnValue(encodedFlowButtons)
    mockEmit.mockResolvedValue(undefined)
  })

  test("injects a quick_reply param whose payload is the seeded button's encoded postback", async () => {
    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
      flow: flowWithQuickReply,
    })

    const sentStep = mockSendFlowStep.mock.calls[0][0].step
    expect(sentStep.template.params.button).toEqual([
      { sub_type: "quick_reply", index: 1, payload: "flow-1:fv-1:btn-qr" },
    ])
  })

  test("passes metadata into button conversion so postbacks carry broadcast/sequence context", async () => {
    const metadata = { broadcastId: "broadcast-9" } as never

    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
      flow: flowWithQuickReply,
      metadata,
    })

    expect(mockConvertButtons).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: "flow-1",
        flowVersionId: "fv-1",
        contactInboxId: "ci-1",
        metadata,
      }),
    )
  })

  test("stores the flow buttons on the message payload for status routing and inbox rendering", async () => {
    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
      flow: flowWithQuickReply,
    })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          payload: { templateType: "button", buttons: encodedFlowButtons },
        }),
      }),
    )
  })

  test("a legacy manually-typed payload at the same index is replaced by the generated postback", async () => {
    // Old form let users type a payload; once the button is connected to a
    // flow branch, the generated postback must win or the branch never routes
    // (send-layer dedupe keeps the first content-bearing entry).
    mockReplaceVariables.mockResolvedValue({
      button: [{ sub_type: "quick_reply", index: 1, payload: "OLD_MANUAL" }],
    })

    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
      flow: flowWithQuickReply,
    })

    const sentStep = mockSendFlowStep.mock.calls[0][0].step
    expect(sentStep.template.params.button).toEqual([
      { sub_type: "quick_reply", index: 1, payload: "flow-1:fv-1:btn-qr" },
    ])
  })

  test("legacy steps with only status buttons inject nothing (Meta default applies)", async () => {
    mockConvertButtons.mockReturnValue(encodedFlowButtons.slice(0, 2))

    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
      flow: {
        ...flowWithQuickReply,
        buttons: statusButtons as unknown as NonNullable<
          ProcessWhatsappTemplateParams["flow"]
        >["buttons"],
      },
    })

    const sentStep = mockSendFlowStep.mock.calls[0][0].step
    expect(sentStep.template.params.button).toBeUndefined()
  })

  test("broadcast sends (no flow) inject nothing and skip button conversion", async () => {
    await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: fakeContactInbox,
      template: fakeTemplate,
    })

    expect(mockConvertButtons).not.toHaveBeenCalled()
    const sentStep = mockSendFlowStep.mock.calls[0][0].step
    expect(sentStep.template.params.button).toBeUndefined()
  })
})

describe("processWhatsappTemplate — BSUID auth-template guard (D5)", () => {
  const bsuidKeyedContactInbox = {
    ...fakeContactInbox,
    sourceId: "user.9373001",
    sourceUserId: "user.9373001",
  } as unknown as ProcessWhatsappTemplateParams["contactInbox"]

  const emptySourceIdContactInbox = {
    ...fakeContactInbox,
    sourceId: "",
    sourceUserId: "VN.4416742385309647",
  } as unknown as ProcessWhatsappTemplateParams["contactInbox"]

  const phoneKeyedContactInbox = {
    ...fakeContactInbox,
    sourceId: "84900000001",
    sourceUserId: null,
  } as unknown as ProcessWhatsappTemplateParams["contactInbox"]

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
      updateSourceId: mockRepositoryUpdateSourceId,
    })
    mockReplaceVariables.mockResolvedValue([])
    mockContactVariables.mockResolvedValue([])
    mockSendFlowStep.mockResolvedValue({ messageIds: ["provider-wa-1"] })
    mockEmit.mockResolvedValue(undefined)
  })

  test("rejects with a typed 131062 error BEFORE any send when an AUTHENTICATION template targets a BSUID-keyed contact", async () => {
    mockValidateTemplate.mockResolvedValue({
      inbox: { integrationWhatsapp: { id: "iw-1" } },
      template: {
        id: "tmpl-auth-1",
        name: "auth-template",
        language: "en",
        category: "AUTHENTICATION",
        components: [],
      },
    })

    const error = await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: bsuidKeyedContactInbox,
      template: fakeTemplate,
    }).catch((e) => e as InstanceType<typeof ChannelError>)

    expect(error).toBeInstanceOf(ChannelError)
    expect(error.code).toBe(131_062)
    expect(error.category).toBe(ChannelErrorCategory.PAYLOAD_INVALID)
    // Fails fast — no API call, no message row, no variable resolution.
    expect(mockSendFlowStep).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockContactVariables).not.toHaveBeenCalled()
  })

  test("also rejects an AUTHENTICATION template when sourceId is empty but a BSUID exists (send would route via `recipient`)", async () => {
    mockValidateTemplate.mockResolvedValue({
      inbox: { integrationWhatsapp: { id: "iw-1" } },
      template: {
        id: "tmpl-auth-1",
        name: "auth-template",
        language: "en",
        category: "AUTHENTICATION",
        components: [],
      },
    })

    const error = await processWhatsappTemplate({
      conversation: fakeConversation,
      contactInbox: emptySourceIdContactInbox,
      template: fakeTemplate,
    }).catch((e) => e as InstanceType<typeof ChannelError>)

    expect(error).toBeInstanceOf(ChannelError)
    expect(error.code).toBe(131_062)
    expect(mockSendFlowStep).not.toHaveBeenCalled()
  })

  test("allows a MARKETING template to a BSUID-keyed contact (only AUTHENTICATION is restricted)", async () => {
    mockValidateTemplate.mockResolvedValue({
      inbox: { integrationWhatsapp: { id: "iw-1" } },
      template: {
        id: "tmpl-marketing-1",
        name: "marketing-template",
        language: "en",
        category: "MARKETING",
        components: [],
      },
    })

    await expect(
      processWhatsappTemplate({
        conversation: fakeConversation,
        contactInbox: bsuidKeyedContactInbox,
        template: fakeTemplate,
      }),
    ).resolves.toBeDefined()

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
  })

  test("allows an AUTHENTICATION template to a phone-keyed contact (regression — guard is BSUID-specific)", async () => {
    mockValidateTemplate.mockResolvedValue({
      inbox: { integrationWhatsapp: { id: "iw-1" } },
      template: {
        id: "tmpl-auth-2",
        name: "auth-template",
        language: "en",
        category: "AUTHENTICATION",
        components: [],
      },
    })

    await expect(
      processWhatsappTemplate({
        conversation: fakeConversation,
        contactInbox: phoneKeyedContactInbox,
        template: fakeTemplate,
      }),
    ).resolves.toBeDefined()

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
  })
})
