import { beforeEach, describe, expect, test, vi } from "vitest"
import { ChatbotXException } from "../../errors"

const mocks = vi.hoisted(() => ({
  inboxFindMany: vi.fn(),
  inboxFindFirst: vi.fn(),
  inboxUpdate: vi.fn(),
  inboxUpdateSet: vi.fn(),
  inboxUpdateWhere: vi.fn(),
  inboxInsert: vi.fn(),
  inboxInsertValues: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      inboxModel: {
        findMany: mocks.inboxFindMany,
        findFirst: mocks.inboxFindFirst,
      },
    },
    $count: mocks.count,
    update: mocks.inboxUpdate,
    insert: mocks.inboxInsert,
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
  quotaEnforcementService: {
    tryConsume: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }
}
const { workspaceUsageService } = (await import(
  "../../workspace-usage/service"
)) as unknown as {
  workspaceUsageService: {
    increment: ReturnType<typeof vi.fn>
    decrement: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  mocks.inboxFindMany.mockReset()
  mocks.inboxFindFirst.mockReset()
  mocks.inboxUpdate.mockReset()
  mocks.inboxUpdateSet.mockReset()
  mocks.inboxUpdateWhere.mockReset()
  mocks.inboxInsert.mockReset()
  mocks.inboxInsertValues.mockReset()
  mocks.count.mockReset()
  quotaEnforcementService.tryConsume.mockReset()
  quotaEnforcementService.release.mockReset()
  quotaEnforcementService.release.mockResolvedValue(undefined)
  workspaceUsageService.increment.mockReset()
  workspaceUsageService.increment.mockResolvedValue(undefined)
  workspaceUsageService.decrement.mockReset()
  workspaceUsageService.decrement.mockResolvedValue(undefined)

  mocks.inboxInsert.mockReturnValue({
    values: mocks.inboxInsertValues.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "new-inbox" }]),
    }),
  })

  mocks.inboxUpdateWhere.mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "reconnected-inbox" }]),
  })

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

describe("InboxService.create", () => {
  test("throws a typed channelLimitReached exception when the owner's quota is exhausted", async () => {
    mocks.inboxFindFirst.mockResolvedValue(undefined)
    quotaEnforcementService.tryConsume.mockResolvedValue({ ok: false })

    const createInbox = inboxService.create({
      data: {
        workspaceId: "workspace-1",
        channel: "whatsapp",
        name: "WhatsApp",
      } as never,
      ownerId: "owner-1",
    })

    await expect(createInbox).rejects.toMatchObject({
      code: "channelLimitReached",
      message: "Channel limit reached for this plan",
    })
    await expect(createInbox.catch((err) => err)).resolves.toBeInstanceOf(
      ChatbotXException,
    )
    expect(mocks.inboxInsert).not.toHaveBeenCalled()
  })

  test("creates the inbox and increments usage when the quota allows it", async () => {
    mocks.inboxFindFirst.mockResolvedValue(undefined)
    quotaEnforcementService.tryConsume.mockResolvedValue({ ok: true })

    const result = await inboxService.create({
      data: {
        workspaceId: "workspace-1",
        channel: "whatsapp",
        name: "WhatsApp",
      } as never,
      ownerId: "owner-1",
    })

    expect(result).toEqual({ inbox: { id: "new-inbox" }, wasCreated: true })
    expect(mocks.inboxInsert).toHaveBeenCalledTimes(1)
    expect(workspaceUsageService.increment).toHaveBeenCalledWith(
      "workspace-1",
      "channels",
    )
  })

  test("reconnects an existing disconnected inbox without consuming quota", async () => {
    mocks.inboxFindFirst.mockResolvedValue({
      id: "existing-inbox",
      status: "disconnected",
    })

    await inboxService.create({
      data: {
        workspaceId: "workspace-1",
        channel: "whatsapp",
        name: "WhatsApp",
      } as never,
      ownerId: "owner-1",
    })

    expect(quotaEnforcementService.tryConsume).not.toHaveBeenCalled()
    expect(mocks.inboxUpdate).toHaveBeenCalledTimes(1)
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
