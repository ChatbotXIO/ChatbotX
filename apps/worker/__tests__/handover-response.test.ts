import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findActiveSettings: vi.fn(),
  findActiveFlow: vi.fn(),
  executeHandoff: vi.fn(),
  integrationQueueAdd: vi.fn(),
  chatQueueAdd: vi.fn(),
  resolveContactVariablesDeep: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiHandoverSettingsService: { findActive: mocks.findActiveSettings },
  flowService: { findActiveById: mocks.findActiveFlow },
}))
vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: mocks.executeHandoff },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChatMessage: "sendChatMessage" },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  chatQueue: { add: mocks.chatQueueAdd },
  integrationQueue: { add: mocks.integrationQueueAdd },
}))
vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: mocks.resolveContactVariablesDeep,
}))
vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const { startHandoverResponse } = await import(
  "../src/integration/handlers/handover-response"
)

const EVENT_KEY = "routing-job-1"
const AI_APP_ID = "ai-app"
const contactInbox = { id: "ci-1", contactId: "contact-1" }
const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}

type Props = Parameters<typeof startHandoverResponse>[0]

const props = (overrides: Partial<Props> = {}): Props =>
  ({
    workspaceId: "ws-1",
    inboxId: "inbox-1",
    integrationType: "messenger",
    pageResumeFlowId: null,
    event: { aiAgentAppId: AI_APP_ID },
    eventKey: EVENT_KEY,
    previousOwnerAppId: AI_APP_ID,
    thread: { contactInbox, conversation },
    ...overrides,
  }) as unknown as Props

const settings = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  scheduleEnabled: false,
  timeRanges: [],
  gotoFlowId: null,
  returnMessage: null,
  pauseBotWaitingForStaff: false,
  ...overrides,
})

const flowJobs = () =>
  mocks.integrationQueueAdd.mock.calls.map((call) => call[1].data.flowId)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findActiveSettings.mockResolvedValue(null)
  mocks.findActiveFlow.mockImplementation(async ({ id }) =>
    id.startsWith("dead") ? undefined : { id, currentVersionId: `${id}-v1` },
  )
  mocks.integrationQueueAdd.mockResolvedValue(undefined)
  mocks.chatQueueAdd.mockResolvedValue(undefined)
  mocks.executeHandoff.mockResolvedValue(undefined)
  mocks.resolveContactVariablesDeep.mockImplementation(
    async (_contactId, value) => value,
  )
})

describe("startHandoverResponse: not a hand-back from the AI agent", () => {
  test("a partner hand-back starts only the per-Page resume flow and never reads the AI settings", async () => {
    await startHandoverResponse(
      props({ pageResumeFlowId: "page-flow", previousOwnerAppId: "partner" }),
    )

    expect(flowJobs()).toEqual(["page-flow"])
    expect(mocks.findActiveSettings).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.executeHandoff).not.toHaveBeenCalled()
  })

  test("an unknown previous owner (payload and row both lack it) is not treated as the AI", async () => {
    await startHandoverResponse(
      props({ pageResumeFlowId: "page-flow", previousOwnerAppId: null }),
    )
    expect(mocks.findActiveSettings).not.toHaveBeenCalled()
    expect(flowJobs()).toEqual(["page-flow"])
  })

  test("a channel with no AI app id (WhatsApp) keeps today's behaviour", async () => {
    await startHandoverResponse(
      props({
        integrationType: "whatsapp",
        pageResumeFlowId: "page-flow",
        event: {},
        previousOwnerAppId: AI_APP_ID,
      }),
    )
    expect(mocks.findActiveSettings).not.toHaveBeenCalled()
    expect(flowJobs()).toEqual(["page-flow"])
  })

  test("nothing configured starts nothing", async () => {
    await startHandoverResponse(props({ previousOwnerAppId: "partner" }))
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })
})

describe("startHandoverResponse: hand-back from the AI agent", () => {
  test("inactive or unconfigured automation falls through to the per-Page flow", async () => {
    mocks.findActiveSettings.mockResolvedValue(null)

    await startHandoverResponse(props({ pageResumeFlowId: "page-flow" }))

    expect(mocks.findActiveSettings).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
    expect(flowJobs()).toEqual(["page-flow"])
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.executeHandoff).not.toHaveBeenCalled()
  })

  test("the AI hand-over card's flow wins over the Page's resume flow", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: "card-flow", returnMessage: "Back" }),
    )

    await startHandoverResponse(props({ pageResumeFlowId: "page-flow" }))

    expect(flowJobs()).toEqual(["card-flow"])
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("the Page's resume flow is for other partners: an active card without a flow sends its return message", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: null, returnMessage: "Back" }),
    )

    await startHandoverResponse(props({ pageResumeFlowId: "page-flow" }))

    expect(flowJobs()).toEqual([])
    expect(mocks.chatQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("a dead card flow falls back to the return message, never to the Page's resume flow", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: "dead-card-flow", returnMessage: "Back" }),
    )

    await startHandoverResponse(props({ pageResumeFlowId: "page-flow" }))

    expect(flowJobs()).toEqual([])
    expect(mocks.chatQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("when no flow is usable the return message is sent instead (v1 silently sent nothing)", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: "dead-flow", returnMessage: "We're back" }),
    )

    await startHandoverResponse(props())

    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).toHaveBeenCalledExactlyOnceWith(
      "sendChatMessage",
      {
        type: "sendChatMessage",
        data: { conversation, contactInbox, text: "We're back" },
      },
      { jobId: `thread-resume-message-ci-1-${EVENT_KEY}` },
    )
  })

  test("contact variables in the return message are resolved before enqueueing", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ returnMessage: "Hi {{first_name}}" }),
    )
    mocks.resolveContactVariablesDeep.mockResolvedValue({ text: "Hi Linh" })

    await startHandoverResponse(props())

    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledWith(
      "contact-1",
      { text: "Hi {{first_name}}" },
      { contactInbox: "ci-1", conversation },
    )
    expect(mocks.chatQueueAdd.mock.calls[0][1].data.text).toBe("Hi Linh")
  })

  test("a variable failure skips the message (never sends a raw {{placeholder}}) but still pauses the bot", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({
        returnMessage: "Hi {{first_name}}",
        pauseBotWaitingForStaff: true,
      }),
    )
    mocks.resolveContactVariablesDeep.mockRejectedValue(new Error("boom"))

    await startHandoverResponse(props())

    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalled()
    expect(mocks.executeHandoff).toHaveBeenCalledTimes(1)
  })

  test("nothing usable and nothing to say starts nothing", async () => {
    mocks.findActiveSettings.mockResolvedValue(settings())

    await startHandoverResponse(props())

    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.executeHandoff).not.toHaveBeenCalled()
  })

  test("pauses the bot for the conversation only after the response was enqueued", async () => {
    const order: string[] = []
    mocks.integrationQueueAdd.mockImplementation(() => {
      order.push("flow")
      return Promise.resolve()
    })
    mocks.executeHandoff.mockImplementation(() => {
      order.push("pause")
      return Promise.resolve()
    })
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: "card-flow", pauseBotWaitingForStaff: true }),
    )

    await startHandoverResponse(props())

    expect(order).toEqual(["flow", "pause"])
    // The guarded executor: it flips the bot off only while it is still on, and
    // then emits the transferred-to-human trigger/webhook/analytics, so a retry
    // never emits twice.
    expect(mocks.executeHandoff).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      conversationId: "conv-1",
      channel: "messenger",
      reason: "ai_agent_handback",
      source: "thread_control_handback",
    })
  })

  test("pauseBot off never touches the conversation", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: "card-flow" }),
    )
    await startHandoverResponse(props())
    expect(mocks.executeHandoff).not.toHaveBeenCalled()
  })

  test("the job ids carry the event key: a redelivery cannot answer twice, a different event can", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: "card-flow" }),
    )

    await startHandoverResponse(props())

    expect(mocks.integrationQueueAdd).toHaveBeenCalledExactlyOnceWith(
      "sendFlow",
      {
        type: "sendFlow",
        data: {
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          flowId: "card-flow",
          origin: "channel",
        },
      },
      { jobId: `thread-resume-ci-1-${EVENT_KEY}` },
    )
  })

  test("an enqueue failure propagates so the job retries", async () => {
    mocks.findActiveSettings.mockResolvedValue(
      settings({ gotoFlowId: "card-flow" }),
    )
    mocks.integrationQueueAdd.mockRejectedValue(new Error("redis down"))

    await expect(startHandoverResponse(props())).rejects.toThrow("redis down")
    expect(mocks.executeHandoff).not.toHaveBeenCalled()
  })
})
