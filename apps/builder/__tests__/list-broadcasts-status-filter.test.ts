// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindMany, mockCount, mockRelationsFilterToSQL, mockEq } =
  vi.hoisted(() => ({
    mockFindMany: vi.fn().mockResolvedValue([]),
    mockCount: vi.fn().mockResolvedValue(0),
    mockRelationsFilterToSQL: vi.fn(),
    mockEq: vi.fn(),
  }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: mockFindMany,
      },
    },
    $count: mockCount,
  },
  eq: mockEq,
  relationsFilterToSQL: mockRelationsFilterToSQL,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: "broadcastModelId" },
  contactsOnBroadcastsModel: { id: "contactsOnBroadcastsModelId" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: { page?: number; perPage?: number }) => ({
    limit: input.perPage ?? 10,
    offset: ((input.page ?? 1) - 1) * (input.perPage ?? 10),
  }),
  likeContains: (value: string) => value,
  parseOrderByAsObject: () => undefined,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
}))

const { listBroadcasts } = await import(
  "../src/features/broadcasts/queries/index"
)

describe("listBroadcasts status filter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)
  })

  test("filters by status when provided", async () => {
    await listBroadcasts({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      name: null,
      sort: [{ id: "createdAt", desc: true }],
      status: "failed",
    })

    expect(mockFindMany.mock.calls[0]?.[0].where).toEqual({
      workspaceId: "ws-1",
      name: undefined,
      status: "failed",
    })
  })

  test("omits status from where clause when null", async () => {
    await listBroadcasts({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      name: null,
      sort: [{ id: "createdAt", desc: true }],
      status: null,
    })

    expect(mockFindMany.mock.calls[0]?.[0].where.status).toBeUndefined()
  })
})
