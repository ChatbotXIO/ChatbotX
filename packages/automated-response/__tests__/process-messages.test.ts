import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDispatchReply,
  mockFindManyByIds,
  mockGetAll,
  mockQueueClear,
  mockQueueGetAll,
} = vi.hoisted(() => ({
  mockDispatchReply: vi.fn(),
  mockFindManyByIds: vi.fn(),
  mockGetAll: vi.fn(),
  mockQueueClear: vi.fn(),
  mockQueueGetAll: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn().mockResolvedValue({
    findManyByIds: mockFindManyByIds,
  }),
  getSafeSinceTime: vi.fn().mockReturnValue(new Date(0)),
}))

vi.mock("@chatbotx.io/redis", () => ({
  simpleQueue: {
    clear: mockQueueClear,
    getAll: mockQueueGetAll,
  },
}))

vi.mock("../src/dispatch-reply", () => ({
  dispatchAutomatedResponseReply: mockDispatchReply,
}))

vi.mock("../src/utils", () => ({
  automatedResponseService: { getAll: mockGetAll },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn() },
}))

const { processPendingMessages } = await import("../src/process-messages")

const conversation = { id: "conversation-1", workspaceId: "workspace-1" }
const contactInbox = {
  id: "contact-inbox-1",
  lastMessageAt: new Date(),
}

describe("processPendingMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueueClear.mockResolvedValue(undefined)
    mockQueueGetAll.mockResolvedValue(["message-1"])
    mockFindManyByIds.mockResolvedValue([{ id: "message-1", text: "price" }])
    mockGetAll.mockResolvedValue([{ id: "rule-1", type: "inbound" }])
  })

  test("returns handled when Keyword or Ref-link dispatch replies", async () => {
    mockDispatchReply.mockResolvedValue(true)

    await expect(
      processPendingMessages({
        contactInbox: contactInbox as never,
        conversation: conversation as never,
      }),
    ).resolves.toEqual({ status: "handled" })

    expect(mockDispatchReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        text: "price",
        triggerType: "contact_message_in",
      }),
    )
  })

  test("returns noMatch when eligible text has no matching rule", async () => {
    mockDispatchReply.mockResolvedValue(false)

    await expect(
      processPendingMessages({
        contactInbox: contactInbox as never,
        conversation: conversation as never,
      }),
    ).resolves.toEqual({ status: "noMatch" })
  })

  test("returns noEligibleMessage for an empty queue", async () => {
    mockQueueGetAll.mockResolvedValue([])

    await expect(
      processPendingMessages({
        contactInbox: contactInbox as never,
        conversation: conversation as never,
      }),
    ).resolves.toEqual({ status: "noEligibleMessage" })

    expect(mockDispatchReply).not.toHaveBeenCalled()
  })

  test("does not dispatch attachment, postback, challenge, or quick-reply batches without text", async () => {
    mockFindManyByIds.mockResolvedValue([
      { id: "attachment", text: null },
      { id: "postback", text: "" },
    ])

    await expect(
      processPendingMessages({
        contactInbox: contactInbox as never,
        conversation: conversation as never,
      }),
    ).resolves.toEqual({ status: "noEligibleMessage" })

    expect(mockDispatchReply).not.toHaveBeenCalled()
  })
})
