// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindIdIfActive,
  mockListAudience,
  mockCountAudience,
  mockNotFoundException,
} = vi.hoisted(() => ({
  mockFindIdIfActive: vi.fn(),
  mockListAudience: vi.fn().mockResolvedValue([]),
  mockCountAudience: vi.fn().mockResolvedValue(0),
  mockNotFoundException: vi.fn((message: string) => new Error(message)),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: {
    findIdIfActive: mockFindIdIfActive,
    listAudience: mockListAudience,
    countAudience: mockCountAudience,
  },
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
    mockListAudience.mockResolvedValue([])
    mockCountAudience.mockResolvedValue(0)
  })

  test("looks up the broadcast scoped to workspaceId + id + deletedAt IS NULL before listing recipients", async () => {
    mockFindIdIfActive.mockResolvedValue({ id: "b-1" })

    await listBroadcastAudience({
      broadcastId: "b-1",
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    expect(mockFindIdIfActive).toHaveBeenCalledWith({
      id: "b-1",
      workspaceId: "ws-1",
    })
    expect(mockListAudience).toHaveBeenCalled()
  })

  test("throws not-found for a soft-deleted broadcast and never queries recipients", async () => {
    mockFindIdIfActive.mockResolvedValue(undefined)

    await expect(
      listBroadcastAudience({
        broadcastId: "b-deleted",
        workspaceId: "ws-1",
        page: 1,
        perPage: 10,
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(mockNotFoundException).toHaveBeenCalledWith("Broadcast not found")
    expect(mockListAudience).not.toHaveBeenCalled()
    expect(mockCountAudience).not.toHaveBeenCalled()
  })

  test("throws not-found when the broadcast exists but belongs to a different workspace", async () => {
    mockFindIdIfActive.mockResolvedValue(undefined)

    await expect(
      listBroadcastAudience({
        broadcastId: "b-1",
        workspaceId: "ws-foreign",
        page: 1,
        perPage: 10,
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(mockFindIdIfActive).toHaveBeenCalledWith({
      id: "b-1",
      workspaceId: "ws-foreign",
    })
  })
})
