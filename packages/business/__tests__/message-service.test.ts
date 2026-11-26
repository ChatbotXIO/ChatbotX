import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    createWithAttachments: vi.fn(),
    bulkCreateAttachments: vi.fn(),
    create: vi.fn(),
    deleteAttachmentsByMessageId: vi.fn(),
    deleteById: vi.fn(),
    deleteBySourceId: vi.fn(),
    findById: vi.fn(),
    findLastByConversation: vi.fn(),
    hardDeleteAllByContactInbox: vi.fn(),
    hardDeleteById: vi.fn(),
    listIncomingTextsByContactInbox: vi.fn(),
    updateMessageText: vi.fn(),
    updateTextBySourceId: vi.fn(),
    updateSendError: vi.fn(),
    updateSourceId: vi.fn(),
  }
  return {
    db: {
      query: { messageModel: { findFirst: vi.fn(), findMany: vi.fn() } },
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        await callback({}),
    },
    repo,
    createMessageRepository: vi.fn().mockResolvedValue(repo),
    findTranslationSettings: vi.fn(),
    deleteTranslations: vi.fn(),
    withCache: vi.fn(
      async (
        _key: string,
        factory: () => Promise<unknown>,
        _options: Record<string, unknown>,
      ) => factory(),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: mocks.db,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  inboxTranslationSettingsRepository: {
    findByWorkspaceId: mocks.findTranslationSettings,
  },
  mediaLibraryFileRepository: {},
  messageTranslationRepository: {
    deleteByMessageIds: mocks.deleteTranslations,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
}))

// The following are reached only because messageService.createOutgoing is
// wired in as a class field (module-scope import), not because any test here
// exercises it — this file only covers the pre-existing read/delete methods.
vi.mock("@chatbotx.io/filesystem", () => ({}))
vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: {
    conversationAssigned: "conversationAssigned",
    messageCreated: "messageCreated",
    whatsappCallClaimedElsewhere: "whatsappCallClaimedElsewhere",
    whatsappCallPermissionUpdated: "whatsappCallPermissionUpdated",
    whatsappCallTransportEnded: "whatsappCallTransportEnded",
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({}))
vi.mock("../src/contact-inbox/service", () => ({ contactInboxService: {} }))
vi.mock("../src/conversation/service", () => ({ conversationService: {} }))
vi.mock("../src/working-hours/agent-reply-metric", () => ({
  recordAgentReply: vi.fn(),
}))
vi.mock("../src/platform/settings", () => ({ resolveTenantSettings: vi.fn() }))

const { messageService } = await import("../src/message/service")

describe("messageService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("listLastMessages reads through the message repository and returns chronological order", async () => {
    const newer = { id: "msg-2", createdAt: new Date("2026-01-02") }
    const older = { id: "msg-1", createdAt: new Date("2026-01-01") }
    const sinceTime = new Date("2025-01-01")
    mocks.repo.findLastByConversation.mockResolvedValue([newer, older])

    const result = await messageService.listLastMessages({
      conversationId: "conv-1",
      limit: 2,
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.createMessageRepository).toHaveBeenCalledTimes(1)
    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith("conv-1", {
      messageTypes: ["incoming", "outgoing"],
      limit: 2,
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toEqual([older, newer])
    // Reads straight through to the repository — caching this call was removed
    // deliberately, so re-introducing it should break here first.
    expect(mocks.withCache).not.toHaveBeenCalled()
  })

  test("findLatestIncomingMessage reads the newest incoming message through the repository", async () => {
    const message = { id: "msg-1" }
    const sinceTime = new Date("2025-01-01")
    mocks.repo.findLastByConversation.mockResolvedValue([message])

    const result = await messageService.findLatestIncomingMessage({
      conversationId: "conv-1",
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith("conv-1", {
      messageTypes: ["incoming"],
      limit: 1,
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toBe(message)
  })

  test("findLatestIncomingMessageWithAttachments requests attachments from the repository", async () => {
    const message = {
      id: "msg-1",
      attachments: [{ id: "attachment-1", fileType: "image" }],
    }
    const sinceTime = new Date("2025-01-01")
    mocks.repo.findLastByConversation.mockResolvedValue([message])

    const result =
      await messageService.findLatestIncomingMessageWithAttachments({
        conversationId: "conv-1",
        sinceTime,
        workspaceId: "ws-1",
      })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith("conv-1", {
      messageTypes: ["incoming"],
      limit: 1,
      requireCompleteResults: true,
      sinceTime,
      withAttachments: true,
      workspaceId: "ws-1",
    })
    expect(result).toBe(message)
  })

  test("findById reads one message through the repository", async () => {
    const message = {
      id: "msg-1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      workspaceId: "ws-1",
    }
    mocks.repo.findById.mockResolvedValue(message)

    const result = await messageService.findById({
      id: "msg-1",
      createdAt: message.createdAt,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.findById).toHaveBeenCalledWith({
      id: "msg-1",
      createdAt: message.createdAt,
      workspaceId: "ws-1",
    })
    expect(result).toBe(message)
  })

  test("listIncomingTextsByContactInbox delegates to the repository", async () => {
    const sinceTime = new Date("2025-01-01")
    mocks.repo.listIncomingTextsByContactInbox.mockResolvedValue([
      "newest",
      "older",
    ])

    const result = await messageService.listIncomingTextsByContactInbox({
      contactInboxId: "contact-inbox-1",
      limit: 200,
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.listIncomingTextsByContactInbox).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      limit: 200,
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toEqual(["newest", "older"])
  })

  test("hardDeleteAllByContactInbox delegates to the repository", async () => {
    const sinceTime = new Date("2025-01-01")
    mocks.repo.hardDeleteAllByContactInbox.mockResolvedValue({
      attachmentPaths: ["origin.jpg", "thumb.jpg"],
    })

    const result = await messageService.hardDeleteAllByContactInbox({
      contactInboxId: "contact-inbox-1",
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.hardDeleteAllByContactInbox).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ attachmentPaths: ["origin.jpg", "thumb.jpg"] })
  })

  test("uses the supplied transaction and preserves delete-by-source semantics", async () => {
    const tx = {} as never
    const createdAt = new Date("2026-01-01T00:00:00Z")
    mocks.repo.deleteBySourceId.mockResolvedValue([{ id: "message-1" }])

    await expect(
      messageService.delete({
        id: "message-1",
        sourceId: "provider-1",
        workspaceId: "ws-1",
        createdAt,
        tx,
      }),
    ).resolves.toEqual([{ id: "message-1" }])

    expect(mocks.createMessageRepository).toHaveBeenCalledWith(tx)
    expect(mocks.repo.deleteBySourceId).toHaveBeenCalledWith(
      "provider-1",
      "ws-1",
      createdAt,
    )
    expect(mocks.repo.deleteById).not.toHaveBeenCalled()
  })

  describe("deleting a message removes its translation", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")

    test("a soft delete drops the translation rows of every deleted message", async () => {
      mocks.findTranslationSettings.mockResolvedValue({ enabledAt: createdAt })
      mocks.repo.deleteBySourceId.mockResolvedValue([
        { id: "message-1" },
        { id: "message-2" },
      ])

      await messageService.delete({
        id: "message-1",
        sourceId: "provider-1",
        workspaceId: "ws-1",
        createdAt,
      })

      expect(mocks.deleteTranslations).toHaveBeenCalledWith("ws-1", [
        "message-1",
        "message-2",
      ])
    })

    test("a hard delete retried after the message is gone still drops the row", async () => {
      mocks.findTranslationSettings.mockResolvedValue({ enabledAt: createdAt })
      mocks.repo.hardDeleteById.mockResolvedValue([])

      await expect(
        messageService.hardDelete({
          id: "message-1",
          workspaceId: "ws-1",
          createdAt,
        }),
      ).resolves.toEqual([])

      expect(mocks.deleteTranslations).toHaveBeenCalledWith("ws-1", [
        "message-1",
      ])
    })

    test("costs no query for a workspace that never turned translation on", async () => {
      mocks.findTranslationSettings.mockResolvedValue(null)
      mocks.repo.deleteById.mockResolvedValue([{ id: "message-1" }])

      await messageService.delete({
        id: "message-1",
        workspaceId: "ws-1",
        createdAt,
      })

      expect(mocks.deleteTranslations).not.toHaveBeenCalled()
    })

    test.each([
      ["the translation delete", "deleteTranslations"],
      ["the settings read", "findTranslationSettings"],
    ] as const)("a failure of %s never fails a delete that already happened", async (_label, failing) => {
      mocks.findTranslationSettings.mockResolvedValue({ enabledAt: createdAt })
      // Once per delete below, so the failure does not outlive this test.
      mocks[failing]
        .mockRejectedValueOnce(new Error("connection reset"))
        .mockRejectedValueOnce(new Error("connection reset"))
      mocks.repo.deleteById.mockResolvedValue([{ id: "message-1" }])
      mocks.repo.hardDeleteById.mockResolvedValue([{ id: "message-2" }])

      await expect(
        messageService.delete({
          id: "message-1",
          workspaceId: "ws-1",
          createdAt,
        }),
      ).resolves.toEqual([{ id: "message-1" }])
      await expect(
        messageService.hardDelete({
          id: "message-2",
          workspaceId: "ws-1",
          createdAt,
        }),
      ).resolves.toEqual([{ id: "message-2" }])
    })
  })

  test("maps message write inputs to repository methods", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")
    mocks.repo.updateSourceId.mockResolvedValue({ id: "message-1" })
    mocks.repo.updateSendError.mockResolvedValue({ id: "message-1" })

    await messageService.updateSourceId({
      id: "message-1",
      sourceId: "provider-1",
      workspaceId: "ws-1",
      createdAt,
    })
    await messageService.updateSendError({
      id: "message-1",
      sendError: "provider unavailable",
      workspaceId: "ws-1",
      createdAt,
    })

    expect(mocks.repo.updateSourceId).toHaveBeenCalledWith(
      "message-1",
      "provider-1",
      "ws-1",
      createdAt,
    )
    expect(mocks.repo.updateSendError).toHaveBeenCalledWith(
      "message-1",
      "provider unavailable",
      "ws-1",
      createdAt,
    )
  })

  test("preserves attachment replacement timestamps and skips an empty insert", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")
    await messageService.replaceAttachments({
      attachments: [],
      createdAt,
      id: "message-1",
      workspaceId: "ws-1",
    })

    expect(mocks.repo.deleteAttachmentsByMessageId).toHaveBeenCalledWith(
      "message-1",
      "ws-1",
      createdAt,
    )
    expect(mocks.repo.bulkCreateAttachments).not.toHaveBeenCalled()

    await messageService.replaceAttachments({
      attachments: [{ path: "file.png" }] as never,
      createdAt,
      id: "message-1",
      workspaceId: "ws-1",
    })
    expect(mocks.repo.bulkCreateAttachments).toHaveBeenCalledWith([
      expect.objectContaining({
        messageCreatedAt: createdAt,
        messageId: "message-1",
        path: "file.png",
      }),
    ])
  })

  test("passes text update arguments in repository order", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")
    await messageService.updateText({
      createdAt,
      id: "message-1",
      text: "updated",
      workspaceId: "ws-1",
    })

    expect(mocks.repo.updateMessageText).toHaveBeenCalledWith(
      "message-1",
      "ws-1",
      "updated",
      createdAt,
    )
  })

  test("updates text and replaces attachments in one transaction", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")
    mocks.repo.updateMessageText.mockResolvedValue({
      conversationId: "conversation-1",
      id: "message-1",
    })

    await expect(
      messageService.edit({
        attachments: [{ path: "file.png" }] as never,
        createdAt,
        id: "message-1",
        replaceAttachments: true,
        text: "updated",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ conversationId: "conversation-1", id: "message-1" })

    expect(mocks.repo.deleteAttachmentsByMessageId).toHaveBeenCalledWith(
      "message-1",
      "ws-1",
      createdAt,
    )
    expect(mocks.repo.bulkCreateAttachments).toHaveBeenCalledTimes(1)
  })

  test("does not replace attachments when the text update finds no message", async () => {
    mocks.repo.updateMessageText.mockResolvedValue(null)

    await expect(
      messageService.edit({
        attachments: [{ path: "file.png" }] as never,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        id: "missing",
        replaceAttachments: true,
        text: "updated",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Message not found")

    expect(mocks.repo.deleteAttachmentsByMessageId).not.toHaveBeenCalled()
  })

  test("passes messages and attachments unchanged to the combined repository write", async () => {
    const message = { id: "message-1", workspaceId: "ws-1" }
    const attachments = [{ path: "file.png" }]
    mocks.repo.createWithAttachments.mockResolvedValue({ message, attachments })

    await messageService.createWithAttachments({
      attachments: attachments as never,
      message: message as never,
    })

    expect(mocks.repo.createWithAttachments).toHaveBeenCalledWith(
      message,
      attachments,
    )
  })
})

describe("messageService changes by provider message id", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
  })

  test("updateTextBySourceId replaces the text in the caller's workspace and returns where the message is", async () => {
    mocks.repo.updateTextBySourceId.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
    })

    const result = await messageService.updateTextBySourceId({
      sourceId: "wamid.1",
      workspaceId: "ws-1",
      text: "edited",
    })

    expect(mocks.repo.updateTextBySourceId).toHaveBeenCalledWith(
      "wamid.1",
      "ws-1",
      "edited",
    )
    expect(result).toEqual({ id: "msg-1", conversationId: "conv-1" })
  })

  test("updateTextBySourceId returns null when no message has that id", async () => {
    mocks.repo.updateTextBySourceId.mockResolvedValue(null)

    await expect(
      messageService.updateTextBySourceId({
        sourceId: "wamid.missing",
        workspaceId: "ws-1",
        text: "edited",
      }),
    ).resolves.toBeNull()
  })

  test("deleteBySourceId soft-deletes in the caller's workspace and returns where the rows were", async () => {
    const at = new Date("2026-11-17T00:00:00Z")
    mocks.repo.deleteBySourceId.mockResolvedValue([
      { id: "msg-1", conversationId: "conv-1" },
    ])

    const result = await messageService.deleteBySourceId({
      sourceId: "wamid.1",
      workspaceId: "ws-1",
      createdAtHint: at,
    })

    expect(mocks.repo.deleteBySourceId).toHaveBeenCalledWith(
      "wamid.1",
      "ws-1",
      at,
    )
    expect(result).toEqual([{ id: "msg-1", conversationId: "conv-1" }])
  })
})
