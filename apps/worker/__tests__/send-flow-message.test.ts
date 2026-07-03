import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  chatQueueAdd: vi.fn(async () => undefined),
  integrationQueueAdd: vi.fn(async () => undefined),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  sendMessageWithRender: vi.fn(),
  waitForChatJobCompletion: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendChatMessage: "sendChatMessage",
    sendFlowMessage: "sendFlowMessage",
  },
  chatQueue: { add: mocks.chatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mocks.integrationQueueAdd },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: {}, update: vi.fn(), insert: vi.fn() },
  eq: vi.fn(),
  findOrFail: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return { ...actual }
})
vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(async () => undefined),
}))
vi.mock("@chatbotx.io/events", () => ({}))
vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    initVariables: vi.fn(() => ({ conversation: {} })),
  }
})
vi.mock("../src/lib/logger", () => ({
  logger: {
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}))
vi.mock("../src/integration/utils/message", () => ({
  sendMessageWithRender: mocks.sendMessageWithRender,
  waitForChatJobCompletion: mocks.waitForChatJobCompletion,
}))

const { sendFlowMessage } = await import("../src/integration/handlers/step")

const makeProps = () =>
  ({
    conversation: { id: "conv-1" },
    flowVersion: { id: "fv-1", flowId: "flow-1" },
    step: {
      id: "step-1",
      stepType: "sendText",
      text: "message 1",
    },
    trackingContext: { messageId: "msg-1" },
    metadata: { source: "test" },
    quickReplies: [{ id: "qr-1", label: "Yes" }],
    sendFrom: "inbox",
  }) as never

describe("sendFlowMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.chatQueueAdd.mockResolvedValue(undefined)
    mocks.waitForChatJobCompletion.mockResolvedValue(undefined)
  })

  test("enqueues a sendFlowMessage chat job with the step payload", async () => {
    await sendFlowMessage(makeProps())

    expect(mocks.chatQueueAdd).toHaveBeenCalledOnce()
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendFlowMessage", {
      type: "sendFlowMessage",
      data: {
        conversationId: "conv-1",
        flowId: "flow-1",
        flowVersionId: "fv-1",
        step: {
          id: "step-1",
          stepType: "sendText",
          text: "message 1",
        },
        trackingContext: { messageId: "msg-1" },
        metadata: { source: "test" },
        quickReplies: [{ id: "qr-1", label: "Yes" }],
        sendFrom: "inbox",
      },
    })
  })

  test("waits on the enqueued job with conversation and step context", async () => {
    const fakeJob = { waitUntilFinished: vi.fn() }
    mocks.chatQueueAdd.mockResolvedValueOnce(fakeJob)

    await sendFlowMessage(makeProps())

    expect(mocks.waitForChatJobCompletion).toHaveBeenCalledOnce()
    expect(mocks.waitForChatJobCompletion).toHaveBeenCalledWith(fakeJob, {
      conversationId: "conv-1",
      stepId: "step-1",
    })
  })

  test("does not resolve until delivery wait completes", async () => {
    let releaseWait!: () => void
    const waitPromise = new Promise<void>((resolve) => {
      releaseWait = resolve
    })
    mocks.chatQueueAdd.mockResolvedValueOnce({ waitUntilFinished: vi.fn() })
    mocks.waitForChatJobCompletion.mockReturnValueOnce(waitPromise)

    let resolved = false
    const resultPromise = sendFlowMessage(makeProps()).then(() => {
      resolved = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(false)

    releaseWait()
    await resultPromise
    expect(resolved).toBe(true)
  })
})
