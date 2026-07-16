import { beforeEach, describe, expect, test, vi } from "vitest"
import { getFlowActionKey } from "../src/constants"

const { mockIntegrationQueueAdd, mockLoggerError } = vi.hoisted(() => ({
  mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockLoggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    runFlowPostback: "runFlowPostback",
    runFlowQuickReply: "runFlowQuickReply",
  },
  integrationQueue: {
    add: mockIntegrationQueueAdd,
  },
}))

vi.mock("../src/keys", () => ({
  env: {
    AUTOMATED_RESPONSE_DELAY_SECONDS: 2,
    AUTOMATED_RESPONSE_TTL_SECONDS: 2,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: mockLoggerError,
  },
}))

const { enqueueFlowAction } = await import("../src/enqueue-flow-action")

const postbackData = {
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  action: "button-a",
  ref: "ref-1",
  messageId: "message-1",
}

const quickReplyData = {
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  action: "quick-reply-a",
  ref: "ref-1",
  messageId: "message-1",
}

const expectDebouncedAdd = ({
  action,
  data,
  jobAction,
}: {
  action: string
  data: typeof postbackData | typeof quickReplyData
  jobAction: "runFlowPostback" | "runFlowQuickReply"
}) => {
  expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
    jobAction,
    {
      type: jobAction,
      data,
    },
    {
      delay: 2000,
      deduplication: {
        id: getFlowActionKey({
          conversationId: data.conversationId,
          contactInboxId: data.contactInboxId,
          action,
        }),
        ttl: 2000,
        extend: true,
        replace: true,
      },
    },
  )
}

const getDeduplicationIds = (): string[] =>
  mockIntegrationQueueAdd.mock.calls.map((call) => {
    const options = call[2] as { deduplication: { id: string } }
    return options.deduplication.id
  })

describe("enqueueFlowAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIntegrationQueueAdd.mockResolvedValue(undefined)
  })

  test("debounces postback flow actions with env timing", async () => {
    await enqueueFlowAction({ kind: "postback", data: postbackData })

    expectDebouncedAdd({
      action: postbackData.action,
      data: postbackData,
      jobAction: "runFlowPostback",
    })
  })

  test("debounces quick reply flow actions with env timing", async () => {
    await enqueueFlowAction({ kind: "quickReply", data: quickReplyData })

    expectDebouncedAdd({
      action: quickReplyData.action,
      data: quickReplyData,
      jobAction: "runFlowQuickReply",
    })
  })

  test("uses stable per-button keys", () => {
    const base = {
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
    }

    expect(getFlowActionKey({ ...base, action: "button-a" })).toBe(
      getFlowActionKey({ ...base, action: "button-a" }),
    )
    expect(getFlowActionKey({ ...base, action: "button-a" })).not.toBe(
      getFlowActionKey({ ...base, action: "button-b" }),
    )
  })

  test("uses the same dedup id for the same action and different ids for different actions", async () => {
    await enqueueFlowAction({ kind: "postback", data: postbackData })
    await enqueueFlowAction({
      kind: "postback",
      data: { ...postbackData, messageId: "message-2" },
    })
    await enqueueFlowAction({
      kind: "postback",
      data: { ...postbackData, action: "button-b", messageId: "message-3" },
    })

    const [firstId, secondId, thirdId] = getDeduplicationIds()
    expect(firstId).toBe(secondId)
    expect(firstId).not.toBe(thirdId)
  })

  test("enqueues WhatsApp flow-response postbacks immediately", async () => {
    const data = {
      ...postbackData,
      payload: {
        waFlowResponse: {
          field: "value",
        },
      },
    }

    await enqueueFlowAction({ kind: "postback", data })

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith("runFlowPostback", {
      type: "runFlowPostback",
      data,
    })
  })

  test("logs enqueue failures without throwing", async () => {
    const queueError = new Error("queue unavailable")
    mockIntegrationQueueAdd.mockRejectedValue(queueError)

    await expect(
      enqueueFlowAction({ kind: "postback", data: postbackData }),
    ).resolves.toBeUndefined()

    expect(mockLoggerError).toHaveBeenCalledWith(
      queueError,
      "Unable to trigger flow action",
    )
  })
})
