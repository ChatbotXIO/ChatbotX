import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({
  db: (() => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })

    return {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "msg-1", sourceId: null }]),
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
      // ShardedMessageRepository calls registry.listActive() → db.select().
      // Return [] so manager falls back to mainDbShardClient (= this mock db).
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
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
