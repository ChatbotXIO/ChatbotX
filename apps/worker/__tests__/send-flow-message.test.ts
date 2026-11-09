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

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    ChatJobAction: {
      sendChatMessage: "sendChatMessage",
      sendFlowMessage: "sendFlowMessage",
    },
    chatQueue: { add: mocks.chatQueueAdd },
    IntegrationJobAction: { sendFlow: "sendFlow" },
    integrationQueue: { add: mocks.integrationQueueAdd },
  }
})
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
    contactInbox: { id: "ci-1" },
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
        contactInboxId: "ci-1",
        flowId: "flow-1",
        flowVersionId: "fv-1",
        executedFlowVersionId: "fv-1",
        step: {
          id: "step-1",
          stepType: "sendText",
          text: "message 1",
        },
        trackingContext: { messageId: "msg-1" },
        metadata: { source: "test" },
        quickReplies: [{ id: "qr-1", label: "Yes" }],
        sendFrom: "inbox",
        commentAnchor: undefined,
        appointmentId: undefined,
      },
    })
  })

  test("forwards the inbox sender to the flow step job", async () => {
    await sendFlowMessage({ ...makeProps(), sentByUserId: "user-1" })

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.objectContaining({
        data: expect.objectContaining({ sentByUserId: "user-1" }),
      }),
    )
  })

  test("propagates bulk broadcast state to the flow step", async () => {
    await sendFlowMessage({
      ...makeProps(),
      isBulkBroadcast: true,
    })

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.objectContaining({
        data: expect.objectContaining({ isBulkBroadcast: true }),
      }),
    )
  })

  test("omits flowVersionId when the run is using the latest flow version", async () => {
    await sendFlowMessage({ ...makeProps(), useLatestFlowVersion: true })

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          flowVersionId: undefined,
        }),
      }),
    )
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

  describe("statusBranches for WhatsApp template steps", () => {
    const templateProps = (buttons: unknown[], edges: unknown[] = []) =>
      ({
        ...(makeProps() as object),
        flowVersion: { id: "fv-1", flowId: "flow-1", edges },
        step: {
          id: "step-1",
          stepType: "sendWaTemplateMessage",
          template: { id: "t-1", name: "n", language: "en", params: {} },
          buttons,
        },
      }) as never

    const placeholder = (id: string, label: string) => ({
      id,
      label,
      buttonType: null,
      beforeStep: null,
      steps: [],
    })

    const sentData = () =>
      (
        mocks.chatQueueAdd.mock.calls[0] as unknown as [
          string,
          { data: { statusBranches?: string[] } },
        ]
      )[1].data

    test("records only the status whose button is wired to a node", async () => {
      await sendFlowMessage(
        templateProps(
          [placeholder("b1", "Delivered"), placeholder("b2", "Failed")],
          [{ id: "e1", source: "n1", sourceHandle: "b1", target: "next" }],
        ),
      )

      expect(sentData().statusBranches).toEqual(["delivered"])
    })

    test("records both statuses when both buttons lead somewhere", async () => {
      await sendFlowMessage(
        templateProps(
          [
            placeholder("b1", "Delivered"),
            { ...placeholder("b2", "Failed"), steps: [{ id: "s1" }] },
          ],
          [{ id: "e1", source: "n1", sourceHandle: "b1", target: "next" }],
        ),
      )

      expect(sentData().statusBranches).toEqual(["delivered", "failed"])
    })

    test("flags the send when a status button runs its own actions", async () => {
      await sendFlowMessage(
        templateProps([
          placeholder("b1", "Delivered"),
          { ...placeholder("b2", "Failed"), steps: [{ id: "s1" }] },
        ]),
      )

      expect(sentData().statusBranches).toEqual(["failed"])
    })

    test("does not flag a template whose status buttons are bare placeholders", async () => {
      await sendFlowMessage(
        templateProps([
          placeholder("b1", "Delivered"),
          placeholder("b2", "Failed"),
        ]),
      )

      expect(sentData()).not.toHaveProperty("statusBranches")
    })

    test("does not treat a wired quick-reply button after the status pair as a status branch", async () => {
      await sendFlowMessage(
        templateProps(
          [
            placeholder("b1", "Delivered"),
            placeholder("b2", "Failed"),
            placeholder("b3", "Yes"),
          ],
          [{ id: "e1", source: "n1", sourceHandle: "b3", target: "next" }],
        ),
      )

      expect(sentData()).not.toHaveProperty("statusBranches")
    })

    test("never flags a non-template step", async () => {
      await sendFlowMessage(makeProps())

      expect(sentData()).not.toHaveProperty("statusBranches")
    })
  })
})
