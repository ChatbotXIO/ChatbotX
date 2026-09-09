import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindByIdOrName, mockListAudience, mockCountAudience } = vi.hoisted(
  () => ({
    mockFindByIdOrName: vi.fn(),
    mockListAudience: vi.fn().mockResolvedValue([]),
    mockCountAudience: vi.fn().mockResolvedValue(0),
  }),
)

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: {
    findByIdOrName: mockFindByIdOrName,
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
}))

const { broadcastService } = await import("../src/broadcast/service")

describe("broadcastService.listAudience deletedAt gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListAudience.mockResolvedValue([])
    mockCountAudience.mockResolvedValue(0)
  })

  test("looks up the broadcast scoped to workspaceId + idOrName + deletedAt IS NULL before listing recipients", async () => {
    mockFindByIdOrName.mockResolvedValue({ id: "b-1" })

    await broadcastService.listAudience({
      idOrName: "b-1",
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    expect(mockFindByIdOrName).toHaveBeenCalledWith({
      idOrName: "b-1",
      workspaceId: "ws-1",
    })
    expect(mockListAudience).toHaveBeenCalled()
  })

  test("throws not-found for a soft-deleted broadcast and never queries recipients", async () => {
    mockFindByIdOrName.mockResolvedValue(undefined)

    await expect(
      broadcastService.listAudience({
        idOrName: "b-deleted",
        workspaceId: "ws-1",
        page: 1,
        perPage: 10,
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(mockListAudience).not.toHaveBeenCalled()
    expect(mockCountAudience).not.toHaveBeenCalled()
  })

  test("throws not-found when the broadcast exists but belongs to a different workspace", async () => {
    mockFindByIdOrName.mockResolvedValue(undefined)

    await expect(
      broadcastService.listAudience({
        idOrName: "b-1",
        workspaceId: "ws-foreign",
        page: 1,
        perPage: 10,
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(mockFindByIdOrName).toHaveBeenCalledWith({
      idOrName: "b-1",
      workspaceId: "ws-foreign",
    })
  })
})
