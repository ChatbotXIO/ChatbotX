import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByWorkspace: vi.fn(),
  findById: vi.fn(),
  findForUser: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  replaceIntervals: vi.fn(),
  replaceMembers: vi.fn(),
  deleteMembersForUsers: vi.fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
  dispatchAuditRecord: vi.fn(),
  tx: { tx: true },
  transactionOrder: [] as string[],
  withCache: vi.fn(
    async (_key: string, fn: () => Promise<unknown>, _opts: unknown) => fn(),
  ),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      mocks.transactionOrder.push("begin")
      const result = await fn(mocks.tx)
      mocks.transactionOrder.push("commit")
      return result
    },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  workingHoursRepository: {
    listByWorkspace: mocks.listByWorkspace,
    findById: mocks.findById,
    findForUser: mocks.findForUser,
    create: mocks.create,
    rename: mocks.rename,
    delete: mocks.remove,
    replaceIntervals: mocks.replaceIntervals,
    replaceMembers: mocks.replaceMembers,
    deleteMembersForUsers: mocks.deleteMembersForUsers,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

const { workingHoursService } = await import("../src/working-hours/service")

const WS = "ws-1"
const WH = "wh-1"
const row = {
  id: WH,
  workspaceId: WS,
  name: "Office",
  intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
  members: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue(row)
  mocks.create.mockResolvedValue({ id: WH, name: "Office" })
  mocks.replaceIntervals.mockResolvedValue(true)
  mocks.replaceMembers.mockResolvedValue({ status: "ok" })
  mocks.transactionOrder.length = 0
  mocks.invalidateCacheByTags.mockImplementation(() => {
    mocks.transactionOrder.push("invalidate")
    return Promise.resolve()
  })
  mocks.remove.mockResolvedValue(true)
  // The repository is the authority on membership: it reports non-members.
  mocks.replaceMembers.mockImplementation(
    async (props: { userIds: string[] }) =>
      props.userIds.includes("stranger")
        ? { status: "invalidUsers", userIds: ["stranger"] }
        : { status: "ok" },
  )
})

describe("workingHoursService reads", () => {
  test("listByWorkspace is cached under the workspace tag", async () => {
    mocks.listByWorkspace.mockResolvedValue([row])
    await workingHoursService.listByWorkspace({ workspaceId: WS })
    const [key, , opts] = mocks.withCache.mock.calls[0]
    expect(key).toBe("working-hours:ws-1:list")
    expect(opts).toEqual({ ttl: 3600, tags: ["working-hours:ws-1"] })
  })

  test("every entry under the shared tag uses the same ttl", async () => {
    mocks.listByWorkspace.mockResolvedValue([row])
    mocks.findForUser.mockResolvedValue(row)
    await workingHoursService.listByWorkspace({ workspaceId: WS })
    await workingHoursService.findForAgent({ workspaceId: WS, userId: "u1" })
    const ttls = mocks.withCache.mock.calls.map(
      ([, , opts]) => (opts as { ttl?: number }).ttl,
    )
    expect(ttls).toHaveLength(2)
    expect(new Set(ttls).size).toBe(1)
    expect(ttls[0]).toBeDefined()
  })

  test("findForAgent returns a projection, cached per pair with a 1h ttl", async () => {
    mocks.findForUser.mockResolvedValue({ ...row, extra: "x" })
    const result = await workingHoursService.findForAgent({
      workspaceId: WS,
      userId: "u1",
    })
    expect(result).toEqual({
      workingHoursId: WH,
      intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
    })
    const [key, , opts] = mocks.withCache.mock.calls[0]
    expect(key).toBe("working-hours:ws-1:agent:u1")
    expect(opts).toEqual({ ttl: 3600, tags: ["working-hours:ws-1"] })
  })

  test("findForAgent returns null (wrapped so the miss is cacheable)", async () => {
    mocks.findForUser.mockResolvedValue(undefined)
    await expect(
      workingHoursService.findForAgent({ workspaceId: WS, userId: "u1" }),
    ).resolves.toBeNull()
  })

  test("findByIdOrFail is uncached and 404s", async () => {
    mocks.findById.mockResolvedValue(undefined)
    await expect(
      workingHoursService.findByIdOrFail({
        workspaceId: WS,
        workingHoursId: WH,
      }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
    expect(mocks.withCache).not.toHaveBeenCalled()
  })
})

describe("workingHoursService writes", () => {
  test("create rejects overlapping intervals with a 422 validation error", async () => {
    await expect(
      workingHoursService.create({
        workspaceId: WS,
        data: {
          name: "x",
          intervals: [
            { weekday: 1, startMinute: 0, endMinute: 600 },
            { weekday: 1, startMinute: 500, endMinute: 700 },
          ],
        },
      }),
    ).rejects.toMatchObject({
      httpStatusCode: 422,
      code: "validation",
      field: "intervals",
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("create rejects non-member userIds with 422 and writes nothing", async () => {
    await expect(
      workingHoursService.create({
        workspaceId: WS,
        data: { name: "x", userIds: ["u1", "stranger"] },
      }),
    ).rejects.toMatchObject({ httpStatusCode: 422, field: "userIds" })
    // The throw happens inside the transaction, so nothing commits.
    expect(mocks.transactionOrder).toEqual(["begin"])
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("create writes intervals and members, invalidates the tag, audits", async () => {
    await workingHoursService.create({
      workspaceId: WS,
      data: {
        name: "Office",
        intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
        userIds: ["u1", "u1"],
      },
    })
    expect(mocks.replaceIntervals).toHaveBeenCalledTimes(1)
    expect(mocks.replaceMembers).toHaveBeenCalledWith(
      { workspaceId: WS, workingHoursId: WH, userIds: ["u1"] },
      mocks.tx,
    )
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "working-hours:ws-1",
    ])
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create" }),
    )
  })

  test("create runs every write on one transaction and invalidates after commit", async () => {
    await workingHoursService.create({
      workspaceId: WS,
      data: {
        name: "Office",
        intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
        userIds: ["u1"],
      },
    })
    expect(mocks.create).toHaveBeenCalledWith(
      { workspaceId: WS, name: "Office" },
      mocks.tx,
    )
    expect(mocks.replaceIntervals).toHaveBeenCalledWith(
      expect.objectContaining({ workingHoursId: WH }),
      mocks.tx,
    )
    expect(mocks.replaceMembers).toHaveBeenCalledWith(
      expect.objectContaining({ workingHoursId: WH }),
      mocks.tx,
    )
    expect(mocks.transactionOrder).toEqual(["begin", "commit", "invalidate"])
  })

  test("create maps a repository invalid-users outcome to 422 and does not invalidate or audit", async () => {
    mocks.replaceMembers.mockResolvedValue({
      status: "invalidUsers",
      userIds: ["u1"],
    })
    await expect(
      workingHoursService.create({
        workspaceId: WS,
        data: { name: "Office", userIds: ["u1"] },
      }),
    ).rejects.toMatchObject({ httpStatusCode: 422, field: "userIds" })
    expect(mocks.transactionOrder).toEqual(["begin"])
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("update rename and intervals share one transaction; a failed write does not invalidate", async () => {
    await workingHoursService.update({
      workspaceId: WS,
      workingHoursId: WH,
      data: {
        name: "Renamed",
        intervals: [{ weekday: 2, startMinute: 60, endMinute: 120 }],
      },
    })
    expect(mocks.rename).toHaveBeenCalledWith(
      { workspaceId: WS, id: WH, name: "Renamed" },
      mocks.tx,
    )
    expect(mocks.transactionOrder).toEqual(["begin", "commit", "invalidate"])

    mocks.transactionOrder.length = 0
    mocks.rename.mockRejectedValueOnce(new Error("boom"))
    await expect(
      workingHoursService.update({
        workspaceId: WS,
        workingHoursId: WH,
        data: { name: "Again" },
      }),
    ).rejects.toThrow("boom")
    expect(mocks.transactionOrder).toEqual(["begin"])
  })

  test("update replaces intervals (parent lock lives in the repository) and renames", async () => {
    await workingHoursService.update({
      workspaceId: WS,
      workingHoursId: WH,
      data: {
        name: "Renamed",
        intervals: [{ weekday: 2, startMinute: 60, endMinute: 120 }],
      },
    })
    expect(mocks.replaceIntervals).toHaveBeenCalledWith(
      {
        workspaceId: WS,
        workingHoursId: WH,
        intervals: [{ weekday: 2, startMinute: 60, endMinute: 120 }],
      },
      mocks.tx,
    )
    expect(mocks.rename).toHaveBeenCalledWith(
      { workspaceId: WS, id: WH, name: "Renamed" },
      mocks.tx,
    )
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "working-hours:ws-1",
    ])
  })

  test("update 404s for a foreign schedule", async () => {
    mocks.findById.mockResolvedValue(undefined)
    await expect(
      workingHoursService.update({
        workspaceId: WS,
        workingHoursId: "other",
        data: { name: "x" },
      }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
    expect(mocks.rename).not.toHaveBeenCalled()
  })

  test("delete removes, invalidates and audits", async () => {
    await workingHoursService.delete({ workspaceId: WS, workingHoursId: WH })
    expect(mocks.remove).toHaveBeenCalledWith({ workspaceId: WS, id: WH })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "working-hours:ws-1",
    ])
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "delete" }),
    )
  })

  test("replaceMembers moves users via the repository upsert inside one transaction", async () => {
    await workingHoursService.replaceMembers({
      workspaceId: WS,
      workingHoursId: WH,
      userIds: ["u1", "u2"],
    })
    expect(mocks.replaceMembers).toHaveBeenCalledWith(
      { workspaceId: WS, workingHoursId: WH, userIds: ["u1", "u2"] },
      mocks.tx,
    )
    expect(mocks.transactionOrder).toEqual(["begin", "commit", "invalidate"])
    await expect(
      workingHoursService.replaceMembers({
        workspaceId: WS,
        workingHoursId: WH,
        userIds: ["stranger"],
      }),
    ).rejects.toMatchObject({ httpStatusCode: 422, field: "userIds" })
  })

  test("a rejected replaceMembers aborts the transaction, so the parent bump rolls back, and does not invalidate or audit", async () => {
    mocks.transactionOrder.length = 0
    mocks.dispatchAuditRecord.mockClear()
    await expect(
      workingHoursService.replaceMembers({
        workspaceId: WS,
        workingHoursId: WH,
        userIds: ["stranger"],
      }),
    ).rejects.toMatchObject({ httpStatusCode: 422 })
    // "commit" is never recorded: the throw propagates out of the transaction.
    expect(mocks.transactionOrder).toEqual(["begin"])
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("replaceMembers 404s when the schedule is not in the workspace", async () => {
    mocks.replaceMembers.mockResolvedValue({ status: "notFound" })
    await expect(
      workingHoursService.replaceMembers({
        workspaceId: WS,
        workingHoursId: "other",
        userIds: ["u1"],
      }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })
})

describe("workingHoursService.removeMembersForUsers", () => {
  test("delegates to the repository on the caller's client without invalidating", async () => {
    await workingHoursService.removeMembersForUsers({
      workspaceId: WS,
      userIds: ["u1"],
      tx: mocks.tx as never,
    })
    expect(mocks.deleteMembersForUsers).toHaveBeenCalledWith(
      { workspaceId: WS, userIds: ["u1"] },
      mocks.tx,
    )
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
