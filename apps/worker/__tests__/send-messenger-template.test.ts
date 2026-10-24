import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

const { mockMarkReadByOutbound, mockMessageUpdateSourceId } = vi.hoisted(
  () => ({
    mockMarkReadByOutbound: vi.fn().mockResolvedValue(true),
    mockMessageUpdateSourceId: vi.fn().mockResolvedValue(undefined),
  }),
)

function makeEmptySelectChain(): Promise<never[]> & Record<string, unknown> {
  const chain = Promise.resolve<never[]>([]) as Promise<never[]> &
    Record<string, unknown>
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  return chain
}

// updateSourceId routes shards via getShardsForRange, which wraps the lookup
// in withCache(); without this stub it hits a real (non-routable) Redis.
vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, factory: () => unknown) => factory()),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
  distributedLock: { runExclusive: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: (() => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
        }),
      }),
    })

    return {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "msg-1",
              sourceId: null,
              createdAt: new Date("2026-01-01T00:00:00Z"),
            },
          ]),
        }),
      }),
      update,
      transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => fn({ update })),
      query: {
        inboxModel: { findFirst: vi.fn() },
        messengerMessageTemplateModel: { findFirst: vi.fn() },
        flowModel: { findFirst: vi.fn() },
      },
      // ShardedMessageRepository/MessageShardRegistry query the shard
      // registry (listActive, findShardsForTimeRange, countShards, …) via
      // chained select().from().innerJoin().where().orderBy() calls that can
      // be awaited from any point in the chain. A thenable stub that always
      // resolves empty makes every registry lookup fall back to the main db
      // (= this mock db), which is what a single-shard/unsharded setup does.
      select: vi.fn(() => makeEmptySelectChain()),
    }
  })(),
  and: vi.fn(),
  eq: vi.fn(),
}))

// The delivery helpers are stubbed with the real contract (sentCount > 0 →
// delivered; mark-read forwards to conversationService.markReadByOutbound) so
// this file checks the handler's wiring; the helpers themselves are covered by
// send-message-handler.test.ts.
vi.mock("../src/chat/handlers/send-message", () => ({
  isDeliveredDirectMessage: ({ result }: { result: { sentCount: number } }) =>
    result.sentCount > 0,
  markConversationReadAfterDelivery: (props: unknown) =>
    mockMarkReadByOutbound(props),
  sendFlowStepToChannel: vi.fn(),
}))

vi.mock("../src/integration/handlers/messenger-template-handler", () => ({
  validateMessengerTemplate: vi.fn(),
  replaceMessengerTemplateVariables: vi.fn(),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: vi.fn().mockResolvedValue({}) },
}))

const { findUnscopedMiniApp, signMiniAppResumeToken } = vi.hoisted(() => ({
  findUnscopedMiniApp: vi.fn(),
  signMiniAppResumeToken: vi.fn(),
}))
vi.mock("@chatbotx.io/business/mini-app", () => ({
  miniAppService: { findUnscoped: findUnscopedMiniApp },
}))
vi.mock("@chatbotx.io/encryption/mini-app-token", () => ({
  signMiniAppToken: vi.fn(),
  signMiniAppResumeToken,
}))
vi.mock("@chatbotx.io/business", () => ({
  publishWorkspaceRealtimeEvent: vi.fn(),
  queueWorkspaceRealtimeEvent: vi.fn(),
  queueMessageCreatedEvent: vi.fn(),
  contactInboxService: {
    recordSendFailure: vi.fn().mockResolvedValue(undefined),
    invalidateTracking: vi.fn().mockResolvedValue(undefined),
  },
  conversationService: {
    markReadByOutbound: mockMarkReadByOutbound,
    recordOutboundMessageActivity: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
  },
  messageService: {
    create: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      id: "msg-1",
    })),
    updateSourceId: mockMessageUpdateSourceId,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    evaluateTemplateSent: "evaluateTemplateSent",
  },
  enqueueIntegrationJob: vi.fn().mockResolvedValue(undefined),
}))

const { processMessengerTemplate } = await import(
  "../src/chat/handlers/send-messenger-template"
)
const { sendFlowStepToChannel } = await import(
  "../src/chat/handlers/send-message"
)
const { validateMessengerTemplate, replaceMessengerTemplateVariables } =
  await import("../src/integration/handlers/messenger-template-handler")
const { messageService } = await import("@chatbotx.io/business")
const { db } = await import("@chatbotx.io/database/client")
const { emit } = await import("@chatbotx.io/event-bus")
const { enqueueIntegrationJob } = await import("@chatbotx.io/worker-config")

const mockSendFlowStep = sendFlowStepToChannel as MockInstance
const mockValidate = validateMessengerTemplate as MockInstance
const mockReplace = replaceMessengerTemplateVariables as MockInstance
const mockMessageCreate = messageService.create as MockInstance
const mockDbUpdate = db.update as MockInstance
const mockEmit = emit as MockInstance
const mockEnqueueIntegrationJob = enqueueIntegrationJob as MockInstance

const CONVERSATION = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}
const CONTACT_INBOX = {
  id: "ci-1",
  inboxId: "inbox-1",
  channel: "messenger",
  contactId: "contact-1",
}
const TEMPLATE = {
  id: "tmpl-1",
  name: "order_update",
  language: "en",
  parameterFormat: "POSITIONAL" as const,
  params: {},
}

const VALIDATED = {
  inbox: { id: "inbox-1", integrationMessenger: { id: "intg-1" } },
  template: {
    id: "tmpl-1",
    name: "order_update",
    parameterFormat: "POSITIONAL",
    components: [],
  },
}

describe("processMessengerTemplate — sourceId persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidate.mockResolvedValue(VALIDATED)
    mockReplace.mockImplementation(
      ({ templateParams }: { templateParams: unknown }) =>
        Promise.resolve(templateParams),
    )
  })

  test("builds the variable context with the inbox sender of the running flow", async () => {
    const { contactVariableService } = await import("@chatbotx.io/variables")
    mockSendFlowStep.mockResolvedValueOnce({
      messageIds: ["mid.XYZ"],
      sentCount: 1,
    })

    await processMessengerTemplate({
      conversation: CONVERSATION,
      contactInbox: CONTACT_INBOX,
      template: TEMPLATE,
      sentByUserId: "user-1",
    } as unknown as Parameters<typeof processMessengerTemplate>[0])

    expect(contactVariableService.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ sentByUserId: "user-1" }),
    )
  })

  test("persists providerMessageId to messageModel.sourceId when send succeeds", async () => {
    const PROVIDER_ID = "mid.ABC123"
    mockSendFlowStep.mockResolvedValueOnce({
      messageIds: [PROVIDER_ID],
      sentCount: 1,
    })

    await processMessengerTemplate({
      conversation: CONVERSATION as never,
      contactInbox: CONTACT_INBOX as never,
      template: TEMPLATE,
    })

    expect(mockMessageUpdateSourceId).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "msg-1",
        sourceId: PROVIDER_ID,
        workspaceId: "ws-1",
      }),
    )
    // Template sends honour the inbox option like any other bot message.
    expect(mockMarkReadByOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox-1",
        readAt: new Date("2026-01-01T00:00:00Z"),
      }),
    )
  })

  test("emits message:sent with inboxId for MAC tracking", async () => {
    mockSendFlowStep.mockResolvedValueOnce({
      messageIds: ["mid.ABC123"],
      sentCount: 1,
    })

    await processMessengerTemplate({
      conversation: CONVERSATION as never,
      contactInbox: CONTACT_INBOX as never,
      template: TEMPLATE,
    })

    expect(mockEmit).toHaveBeenCalledWith(
      "message:sent",
      expect.objectContaining({
        context: expect.objectContaining({
          contactInboxId: "ci-1",
          inboxId: "inbox-1",
        }),
      }),
    )
    expect(mockEmit).not.toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({ eventType: "message:bot_sent" }),
    )
    expect(mockSendFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        botSentAnalytics: {
          triggerHandler: "processMessengerTemplate",
          triggerType: "message_bot_sent_messenger_template",
        },
      }),
    )
  })

  test("does NOT persist sourceId when providerMessageId is undefined", async () => {
    mockSendFlowStep.mockResolvedValueOnce({ messageIds: [], sentCount: 0 })

    await processMessengerTemplate({
      conversation: CONVERSATION as never,
      contactInbox: CONTACT_INBOX as never,
      template: TEMPLATE,
    })

    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockMarkReadByOutbound).not.toHaveBeenCalled()
  })
})

describe("processMessengerTemplate — ads conversion template-sent enqueue (disabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidate.mockResolvedValue(VALIDATED)
    mockReplace.mockImplementation(
      ({ templateParams }: { templateParams: unknown }) =>
        Promise.resolve(templateParams),
    )
    mockSendFlowStep.mockResolvedValue({
      messageIds: ["mid.ABC123"],
      sentCount: 1,
    })
  })

  // The ads-conversion rule engine is hidden and unused; the follow-up
  // evaluation job is disabled (commented out) in the handler.
  test("does not enqueue an evaluateTemplateSent job after a successful send", async () => {
    await expect(
      processMessengerTemplate({
        conversation: CONVERSATION as never,
        contactInbox: CONTACT_INBOX as never,
        template: TEMPLATE,
      }),
    ).resolves.toMatchObject({ messageId: "msg-1" })

    const enqueuedTypes = mockEnqueueIntegrationJob.mock.calls.map(
      ([job]: [{ type: string }]) => job.type,
    )
    expect(enqueuedTypes).not.toContain("evaluateTemplateSent")
  })
})

describe("processMessengerTemplate — header variable guard", () => {
  const IMAGE_HEADER_WITH_VARIABLE = {
    type: "HEADER",
    format: "IMAGE",
    text: "{{1}}",
    example: {
      header_text: ["The goods is imported"],
      header_handle: ["https://scontent.example.com/header.png"],
    },
  }
  const BODY_WITH_VARIABLE = { type: "BODY", text: "Hello {{1}}" }

  const validatedWith = (components: unknown[]) => ({
    ...VALIDATED,
    template: { ...VALIDATED.template, components },
  })

  const sendWithParams = (params: typeof TEMPLATE.params) =>
    processMessengerTemplate({
      conversation: CONVERSATION as never,
      contactInbox: CONTACT_INBOX as never,
      template: { ...TEMPLATE, params },
    })

  const sentParams = () =>
    mockSendFlowStep.mock.calls[0][0].step.template.params

  beforeEach(() => {
    vi.clearAllMocks()
    mockReplace.mockImplementation(
      ({ templateParams }: { templateParams: unknown }) =>
        Promise.resolve(templateParams),
    )
    mockSendFlowStep.mockResolvedValue({
      messageIds: ["mid.ABC123"],
      sentCount: 1,
    })
  })

  test.each([
    ["an IMAGE header", IMAGE_HEADER_WITH_VARIABLE],
    ["a TEXT header", { type: "HEADER", format: "TEXT", text: "Hi {{1}}" }],
  ])("fails fast when stored params lack the variable of %s", async (_label, header) => {
    mockValidate.mockResolvedValue(validatedWith([header, BODY_WITH_VARIABLE]))

    const send = sendWithParams({ body: [{ text: "Hi" }] })

    await expect(send).rejects.toBeInstanceOf(ChannelError)
    await expect(send).rejects.toMatchObject({
      category: ChannelErrorCategory.PAYLOAD_INVALID,
      isRetryable: false,
      code: 100,
      subCode: 1_893_029,
    })
    // No provider call and no orphan outgoing message row.
    expect(mockSendFlowStep).not.toHaveBeenCalled()
    expect(mockMessageCreate).not.toHaveBeenCalled()
    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({ willRetry: false }),
    )
  })

  test("fails fast when the only header entry is not a text param", async () => {
    mockValidate.mockResolvedValue(validatedWith([IMAGE_HEADER_WITH_VARIABLE]))

    await expect(
      sendWithParams({
        header: [{ type: "image", image: { link: "https://x.test/a.png" } }],
      }),
    ).rejects.toBeInstanceOf(ChannelError)
    expect(mockSendFlowStep).not.toHaveBeenCalled()
  })

  test.each([
    ["an image-only header", { type: "HEADER", format: "IMAGE" }],
    [
      "a static text header",
      { type: "HEADER", format: "TEXT", text: "Order update" },
    ],
  ])("sends %s without any header param", async (_label, header) => {
    mockValidate.mockResolvedValue(validatedWith([header, BODY_WITH_VARIABLE]))

    await sendWithParams({ body: [{ text: "Hi" }] })

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
    expect(sentParams().header).toBeUndefined()
  })

  test("sends the header text parameter when it is provided", async () => {
    mockValidate.mockResolvedValue(
      validatedWith([IMAGE_HEADER_WITH_VARIABLE, BODY_WITH_VARIABLE]),
    )

    await sendWithParams({
      header: [{ type: "text", text: "The goods is imported" }],
      body: [{ text: "Hi" }],
    })

    expect(mockSendFlowStep).toHaveBeenCalledTimes(1)
    expect(sentParams().header).toEqual([
      { type: "text", text: "The goods is imported" },
    ])
  })

  test("still fills template URL buttons missing from stored params", async () => {
    mockValidate.mockResolvedValue(
      validatedWith([
        BODY_WITH_VARIABLE,
        {
          type: "BUTTONS",
          buttons: [{ type: "URL", text: "Open", url: "https://x.test/jobs" }],
        },
      ]),
    )

    await sendWithParams({ body: [{ text: "Hi" }] })

    expect(sentParams().button).toEqual([
      { sub_type: "url", index: 0, text: "https://x.test/jobs" },
    ])
  })

  test("fills a blank Mini App URL suffix with the recipient's token variable", async () => {
    mockValidate.mockResolvedValue(
      validatedWith([
        BODY_WITH_VARIABLE,
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Open",
              url: "https://x.test/mini-apps?id=12&token={{1}}",
            },
          ],
        },
      ]),
    )

    await sendWithParams({
      body: [{ text: "Hi" }],
      button: [{ sub_type: "url", index: 0, text: "" }],
    })

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        templateParams: expect.objectContaining({
          button: [{ sub_type: "url", index: 0, text: "{{mini_app_token}}" }],
        }),
      }),
    )
  })

  test("fills a blank URL suffix saved without an index only once", async () => {
    mockValidate.mockResolvedValue(
      validatedWith([
        BODY_WITH_VARIABLE,
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Open",
              url: "https://x.test/mini-apps?id=12&token={{1}}",
            },
          ],
        },
      ]),
    )

    await sendWithParams({
      body: [{ text: "Hi" }],
      button: [{ sub_type: "url", text: "" }],
    })

    expect(sentParams().button).toEqual([
      { sub_type: "url", index: 0, text: "{{mini_app_token}}" },
    ])
  })

  test("stores the token variable, not the signed token, on the message", async () => {
    mockValidate.mockResolvedValue(
      validatedWith([
        BODY_WITH_VARIABLE,
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Open",
              url: "https://x.test/mini-apps?id=12&token={{1}}",
            },
          ],
        },
      ]),
    )
    mockReplace.mockImplementation(
      ({ templateParams }: { templateParams: { button?: unknown[] } }) =>
        Promise.resolve({
          ...templateParams,
          button: [{ sub_type: "url", index: 0, text: "signed-token" }],
        }),
    )

    await sendWithParams({
      body: [{ text: "Hi" }],
      button: [{ sub_type: "url", index: 0, text: "" }],
    })

    expect(
      mockMessageCreate.mock.calls[0][0].contentAttributes.template.params
        .button,
    ).toEqual([{ sub_type: "url", index: 0, text: "{{mini_app_token}}" }])
    expect(sentParams().button).toEqual([
      { sub_type: "url", index: 0, text: "signed-token" },
    ])
  })

  describe("a Mini App button sent from a flow", () => {
    const miniAppComponents = [
      BODY_WITH_VARIABLE,
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Open",
            url: "https://x.test/mini-apps?id=12&token={{1}}",
          },
        ],
      },
    ]
    const flowMiniAppButton = {
      id: "btn-9",
      label: "Open",
      buttonType: "openMiniApp",
      beforeStep: { id: "bs-9", stepType: "openMiniApp", miniAppId: "12" },
      steps: [],
    }

    const sendFromFlow = () =>
      processMessengerTemplate({
        conversation: CONVERSATION as never,
        contactInbox: CONTACT_INBOX as never,
        template: {
          ...TEMPLATE,
          params: {
            body: [{ text: "Hi" }],
            button: [{ sub_type: "url", index: 0, text: "" }],
          },
        },
        flow: { id: "flow-1", versionId: "fv-1" },
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendMessengerTemplateMessage",
          template: TEMPLATE,
          buttons: [flowMiniAppButton],
        } as never,
      })

    beforeEach(() => {
      mockValidate.mockResolvedValue(validatedWith(miniAppComponents))
      mockReplace.mockImplementation(
        ({ templateParams }: { templateParams: { button?: unknown[] } }) =>
          Promise.resolve({
            ...templateParams,
            button: [{ sub_type: "url", index: 0, text: "signed-token" }],
          }),
      )
      signMiniAppResumeToken.mockResolvedValue("resume/token")
      findUnscopedMiniApp.mockResolvedValue({
        id: "12",
        workspaceId: CONVERSATION.workspaceId,
        enabled: true,
      })
    })

    test("sends the button's resume token as the link suffix", async () => {
      await sendFromFlow()

      expect(signMiniAppResumeToken).toHaveBeenCalledWith(
        expect.objectContaining({
          miniAppId: "12",
          buttonPayload: expect.stringContaining("flow-1:fv-1:btn-9"),
        }),
      )
      expect(sentParams().button).toEqual([
        { sub_type: "url", index: 0, text: "resume%2Ftoken" },
      ])
    })

    test("keeps the token variable, not the resume token, on the message", async () => {
      await sendFromFlow()

      expect(
        mockMessageCreate.mock.calls[0][0].contentAttributes.template.params
          .button,
      ).toEqual([{ sub_type: "url", index: 0, text: "{{mini_app_token}}" }])
    })

    test("keeps the contact token when the Mini App is not in the workspace", async () => {
      findUnscopedMiniApp.mockResolvedValue({
        id: "12",
        workspaceId: "other-workspace",
        enabled: true,
      })

      await sendFromFlow()

      expect(signMiniAppResumeToken).not.toHaveBeenCalled()
      expect(sentParams().button).toEqual([
        { sub_type: "url", index: 0, text: "signed-token" },
      ])
    })
  })

  test("keeps a URL suffix the step already filled", async () => {
    mockValidate.mockResolvedValue(
      validatedWith([
        BODY_WITH_VARIABLE,
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Open",
              url: "https://x.test/mini-apps?id=12&token={{1}}",
            },
          ],
        },
      ]),
    )

    await sendWithParams({
      body: [{ text: "Hi" }],
      button: [{ sub_type: "url", index: 0, text: "custom" }],
    })

    expect(sentParams().button).toEqual([
      { sub_type: "url", index: 0, text: "custom" },
    ])
  })
})
