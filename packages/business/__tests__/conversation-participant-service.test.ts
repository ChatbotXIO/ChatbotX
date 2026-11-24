import { beforeEach, describe, expect, test, vi } from "vitest"

// conversationParticipantService.recordReply: delegates to the monotonic
// upsert and never rejects (the message is already sent); listReplied passes
// the keyset input through.

const errorMock = vi.fn()
vi.mock("../src/logger", () => ({
  logger: { error: errorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

const upsertReplyMock = vi.fn()
const listRepliedByConversationMock = vi.fn()
vi.mock("@chatbotx.io/database/repositories", () => ({
  conversationParticipantRepository: {
    upsertReply: upsertReplyMock,
    listRepliedByConversation: listRepliedByConversationMock,
  },
}))

const { conversationParticipantService } = await import(
  "../src/conversation-participant/service"
)

const INPUT = {
  workspaceId: "ws-1",
  conversationId: "conv-1",
  userId: "user-1",
  at: new Date("2026-11-20T10:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("conversationParticipantService", () => {
  test("recordReply upserts with the given input", async () => {
    upsertReplyMock.mockResolvedValue(true)

    await conversationParticipantService.recordReply(INPUT)

    expect(upsertReplyMock).toHaveBeenCalledExactlyOnceWith(INPUT)
  })

  test("recordReply is a no-op success for a stale or duplicate event", async () => {
    upsertReplyMock.mockResolvedValue(false)

    await expect(
      conversationParticipantService.recordReply(INPUT),
    ).resolves.toBeUndefined()
    expect(errorMock).not.toHaveBeenCalled()
  })

  test("recordReply swallows and logs a repository failure", async () => {
    const err = new Error("db down")
    upsertReplyMock.mockRejectedValue(err)

    await expect(
      conversationParticipantService.recordReply(INPUT),
    ).resolves.toBeUndefined()
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err, conversationId: "conv-1" }),
      expect.any(String),
    )
  })

  test("listReplied forwards the keyset input and returns the rows", async () => {
    const rows = [{ userId: "user-1" }]
    listRepliedByConversationMock.mockResolvedValue(rows)
    const input = {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      limit: 50,
      cursor: { lastRepliedAt: INPUT.at, userId: "user-2" },
    }

    await expect(
      conversationParticipantService.listReplied(input),
    ).resolves.toBe(rows)
    expect(listRepliedByConversationMock).toHaveBeenCalledWith(input)
  })
})
