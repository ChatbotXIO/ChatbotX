// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  claimForResend: vi.fn(),
  updateSendError: vi.fn(),
  findConversation: vi.fn(),
  findContactInbox: vi.fn(),
  chatQueueAdd: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(() =>
    Promise.resolve({
      findById: mocks.findById,
      claimForResend: mocks.claimForResend,
      updateSendError: mocks.updateSendError,
    }),
  ),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChannelMessage: "sendChannelMessage" },
  chatQueue: { add: mocks.chatQueueAdd },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: { findByOrFail: mocks.findConversation },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findByIdForWorkspace: mocks.findContactInbox },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("../src/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}/${path}`,
}))

vi.mock("../src/logger", () => ({ logger: { error: vi.fn() } }))

const { resendOutgoing } = await import("../src/message/resend-outgoing")

const CREATED_AT = new Date("2026-07-09T08:37:21.108Z")
const PARENT_CREATED_AT = "2026-07-01T10:00:00.000Z"
const conversation = { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" }
const contactInbox = { id: "ci-1", channel: "messenger", contactId: "c-1" }

const failedMessage = (overrides: Record<string, unknown> = {}) => ({
  id: "msg-1",
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  messageType: "outgoing",
  senderType: "user",
  type: "message",
  contentAttributes: null,
  sendError: "(#10) permission denied",
  sourceId: null,
  parentId: null,
  createdAt: CREATED_AT,
  attachments: [],
  ...overrides,
})

const resend = () =>
  resendOutgoing({
    workspaceId: "ws-1",
    conversationId: "conv-1",
    messageId: "msg-1",
    createdAt: CREATED_AT,
  })

describe("messageService.resendOutgoing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findById.mockResolvedValue(failedMessage())
    mocks.claimForResend.mockResolvedValue({ id: "msg-1" })
    mocks.updateSendError.mockResolvedValue({ id: "msg-1" })
    mocks.findConversation.mockResolvedValue(conversation)
    mocks.findContactInbox.mockResolvedValue(contactInbox)
    mocks.chatQueueAdd.mockResolvedValue(undefined)
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
    })
  })

  test("claims the failed message, then queues it for the inbox send path", async () => {
    await expect(resend()).resolves.toEqual({ id: "msg-1", queued: true })

    expect(mocks.findById).toHaveBeenCalledWith({
      id: "msg-1",
      createdAt: CREATED_AT,
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })
    expect(mocks.claimForResend).toHaveBeenCalledWith({
      id: "msg-1",
      workspaceId: "ws-1",
      createdAt: CREATED_AT,
    })
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "sendChannelMessage",
      expect.objectContaining({
        type: "sendChannelMessage",
        data: expect.objectContaining({
          conversation,
          contactInbox,
          sendFrom: "inbox",
          message: expect.objectContaining({
            id: "msg-1",
            parentCreatedAt: null,
          }),
        }),
      }),
    )
  })

  test("a message with files is resent whole, with resolved attachment urls", async () => {
    mocks.findById.mockResolvedValue(
      failedMessage({
        attachments: [{ id: "att-1", originPath: "public/a.png" }],
      }),
    )

    await resend()

    const payload = mocks.chatQueueAdd.mock.calls[0]?.[1] as {
      data: { message: { attachments: { url: string }[] } }
    }
    expect(payload.data.message.attachments).toEqual([
      expect.objectContaining({
        id: "att-1",
        url: "https://storage.example.com/public/a.png",
      }),
    ])
  })

  test("a message that does not exist in this workspace/conversation is a 404 and nothing happens", async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(resend()).rejects.toMatchObject({ httpStatusCode: 404 })

    expect(mocks.claimForResend).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test.each([
    ["a bot message", { senderType: "bot" }],
    ["a system message", { senderType: "system" }],
    ["a message that did not fail", { sendError: null }],
    ["a message the channel already accepted", { sourceId: "mid-1" }],
    ["an incoming message", { messageType: "incoming" }],
    ["a public comment reply", { type: "comment", contentAttributes: null }],
  ])("%s cannot be resent: 409, nothing claimed or queued", async (_name, overrides) => {
    mocks.findById.mockResolvedValue(failedMessage(overrides))

    await expect(resend()).rejects.toMatchObject({
      code: "messageNotResendable",
      httpStatusCode: 409,
    })

    expect(mocks.claimForResend).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("a message sent through the API can be resent", async () => {
    mocks.findById.mockResolvedValue(failedMessage({ senderType: "api" }))
    await expect(resend()).resolves.toEqual({ id: "msg-1", queued: true })
  })

  describe("private reply (stored as a comment, delivered as a DM)", () => {
    const privateReply = (extra: Record<string, unknown> = {}) =>
      failedMessage({
        type: "comment",
        parentId: "comment-1",
        contentAttributes: {
          isPrivateReply: true,
          replyToMessageCreatedAt: PARENT_CREATED_AT,
        },
        ...extra,
      })

    test("is resent with the replied-to comment's createdAt", async () => {
      mocks.findById.mockResolvedValue(privateReply())

      await resend()

      const payload = mocks.chatQueueAdd.mock.calls[0]?.[1] as {
        data: { message: { parentCreatedAt: Date | null } }
      }
      expect(payload.data.message.parentCreatedAt).toEqual(
        new Date(PARENT_CREATED_AT),
      )
    })

    test("without the kept createdAt it is refused, and nothing is claimed", async () => {
      mocks.findById.mockResolvedValue(
        privateReply({ contentAttributes: { isPrivateReply: true } }),
      )

      await expect(resend()).rejects.toMatchObject({
        code: "messageNotResendable",
        httpStatusCode: 409,
      })

      expect(mocks.claimForResend).not.toHaveBeenCalled()
      expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    })

    test("a garbled kept createdAt is refused too", async () => {
      mocks.findById.mockResolvedValue(
        privateReply({
          contentAttributes: {
            isPrivateReply: true,
            replyToMessageCreatedAt: "not-a-date",
          },
        }),
      )

      await expect(resend()).rejects.toMatchObject({ httpStatusCode: 409 })
      expect(mocks.claimForResend).not.toHaveBeenCalled()
    })
  })

  test("two concurrent resends queue once: the loser gets a conflict and queues nothing", async () => {
    mocks.claimForResend
      .mockResolvedValueOnce({ id: "msg-1" })
      .mockResolvedValueOnce(null)

    const results = await Promise.allSettled([resend(), resend()])

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    expect(mocks.chatQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("a queue failure puts the failed state back and rethrows, so it can be tried again", async () => {
    const failure = new Error("redis down")
    mocks.chatQueueAdd.mockRejectedValueOnce(failure)

    await expect(resend()).rejects.toBe(failure)

    expect(mocks.updateSendError).toHaveBeenCalledWith(
      "msg-1",
      "(#10) permission denied",
      "ws-1",
      CREATED_AT,
    )
  })

  test("a failure while restoring the failed state never replaces the queue error", async () => {
    const failure = new Error("redis down")
    mocks.chatQueueAdd.mockRejectedValueOnce(failure)
    mocks.updateSendError.mockRejectedValueOnce(new Error("db down"))

    await expect(resend()).rejects.toBe(failure)
  })

  test("a missing contact inbox is a 404 before anything is claimed", async () => {
    mocks.findContactInbox.mockResolvedValue(null)

    await expect(resend()).rejects.toMatchObject({ httpStatusCode: 404 })
    expect(mocks.claimForResend).not.toHaveBeenCalled()
  })

  test("a failure while preparing the payload happens before the claim, so the message is never left claimed with no job", async () => {
    mocks.resolveTenantSettings.mockRejectedValue(new Error("cache down"))

    await expect(resend()).rejects.toThrow("cache down")
    expect(mocks.claimForResend).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })
})
