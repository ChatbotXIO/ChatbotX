import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

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

vi.mock("../src/chat/handlers/send-message", () => ({
  sendFlowStepToChannel: vi.fn(),
}))

vi.mock("../src/integration/handlers/messenger-template-handler", () => ({
  validateMessengerTemplate: vi.fn(),
  replaceMessengerTemplateVariables: vi.fn(),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: vi.fn().mockResolvedValue({}) },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: vi.fn(),
  contactInboxService: {
    recordSendFailure: vi.fn().mockResolvedValue(undefined),
    invalidateTracking: vi.fn().mockResolvedValue(undefined),
  },
  conversationService: {
    recordOutboundMessageActivity: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
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
const { db } = await import("@chatbotx.io/database/client")
const { emit } = await import("@chatbotx.io/event-bus")
const { enqueueIntegrationJob } = await import("@chatbotx.io/worker-config")

const mockSendFlowStep = sendFlowStepToChannel as MockInstance
const mockValidate = validateMessengerTemplate as MockInstance
const mockReplace = replaceMessengerTemplateVariables as MockInstance
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

    expect(mockDbUpdate).toHaveBeenCalled()
    const setCall = mockDbUpdate.mock.results[0].value.set
    expect(setCall).toHaveBeenCalledWith({ sourceId: PROVIDER_ID })
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
    expect(db.insert).not.toHaveBeenCalled()
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
})
