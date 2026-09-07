// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    findById: vi.fn(),
    findTriggerMessage: vi.fn(),
    listByConversation: vi.fn(),
  }
  return {
    repo,
    createMessageRepository: vi.fn().mockResolvedValue(repo),
    getSafeSinceTime: vi.fn((value: Date | undefined) => value),
    resolveTenantSettings: vi
      .fn()
      .mockResolvedValue({ storageUrl: "https://storage.example.com" }),
    contactInboxService: {
      findByUncached: vi.fn().mockResolvedValue(null),
      findRecentByContactId: vi.fn().mockResolvedValue(null),
    },
    conversationService: {
      findBy: vi.fn().mockResolvedValue(undefined),
    },
    uploader: { getPresignedDownload: vi.fn() },
  }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: mocks.getSafeSinceTime,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: mocks.uploader,
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: mocks.contactInboxService,
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: mocks.conversationService,
}))

const { findByIdWithUrls, findForContact, listForConversation } = await import(
  "../src/message/list-for-conversation"
)

describe("message list-for-conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
    })
    mocks.repo.listByConversation.mockResolvedValue({
      data: [],
      nextCursor: null,
    })
    mocks.repo.findById.mockResolvedValue({
      id: "msg-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      attachments: [],
    })
    mocks.repo.findTriggerMessage.mockResolvedValue({
      id: "msg-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      attachments: [],
    })
  })

  describe("findByIdWithUrls", () => {
    test("scopes repository lookup by workspaceId", async () => {
      const createdAt = new Date("2026-06-01T00:00:00Z")

      await findByIdWithUrls({ id: "msg-1", workspaceId: "ws-1", createdAt })

      expect(mocks.repo.findById).toHaveBeenCalledWith({
        id: "msg-1",
        createdAt,
        workspaceId: "ws-1",
      })
    })

    test("throws when no message is found", async () => {
      mocks.repo.findById.mockResolvedValue(null)

      await expect(
        findByIdWithUrls({
          id: "missing",
          workspaceId: "ws-1",
          createdAt: new Date(),
        }),
      ).rejects.toThrow()
    })
  })

  describe("findForContact", () => {
    test("uses conversation-scoped lookup without requiring createdAt from the caller", async () => {
      const conversationCreatedAt = new Date("2026-05-01T00:00:00Z")
      mocks.conversationService.findBy.mockResolvedValue({
        id: "conv-1",
        workspaceId: "ws-1",
        createdAt: conversationCreatedAt,
      })
      mocks.repo.findById.mockRejectedValue(new Error("unscoped lookup"))

      await findForContact({
        messageId: "msg-1",
        conversationId: "conv-1",
        workspaceId: "ws-1",
      })

      expect(mocks.conversationService.findBy).toHaveBeenCalledWith({
        where: { id: "conv-1", workspaceId: "ws-1" },
      })
      expect(mocks.repo.findTriggerMessage).toHaveBeenCalledWith({
        id: "msg-1",
        conversationId: "conv-1",
        workspaceId: "ws-1",
        sinceTime: conversationCreatedAt,
        requireCompleteResults: true,
      })
      expect(mocks.repo.findById).not.toHaveBeenCalled()
    })

    test("throws when the conversation does not exist", async () => {
      mocks.conversationService.findBy.mockResolvedValue(undefined)

      await expect(
        findForContact({
          messageId: "msg-1",
          conversationId: "missing-conv",
          workspaceId: "ws-1",
        }),
      ).rejects.toThrow()
    })
  })

  describe("listForConversation", () => {
    test("scopes conversation metadata lookup by workspaceId", async () => {
      await listForConversation({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        limit: 20,
      })

      expect(mocks.conversationService.findBy).toHaveBeenCalledWith({
        where: { id: "conv-1", workspaceId: "ws-1" },
      })
    })

    test("seeds the cursor from the contact inbox's last message hour when none is given", async () => {
      const lastMessageAt = new Date("2026-06-10T15:42:00Z")
      mocks.conversationService.findBy.mockResolvedValue({
        id: "conv-1",
        workspaceId: "ws-1",
        contactId: "contact-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })
      mocks.contactInboxService.findRecentByContactId.mockResolvedValue({
        lastMessageAt,
      })

      await listForConversation({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        limit: 20,
      })

      const call = mocks.repo.listByConversation.mock.calls[0]?.[0]
      expect(call.pagination.cursor.id).toBe("")
      // endOfHour: minutes/seconds pinned to the hour boundary (:59:59.999).
      expect(call.pagination.cursor.createdAt.getMinutes()).toBe(59)
    })

    test("presigns a pending wa-media attachment to its raw originPath, not a signed url", async () => {
      mocks.repo.listByConversation.mockResolvedValue({
        data: [
          {
            id: "msg-1",
            attachments: [{ originPath: "wa-media:abc" }],
          },
        ],
        nextCursor: null,
      })

      const result = await listForConversation({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        limit: 20,
      })

      expect(result.data[0].attachments[0].url).toBe("wa-media:abc")
      expect(mocks.uploader.getPresignedDownload).not.toHaveBeenCalled()
    })

    test("presigns a stored attachment via the uploader", async () => {
      mocks.uploader.getPresignedDownload.mockResolvedValue(
        "https://signed.example.com/file",
      )
      mocks.repo.listByConversation.mockResolvedValue({
        data: [
          {
            id: "msg-1",
            attachments: [{ originPath: "ws-1/files/a.png" }],
          },
        ],
        nextCursor: null,
      })

      const result = await listForConversation({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        limit: 20,
      })

      expect(mocks.uploader.getPresignedDownload).toHaveBeenCalledWith(
        "ws-1/files/a.png",
      )
      expect(result.data[0].attachments[0].url).toBe(
        "https://signed.example.com/file",
      )
    })
  })
})
