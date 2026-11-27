import { beforeEach, describe, expect, test, vi } from "vitest"

const { findThreadAnchorsBySourceIds } = vi.hoisted(() => ({
  findThreadAnchorsBySourceIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/database/repositories")>()
  return {
    ...original,
    createMessageRepository: vi.fn(async () => ({
      findThreadAnchorsBySourceIds,
    })),
  }
})
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macAnalyticsService: {} }))

const { conversationService } = await import("../src/conversation/service")

const base = {
  workspaceId: "ws-1",
  contactId: "contact-1",
  contactInboxId: "ci-1",
  messageSourceId: "<msg@x>",
  threadSourceIds: ["<parent@x>", "<root@x>"],
  threadKey: "<root@x>",
}

describe("conversationService.resolveEmailThreadConversation", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    findThreadAnchorsBySourceIds.mockReset()
  })

  test("lands in the conversation of the message itself when it is already stored", async () => {
    findThreadAnchorsBySourceIds.mockResolvedValue([
      { sourceId: "<msg@x>", conversationId: "conv-self" },
      { sourceId: "<parent@x>", conversationId: "conv-parent" },
    ])
    const findByUncached = vi
      .spyOn(conversationService, "findByUncached")
      .mockResolvedValue({ id: "conv-self" } as never)

    const result =
      await conversationService.resolveEmailThreadConversation(base)

    expect(result).toEqual({ id: "conv-self" })
    expect(findByUncached).toHaveBeenCalledWith({
      tx: undefined,
      where: { id: "conv-self", workspaceId: "ws-1", contactId: "contact-1" },
    })
  })

  test("prefers the nearest parent over the thread root", async () => {
    findThreadAnchorsBySourceIds.mockResolvedValue([
      { sourceId: "<root@x>", conversationId: "conv-root" },
      { sourceId: "<parent@x>", conversationId: "conv-parent" },
    ])
    vi.spyOn(conversationService, "findByUncached").mockImplementation(
      async ({ where }) => ({ id: where.id }) as never,
    )

    const result =
      await conversationService.resolveEmailThreadConversation(base)

    expect(result).toEqual({ id: "conv-parent" })
  })

  test("skips an anchor whose conversation belongs to another contact", async () => {
    findThreadAnchorsBySourceIds.mockResolvedValue([
      { sourceId: "<parent@x>", conversationId: "conv-foreign" },
      { sourceId: "<root@x>", conversationId: "conv-root" },
    ])
    vi.spyOn(conversationService, "findByUncached").mockImplementation(
      async ({ where }) =>
        where.id === "conv-root" ? ({ id: "conv-root" } as never) : undefined,
    )

    const result =
      await conversationService.resolveEmailThreadConversation(base)

    expect(result).toEqual({ id: "conv-root" })
  })

  test("opens a new thread keyed by the root Message-ID when nothing is stored", async () => {
    findThreadAnchorsBySourceIds.mockResolvedValue([])
    const findOrCreate = vi
      .spyOn(conversationService, "findOrCreate")
      .mockResolvedValue({ id: "conv-new" } as never)

    const result =
      await conversationService.resolveEmailThreadConversation(base)

    expect(result).toEqual({ id: "conv-new" })
    expect(findOrCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sourceId: "email:<root@x>",
      tx: undefined,
    })
  })

  test("queries anchors for the message and every parent, once", async () => {
    findThreadAnchorsBySourceIds.mockResolvedValue([])
    vi.spyOn(conversationService, "findOrCreate").mockResolvedValue({} as never)

    await conversationService.resolveEmailThreadConversation(base)

    expect(findThreadAnchorsBySourceIds).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        sourceIds: ["<msg@x>", "<parent@x>", "<root@x>"],
      }),
    )
  })
})
