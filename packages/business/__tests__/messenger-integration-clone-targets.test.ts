import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByUserId: vi.fn(),
  listByUserIdUncached: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { integrationMessengerModel: { findMany: mocks.findMany } } },
  and: vi.fn(),
  eq: vi.fn(),
  findOrFail: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMessengerModel: {},
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {
    listByUserId: mocks.listByUserId,
    listByUserIdUncached: mocks.listByUserIdUncached,
  },
}))

const { messengerIntegrationService } = await import(
  "../src/integration-messenger/service"
)

const member = (
  workspaceId: string,
  role: "owner" | "agent",
  superAdmin = false,
) => ({ workspaceId, role, permissions: { superAdmin } })

beforeEach(() => {
  mocks.listByUserId.mockReset()
  mocks.listByUserIdUncached.mockReset()
  mocks.findMany.mockReset().mockResolvedValue([])
})

describe("messengerIntegrationService.listCloneTargetsForUser", () => {
  test("lists pages of every workspace where the user is owner or superAdmin, excluding the source page", async () => {
    mocks.listByUserId.mockResolvedValue([
      member("ws-owner", "owner"),
      member("ws-admin", "agent", true),
      member("ws-agent", "agent"),
      member("ws-owner", "owner"),
    ])
    mocks.findMany.mockResolvedValue([{ id: "im-1", name: "Page 1" }])

    const targets = await messengerIntegrationService.listCloneTargetsForUser({
      userId: "user-1",
      excludePageId: "page-source",
    })

    expect(targets).toEqual([{ id: "im-1", name: "Page 1" }])
    expect(mocks.listByUserId).toHaveBeenCalledWith({ userId: "user-1" })
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: { in: ["ws-owner", "ws-admin"] },
        pageId: { ne: "page-source" },
      },
      orderBy: { name: "asc" },
    })
  })

  test("does not narrow by page when there is no source page", async () => {
    mocks.listByUserId.mockResolvedValue([member("ws-owner", "owner")])

    await messengerIntegrationService.listCloneTargetsForUser({
      userId: "user-1",
    })

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { workspaceId: { in: ["ws-owner"] }, pageId: undefined },
      orderBy: { name: "asc" },
    })
  })

  test("reads memberships uncached when authorizing a write, so a revoked admin cannot clone", async () => {
    // The cached list still says admin; the database no longer does.
    mocks.listByUserId.mockResolvedValue([member("ws-admin", "agent", true)])
    mocks.listByUserIdUncached.mockResolvedValue([member("ws-admin", "agent")])

    const targets = await messengerIntegrationService.listCloneTargetsForUser({
      userId: "user-1",
      excludePageId: "page-source",
      authoritative: true,
    })

    expect(targets).toEqual([])
    expect(mocks.listByUserIdUncached).toHaveBeenCalledWith({
      userId: "user-1",
    })
    expect(mocks.listByUserId).not.toHaveBeenCalled()
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  test("returns nothing without querying when the user is an agent everywhere", async () => {
    mocks.listByUserId.mockResolvedValue([member("ws-agent", "agent")])

    const targets = await messengerIntegrationService.listCloneTargetsForUser({
      userId: "user-1",
      excludePageId: "page-source",
    })

    expect(targets).toEqual([])
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})
