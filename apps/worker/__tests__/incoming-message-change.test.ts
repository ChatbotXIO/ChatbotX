import type { Job } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  identifyInbox: vi.fn(),
  updateTextBySourceId: vi.fn(),
  deleteBySourceId: vi.fn(),
  findConversation: vi.fn(),
  publishRealtimeEvent: vi.fn(),
  runExclusive: vi.fn(),
  isLockAcquisitionError: vi.fn(),
  hasEverBeenEnabled: vi.fn(),
  deleteTranslation: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mocks.identifyInbox,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  isLockAcquisitionError: mocks.isLockAcquisitionError,
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findBy: mocks.findConversation },
  messageService: {
    updateTextBySourceId: (props: {
      sourceId: string
      workspaceId: string
      text: string
    }) =>
      mocks.updateTextBySourceId(props.sourceId, props.workspaceId, props.text),
    deleteBySourceId: (props: {
      sourceId: string
      workspaceId: string
      createdAtHint: Date
    }) =>
      mocks.deleteBySourceId(
        props.sourceId,
        props.workspaceId,
        props.createdAtHint,
      ),
  },
  queueWorkspaceRealtimeEvent: mocks.publishRealtimeEvent,
  inboxTranslationSettingsService: {
    hasEverBeenEnabled: mocks.hasEverBeenEnabled,
  },
  translationService: { deleteForMessage: mocks.deleteTranslation },
}))

const { logger } = await import("../src/lib/logger")
const {
  applyIncomingTextUpdate,
  deleteIncomingMessage,
  updateIncomingMessage,
} = await import("../src/integration/handlers/incoming-message-change")

const conversation = { id: "conv-1", workspaceId: "ws-1", inboxId: "inbox-1" }

const baseProps = {
  integrationType: "whatsapp",
  integrationIdentifier: "phone-1",
  messageId: "wamid.original",
}

const jobOnAttempt = (attemptsMade: number, attempts = 5) =>
  ({ attemptsMade, opts: { attempts } }) as Job

beforeEach(() => {
  vi.clearAllMocks()
  mocks.identifyInbox.mockResolvedValue({ inbox: { workspaceId: "ws-1" } })
  mocks.findConversation.mockResolvedValue(conversation)
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
  mocks.isLockAcquisitionError.mockReturnValue(false)
  mocks.hasEverBeenEnabled.mockResolvedValue(false)
  mocks.deleteTranslation.mockResolvedValue(true)
})

describe("updateIncomingMessage", () => {
  const props = { ...baseProps, newText: "edited text" }

  test("replaces the text and publishes it to the conversation", async () => {
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })

    await updateIncomingMessage(props)

    expect(mocks.updateTextBySourceId).toHaveBeenCalledWith(
      "wamid.original",
      "ws-1",
      "edited text",
    )
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "messageUpdated",
        data: {
          messageId: "msg-1",
          newText: "edited text",
          removedAttachment: false,
        },
      }),
    )
  })

  test("warns and returns when the message is not stored and no retry was asked for", async () => {
    mocks.updateTextBySourceId.mockResolvedValue(null)

    await expect(updateIncomingMessage(props)).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      { messageId: "wamid.original" },
      expect.stringContaining("message not found"),
    )
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled()
  })

  test("throws on a missing message when a retry was asked for, so the job retries", async () => {
    mocks.updateTextBySourceId.mockResolvedValue(null)

    await expect(
      updateIncomingMessage(
        { ...props, retryIfMissing: true },
        jobOnAttempt(1),
      ),
    ).rejects.toThrow("not stored yet")

    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled()
  })

  test("warns once instead of throwing on the last attempt", async () => {
    mocks.updateTextBySourceId.mockResolvedValue(null)

    await expect(
      updateIncomingMessage(
        { ...props, retryIfMissing: true },
        jobOnAttempt(4),
      ),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      { messageId: "wamid.original" },
      expect.stringContaining("after the last attempt"),
    )
  })

  test("still applies the edit on a retry once the message exists", async () => {
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })

    await updateIncomingMessage(
      { ...props, retryIfMissing: true },
      jobOnAttempt(3),
    )

    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(1)
  })

  test("publishes without a route and warns when the conversation is gone", async () => {
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })
    mocks.findConversation.mockResolvedValue(null)

    await updateIncomingMessage(props)

    expect(logger.warn).toHaveBeenCalledWith(
      { conversationId: "conv-1", workspaceId: "ws-1" },
      expect.stringContaining("conversation not found"),
    )
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(1)
  })
})

describe("deleteIncomingMessage", () => {
  test("soft-deletes the message and publishes the deletion to the conversation", async () => {
    mocks.deleteBySourceId.mockResolvedValue([
      { id: "msg-1", conversationId: "conv-1" },
    ])

    await deleteIncomingMessage(baseProps)

    expect(mocks.deleteBySourceId).toHaveBeenCalledWith(
      "wamid.original",
      "ws-1",
      expect.any(Date),
    )
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "messageDeleted",
        data: { messageIds: ["msg-1"] },
      }),
    )
  })

  test("keeps the unsend behavior of other channels: a missing message only warns", async () => {
    mocks.deleteBySourceId.mockResolvedValue([])

    await expect(deleteIncomingMessage(baseProps)).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      { messageId: "wamid.original" },
      expect.stringContaining("message not found"),
    )
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled()
  })

  test("throws on a missing message when a retry was asked for", async () => {
    mocks.deleteBySourceId.mockResolvedValue([])

    await expect(
      deleteIncomingMessage(
        { ...baseProps, retryIfMissing: true },
        jobOnAttempt(0),
      ),
    ).rejects.toThrow("not stored yet")
  })

  test("warns once instead of throwing on the last attempt", async () => {
    mocks.deleteBySourceId.mockResolvedValue([])

    await expect(
      deleteIncomingMessage(
        { ...baseProps, retryIfMissing: true },
        jobOnAttempt(4),
      ),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  test("throws when a retry was asked for but no job says which attempt this is", async () => {
    mocks.deleteBySourceId.mockResolvedValue([])

    await expect(
      deleteIncomingMessage({ ...baseProps, retryIfMissing: true }),
    ).rejects.toThrow("not stored yet")
  })
})

describe("applyIncomingTextUpdate (shared with the comment edit)", () => {
  const props = {
    integrationType: "messenger",
    integrationIdentifier: "page-1",
    sourceId: "comment-1",
    newText: "edited comment",
    action: "updateIncomingComment",
  }

  test("hands a missing row to the caller and publishes nothing", async () => {
    mocks.updateTextBySourceId.mockResolvedValue(null)
    const onMissing = vi.fn()

    await applyIncomingTextUpdate({ ...props, onMissing })

    expect(onMissing).toHaveBeenCalledTimes(1)
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled()
  })

  test("names the caller's action when the conversation is gone", async () => {
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })
    mocks.findConversation.mockResolvedValue(null)

    await applyIncomingTextUpdate({ ...props, onMissing: vi.fn() })

    expect(logger.warn).toHaveBeenCalledWith(
      { conversationId: "conv-1", workspaceId: "ws-1" },
      "updateIncomingComment: conversation not found for realtime route",
    )
  })
})

describe("realtime events wait for the conversation's message ingress", () => {
  const lockedProps = {
    ...baseProps,
    newText: "edited text",
    retryIfMissing: true,
  }

  const holdIngressLock = () => {
    let release: () => Promise<void> = async () => undefined
    mocks.runExclusive.mockImplementation(
      ({ fn }: { fn: () => Promise<unknown> }) =>
        new Promise<void>((resolve) => {
          release = async () => {
            await fn()
            resolve()
          }
        }),
    )
    return () => release()
  }

  test("an edit is stored at once but published only after the ingress lock is free", async () => {
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })
    const release = holdIngressLock()

    const pending = updateIncomingMessage(lockedProps)
    await vi.waitFor(() => expect(mocks.runExclusive).toHaveBeenCalled())

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ingress:conv:conv-1" }),
    )
    expect(mocks.updateTextBySourceId).toHaveBeenCalled()
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled()

    await release()
    await pending

    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(1)
  })

  test("an unsend is stored at once but published only after the ingress lock is free", async () => {
    mocks.deleteBySourceId.mockResolvedValue([
      { id: "msg-1", conversationId: "conv-1" },
    ])
    const release = holdIngressLock()

    const pending = deleteIncomingMessage({
      ...baseProps,
      retryIfMissing: true,
    })
    await vi.waitFor(() => expect(mocks.runExclusive).toHaveBeenCalled())

    expect(mocks.deleteBySourceId).toHaveBeenCalled()
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled()

    await release()
    await pending

    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["a Messenger unsend", () => deleteIncomingMessage(baseProps)],
    [
      "a comment edit",
      () =>
        applyIncomingTextUpdate({
          integrationType: "messenger",
          integrationIdentifier: "page-1",
          sourceId: "comment-1",
          newText: "edited comment",
          action: "updateIncomingComment",
          onMissing: vi.fn(),
        }),
    ],
  ])("publishes %s at once, without taking the ingress lock", async (_label, run) => {
    mocks.deleteBySourceId.mockResolvedValue([
      { id: "msg-1", conversationId: "conv-1" },
    ])
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })

    await run()

    expect(mocks.runExclusive).not.toHaveBeenCalled()
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(1)
  })

  test("publishes without the lock, and warns, when the lock cannot be acquired", async () => {
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })
    const lockError = new Error("lock busy")
    mocks.runExclusive.mockRejectedValue(lockError)
    mocks.isLockAcquisitionError.mockImplementation(
      (error: unknown, key: string) =>
        error === lockError && key === "ingress:conv:conv-1",
    )

    await updateIncomingMessage(lockedProps)

    expect(logger.warn).toHaveBeenCalledWith(
      { err: lockError, conversationId: "conv-1" },
      expect.stringContaining("ingress lock"),
    )
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(1)
  })

  test("lets any other lock error fail the job so it retries", async () => {
    mocks.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })
    mocks.runExclusive.mockRejectedValue(new Error("redis down"))

    await expect(updateIncomingMessage(lockedProps)).rejects.toThrow(
      "redis down",
    )
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled()
  })
})

describe("translation of a changed message", () => {
  const edited = { id: "msg-1", conversationId: "conv-1" }
  const eventTypes = () =>
    mocks.publishRealtimeEvent.mock.calls.map(
      ([, event]) => (event as { eventType: string }).eventType,
    )

  test("a workspace that never enabled translation costs no extra work on an edit or an unsend", async () => {
    mocks.updateTextBySourceId.mockResolvedValue(edited)
    mocks.deleteBySourceId.mockResolvedValue([edited])

    await updateIncomingMessage({ ...baseProps, newText: "x" })
    await deleteIncomingMessage(baseProps)

    expect(mocks.deleteTranslation).not.toHaveBeenCalled()
    expect(eventTypes()).toEqual(["messageUpdated", "messageDeleted"])
  })

  test("an edit drops the translation and its claim, and tells the inbox before the update", async () => {
    mocks.hasEverBeenEnabled.mockResolvedValue(true)
    mocks.updateTextBySourceId.mockResolvedValue(edited)

    await updateIncomingMessage({ ...baseProps, newText: "x" })

    expect(mocks.deleteTranslation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      messageId: "msg-1",
    })
    expect(eventTypes()).toEqual([
      "messageTranslationUpdated",
      "messageUpdated",
    ])
    expect(mocks.publishRealtimeEvent.mock.calls[0]?.[1]).toMatchObject({
      data: {
        conversationId: "conv-1",
        items: [{ messageId: "msg-1", removed: true }],
      },
    })
  })

  test("an unsend drops the translation of every deleted row", async () => {
    mocks.hasEverBeenEnabled.mockResolvedValue(true)
    mocks.deleteBySourceId.mockResolvedValue([
      edited,
      { id: "msg-2", conversationId: "conv-1" },
    ])

    await deleteIncomingMessage(baseProps)

    expect(mocks.deleteTranslation).toHaveBeenCalledTimes(2)
    expect(eventTypes()).toEqual([
      "messageTranslationUpdated",
      "messageTranslationUpdated",
      "messageDeleted",
    ])
  })

  test("no removed event when the message had no translation row", async () => {
    mocks.hasEverBeenEnabled.mockResolvedValue(true)
    mocks.deleteTranslation.mockResolvedValue(false)
    mocks.updateTextBySourceId.mockResolvedValue(edited)

    await updateIncomingMessage({ ...baseProps, newText: "x" })

    expect(mocks.deleteTranslation).toHaveBeenCalledTimes(1)
    expect(eventTypes()).toEqual(["messageUpdated"])
  })

  test("a failure to drop the translation is logged and never fails the edit", async () => {
    mocks.hasEverBeenEnabled.mockResolvedValue(true)
    const failure = new Error("redis down")
    mocks.deleteTranslation.mockRejectedValue(failure)
    mocks.updateTextBySourceId.mockResolvedValue(edited)

    await expect(
      updateIncomingMessage({ ...baseProps, newText: "x" }),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, messageId: "msg-1" }),
      expect.stringContaining("translation"),
    )
    expect(eventTypes()).toEqual(["messageUpdated"])
  })
})
