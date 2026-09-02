// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFirstBroadcast,
  mockFindManyContacts,
  mockCount,
  mockEq,
  mockNotFoundException,
} = vi.hoisted(() => ({
  mockFindFirstBroadcast: vi.fn(),
  mockFindManyContacts: vi.fn().mockResolvedValue([]),
  mockCount: vi.fn().mockResolvedValue(0),
  mockEq: vi.fn((a: unknown, b: unknown) => ({ __eq: [a, b] })),
  mockNotFoundException: vi.fn((message: string) => new Error(message)),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findFirst: mockFindFirstBroadcast,
      },
      contactsOnBroadcastsModel: {
        findMany: mockFindManyContacts,
      },
    },
    $count: mockCount,
  },
  eq: mockEq,
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: "broadcastModelId" },
  contactsOnBroadcastsModel: { broadcastId: "contactsOnBroadcastsBroadcastId" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: { page?: number; perPage?: number }) => ({
    limit: input.perPage ?? 10,
    offset: ((input.page ?? 1) - 1) * (input.perPage ?? 10),
  }),
  likeContains: (value: string) => value,
  parseOrderByAsObject: () => undefined,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: mockNotFoundException,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
}))

const { listBroadcastAudience } = await import(
  "../src/features/broadcasts/queries/index"
)

describe("listBroadcastAudience deletedAt gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindManyContacts.mockResolvedValue([])
    mockCount.mockResolvedValue(0)
  })

  test("looks up the broadcast scoped to workspaceId + id + deletedAt IS NULL before listing recipients", async () => {
    mockFindFirstBroadcast.mockResolvedValue({ id: "b-1" })

    await listBroadcastAudience({
      broadcastId: "b-1",
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    expect(mockFindFirstBroadcast).toHaveBeenCalledWith({
      where: {
        id: "b-1",
        workspaceId: "ws-1",
        deletedAt: { isNull: true },
      },
      columns: { id: true },
    })
    expect(mockFindManyContacts).toHaveBeenCalled()
  })

  test("throws not-found for a soft-deleted broadcast and never queries recipients", async () => {
    mockFindFirstBroadcast.mockResolvedValue(undefined)

    await expect(
      listBroadcastAudience({
        broadcastId: "b-deleted",
        workspaceId: "ws-1",
        page: 1,
        perPage: 10,
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(mockNotFoundException).toHaveBeenCalledWith("Broadcast not found")
    expect(mockFindManyContacts).not.toHaveBeenCalled()
    expect(mockCount).not.toHaveBeenCalled()
  })

  test("throws not-found when the broadcast exists but belongs to a different workspace", async () => {
    mockFindFirstBroadcast.mockResolvedValue(undefined)

    await expect(
      listBroadcastAudience({
        broadcastId: "b-1",
        workspaceId: "ws-foreign",
        page: 1,
        perPage: 10,
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(mockFindFirstBroadcast).toHaveBeenCalledWith({
      where: {
        id: "b-1",
        workspaceId: "ws-foreign",
        deletedAt: { isNull: true },
      },
      columns: { id: true },
    })
  })
})
