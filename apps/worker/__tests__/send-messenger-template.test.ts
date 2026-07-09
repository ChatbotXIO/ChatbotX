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
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
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

const mockSendFlowStep = sendFlowStepToChannel as MockInstance
const mockValidate = validateMessengerTemplate as MockInstance
const mockReplace = replaceMessengerTemplateVariables as MockInstance
const mockDbUpdate = db.update as MockInstance

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
    mockSendFlowStep.mockResolvedValueOnce({ messageIds: [PROVIDER_ID] })

    await processMessengerTemplate({
      conversation: CONVERSATION as never,
      contactInbox: CONTACT_INBOX as never,
      template: TEMPLATE,
    })

    expect(mockDbUpdate).toHaveBeenCalled()
    const setCall = mockDbUpdate.mock.results[0].value.set
    expect(setCall).toHaveBeenCalledWith({ sourceId: PROVIDER_ID })
  })

  test("does NOT persist sourceId when providerMessageId is undefined", async () => {
    mockSendFlowStep.mockResolvedValueOnce({ messageIds: [] })

    await processMessengerTemplate({
      conversation: CONVERSATION as never,
      contactInbox: CONTACT_INBOX as never,
      template: TEMPLATE,
    })

    const setCall = mockDbUpdate.mock.results[0].value.set
    expect(setCall).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: expect.any(String) }),
    )
  })
})
