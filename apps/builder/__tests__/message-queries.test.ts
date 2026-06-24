import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    findById: vi.fn(),
    findTriggerMessage: vi.fn(),
    listByConversation: vi.fn(),
  }
  return {
    assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
    db: {
      query: {
        conversationModel: { findFirst: vi.fn() },
        contactInboxModel: { findFirst: vi.fn() },
      },
    },
    getSafeSinceTime: vi.fn((value: Date | undefined) => value),
    repo,
    createMessageRepository: vi.fn().mockResolvedValue(repo),
    resolveTenantSettings: vi
      .fn()
      .mockResolvedValue({ storageUrl: "https://storage.example.com" }),
    uploader: { getPresignedDownload: vi.fn() },
  }
})

vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, storageUrl: string) =>
    `${storageUrl}/${path}`,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: mocks.db,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: mocks.getSafeSinceTime,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: mocks.uploader,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

const { findMessage, listMessages, publicFindContactMessage } = await import(
  "../src/features/messages/queries"
)

describe("message queries", () => {
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

  test("findMessage scopes repository lookup by workspaceId", async () => {
    const createdAt = new Date("2026-06-01T00:00:00Z")

    await findMessage({
      id: "msg-1",
      workspaceId: "ws-1",
      createdAt,
    })

    expect(mocks.repo.findById).toHaveBeenCalledWith({
      id: "msg-1",
      createdAt,
      workspaceId: "ws-1",
    })
  })

  test("publicFindContactMessage uses conversation-scoped lookup without requiring createdAt from the caller", async () => {
    const conversationCreatedAt = new Date("2026-05-01T00:00:00Z")
    mocks.db.query.conversationModel.findFirst.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
      createdAt: conversationCreatedAt,
    })
    mocks.repo.findById.mockRejectedValue(new Error("unscoped lookup"))

    await publicFindContactMessage({
      messageId: "msg-1",
      conversationId: "conv-1",
      workspaceId: "ws-1",
    })

    expect(mocks.db.query.conversationModel.findFirst).toHaveBeenCalledWith({
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

  test("listMessages scopes conversation metadata lookup by workspaceId", async () => {
    await listMessages({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      perPage: 20,
    })

    expect(mocks.db.query.conversationModel.findFirst).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
  })
})
