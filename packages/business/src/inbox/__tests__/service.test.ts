import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  inboxFindMany: vi.fn(),
  inboxUpdate: vi.fn(),
  inboxUpdateSet: vi.fn(),
  inboxUpdateWhere: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      inboxModel: {
        findMany: mocks.inboxFindMany,
      },
    },
    $count: mocks.count,
    update: mocks.inboxUpdate,
  },
  eq: vi.fn((column, value) => ({ column, value })),
  relationsFilterToSQL: vi.fn((_, where) => where),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: { id: "id" },
  workspaceUsageModel: { workspaceId: "workspaceId-column" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("../../quota-enforcement/service", () => ({
  quotaEnforcementService: {
    tryConsume: vi.fn(),
    release: vi.fn(async () => undefined),
  },
}))

vi.mock("../../workspace-usage/service", () => ({
  workspaceUsageService: {
    increment: vi.fn(async () => undefined),
    decrement: vi.fn(async () => undefined),
  },
}))

const { inboxService } = await import("../service")
const { quotaEnforcementService } = (await import(
  "../../quota-enforcement/service"
)) as unknown as {
  quotaEnforcementService: { release: ReturnType<typeof vi.fn> }
}
const { workspaceUsageService } = (await import(
  "../../workspace-usage/service"
)) as unknown as {
  workspaceUsageService: { decrement: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  mocks.inboxFindMany.mockReset()
  mocks.inboxUpdate.mockReset()
  mocks.inboxUpdateSet.mockReset()
  mocks.inboxUpdateWhere.mockReset()
  mocks.count.mockReset()
  quotaEnforcementService.release.mockReset()
  quotaEnforcementService.release.mockResolvedValue(undefined)
  workspaceUsageService.decrement.mockReset()
  workspaceUsageService.decrement.mockResolvedValue(undefined)

  mocks.inboxUpdate.mockReturnValue({
    set: mocks.inboxUpdateSet.mockReturnValue({
      where: mocks.inboxUpdateWhere,
    }),
  })
})

describe("InboxService.disconnect", () => {
  test("disconnects only the requested inbox", async () => {
    await inboxService.disconnect({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
    })

    expect(mocks.inboxUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.inboxUpdateSet).toHaveBeenCalledWith({
      status: "disconnected",
    })
    expect(mocks.inboxUpdateWhere).toHaveBeenCalledWith({
      column: "id",
      value: "inbox-1",
    })
  })

  test("uses an explicit transaction client when provided", async () => {
    const tx = {
      update: mocks.inboxUpdate,
    }

    await inboxService.disconnect({
      inboxId: "inbox-2",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      tx: tx as never,
    })

    expect(mocks.inboxUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.inboxUpdateWhere).toHaveBeenCalledWith({
      column: "id",
      value: "inbox-2",
    })
  })

  test("releases the channels quota for the owner", async () => {
    await inboxService.disconnect({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
    })

    expect(quotaEnforcementService.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
  })

  test("does not throw when the quota release fails", async () => {
    quotaEnforcementService.release.mockRejectedValueOnce(
      new Error("redis down"),
    )

    await expect(
      inboxService.disconnect({
        inboxId: "inbox-1",
        ownerId: "owner-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()
  })

  test("decrements the workspace usage channels count", async () => {
    await inboxService.disconnect({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
    })

    expect(workspaceUsageService.decrement).toHaveBeenCalledWith(
      "workspace-1",
      "channels",
    )
  })

  test("does not throw when the workspace usage decrement fails", async () => {
    workspaceUsageService.decrement.mockRejectedValueOnce(
      new Error("redis down"),
    )

    await expect(
      inboxService.disconnect({
        inboxId: "inbox-1",
        ownerId: "owner-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()
  })
})

describe("InboxService.list", () => {
  test("includes connected inboxes and excludes disconnected inboxes", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "connected-inbox" }])
    mocks.count.mockResolvedValue(1)

    const result = await inboxService.list({ workspaceId: "workspace-1" })

    expect(result).toEqual({
      data: [{ id: "connected-inbox" }],
      pageCount: 1,
    })
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      where: {
        workspaceId: "workspace-1",
        status: "connected",
      },
      with: undefined,
    })
    expect(mocks.count).toHaveBeenCalledTimes(1)
  })
})
