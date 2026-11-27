import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetchConvMessages: vi.fn(),
  bulkImportMessages: vi.fn(),
}))

vi.mock("../src/integration/handlers/coexist/messenger-helpers", () => ({
  fetchConvMessages: mocks.fetchConvMessages,
}))
vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  bulkImportMessages: mocks.bulkImportMessages,
  maxNumericId: (a: string | null, b: string | null) => {
    if (a === null || b === null) {
      return a ?? b
    }
    return BigInt(a) < BigInt(b) ? b : a
  },
}))

const { emptyTally, importMessengerConversation } = await import(
  "../src/integration/handlers/coexist/messenger-conversation-import"
)

const input = (tally = emptyTally()) => ({
  workspaceId: "ws-1",
  runId: "run-1",
  conversationId: "t_1",
  link: { contactInboxId: "ci", contactId: "c", conversationId: "conv" },
  cutoff: new Date(0),
  ceiling: null,
  pageId: "page",
  accessToken: "token",
  version: undefined,
  defaultCountry: null,
  aiReadsSyncedHistory: false,
  applyBucThrottle: vi.fn(),
  respectPause: () => Promise.resolve(),
  idFactory: (() => "id") as never,
  tally,
})

const written = (importedMessages: number, id: string, at: string) => ({
  importedMessages,
  skippedMessages: 0,
  newestMessageAt: new Date(at),
  oldestMessageAt: new Date(at),
  newestIncomingMessageAt: null,
  newestMessageId: id,
})

/** Feeds each page to the walk's `onPage`, then fails after the given page. */
const walkPages = (pages: number, failAfter?: number) => {
  mocks.fetchConvMessages.mockImplementation(
    async (props: { onPage: (m: never[], d: object) => Promise<void> }) => {
      for (let page = 1; page <= pages; page += 1) {
        await props.onPage([], {})
        if (page === failAfter) {
          throw new Error("Graph 500")
        }
      }
      return { messages: [], discovered: {} }
    },
  )
}

describe("importMessengerConversation tally", () => {
  beforeEach(() => {
    mocks.fetchConvMessages.mockReset()
    mocks.bulkImportMessages.mockReset()
  })

  it("keeps what earlier pages wrote when a later page fails", async () => {
    mocks.bulkImportMessages.mockResolvedValueOnce(
      written(3, "900", "2026-01-02T00:00:00Z"),
    )
    walkPages(2, 1)
    const tally = emptyTally()

    await expect(importMessengerConversation(input(tally))).rejects.toThrow()

    expect(tally.importedMessages).toBe(3)
    expect(tally.activity?.aiMarkerMessageId).toBe("900")
  })

  it("a retry with the same tally adds to it instead of replacing it", async () => {
    const tally = emptyTally()
    mocks.bulkImportMessages.mockResolvedValueOnce(
      written(3, "900", "2026-01-02T00:00:00Z"),
    )
    walkPages(2, 1)
    await expect(importMessengerConversation(input(tally))).rejects.toThrow()

    // The second attempt reads another conversation: older messages.
    mocks.bulkImportMessages.mockResolvedValueOnce(
      written(2, "100", "2026-01-01T00:00:00Z"),
    )
    walkPages(1)
    await importMessengerConversation(input(tally))

    expect(tally.importedMessages).toBe(5)
    expect(tally.activity?.aiMarkerMessageId).toBe("900")
    expect(tally.activity?.newestMessageAt).toEqual(
      new Date("2026-01-02T00:00:00Z"),
    )
  })

  it("leaves the AI marker unset when the AI reads the synced history", async () => {
    mocks.bulkImportMessages.mockResolvedValueOnce(
      written(1, "900", "2026-01-02T00:00:00Z"),
    )
    walkPages(1)
    const tally = emptyTally()

    await importMessengerConversation({
      ...input(tally),
      aiReadsSyncedHistory: true,
    })

    expect(tally.activity?.aiMarkerMessageId).toBeNull()
  })
})
