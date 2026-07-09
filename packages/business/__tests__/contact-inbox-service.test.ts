import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDbFindMany, mockDbSet, mockDbUpdate } = vi.hoisted(() => {
  const mockDbSet = vi.fn()
  const updateChain = {
    set: mockDbSet,
    where: vi.fn().mockResolvedValue(undefined),
  }
  mockDbSet.mockReturnValue(updateChain)
  return {
    mockDbFindMany: vi.fn(),
    mockDbSet,
    mockDbUpdate: vi.fn().mockReturnValue(updateChain),
  }
})

const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
  strings: [...strings],
  values,
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
    query: {
      contactInboxModel: {
        findMany: mockDbFindMany,
      },
    },
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  sql: mockSql,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    firstInteractionAt: "firstInteractionAt",
    id: "id",
    referral: "referral",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))

const { contactInboxService } = await import("../src/contact-inbox/service")

describe("contactInboxService timestamp helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("findLatestLastIncomingMessageAtByContactId returns the newest non-null timestamp", async () => {
    const latest = new Date("2026-01-03T00:00:00Z")
    mockDbFindMany.mockResolvedValue([
      { lastIncomingMessageAt: new Date("2026-01-01T00:00:00Z") },
      { lastIncomingMessageAt: null },
      { lastIncomingMessageAt: latest },
    ])

    await expect(
      contactInboxService.findLatestLastIncomingMessageAtByContactId({
        contactId: "contact-1",
      }),
    ).resolves.toBe(latest)
    expect(mockDbFindMany).toHaveBeenCalledWith({
      where: { contactId: "contact-1" },
      columns: { lastIncomingMessageAt: true },
    })
  })

  test("findLatestLastIncomingMessageAtByContactId returns null when no timestamp exists", async () => {
    mockDbFindMany.mockResolvedValue([
      { lastIncomingMessageAt: null },
      { lastIncomingMessageAt: null },
    ])

    await expect(
      contactInboxService.findLatestLastIncomingMessageAtByContactId({
        contactId: "contact-1",
      }),
    ).resolves.toBeNull()

    mockDbFindMany.mockResolvedValue([])
    await expect(
      contactInboxService.findLatestLastIncomingMessageAtByContactId({
        contactId: "contact-1",
      }),
    ).resolves.toBeNull()
  })

  test("findLatestLastIncomingMessageAtByContactId uses tx when provided", async () => {
    const txFindMany = vi
      .fn()
      .mockResolvedValue([{ lastIncomingMessageAt: new Date("2026-01-04") }])
    const tx = {
      query: {
        contactInboxModel: {
          findMany: txFindMany,
        },
      },
    }

    await contactInboxService.findLatestLastIncomingMessageAtByContactId({
      tx: tx as never,
      contactId: "contact-1",
    })

    expect(txFindMany).toHaveBeenCalledWith({
      where: { contactId: "contact-1" },
      columns: { lastIncomingMessageAt: true },
    })
    expect(mockDbFindMany).not.toHaveBeenCalled()
  })

  test("updateTracking does not infer firstInteractionAt from lastMessageAt", async () => {
    const lastMessageAt = new Date("2026-07-09T07:43:30.676Z")

    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      data: { lastMessageAt },
    })

    expect(mockDbUpdate).toHaveBeenCalled()
    expect(mockDbSet).toHaveBeenCalledWith({ lastMessageAt })
  })

  test("updateTracking stores explicit firstInteractionAt as an earliest timestamp", async () => {
    const firstInteractionAt = new Date("2026-05-11T04:02:22.000Z")
    const lastMessageAt = new Date("2026-07-09T07:43:30.676Z")

    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      data: { firstInteractionAt, lastMessageAt },
    })

    expect(mockDbSet).toHaveBeenCalledWith({
      firstInteractionAt: {
        strings: [
          "CASE WHEN ",
          " IS NULL OR ",
          " > ",
          " THEN ",
          " ELSE ",
          " END",
        ],
        values: [
          "firstInteractionAt",
          "firstInteractionAt",
          firstInteractionAt,
          firstInteractionAt,
          "firstInteractionAt",
        ],
      },
      lastMessageAt,
    })
  })

  test("updateTracking merges only populated referral keys", async () => {
    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      data: {
        referral: {
          adTitle: null,
          ctwaClid: "clid-1",
          raw: {},
          sourceUrl: "https://example.com/ad",
        },
      },
    })

    expect(mockDbSet).toHaveBeenCalledWith({
      referral: {
        strings: ["COALESCE(", ", '{}'::jsonb) || ", "::jsonb"],
        values: [
          "referral",
          JSON.stringify({
            ctwaClid: "clid-1",
            sourceUrl: "https://example.com/ad",
          }),
        ],
      },
    })
  })
})
