import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countByWorkspace: vi.fn(),
  delete: vi.fn(),
  findById: vi.fn(),
  findDestinations: vi.fn(),
  insert: vi.fn(),
  isUniqueViolationError: vi.fn(() => false),
  list: vi.fn(),
  listDestinations: vi.fn(),
  lockWorkspaceSets: vi.fn(),
  rename: vi.fn(),
  replaceDestinations: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostRepository: { findDestinations: mocks.findDestinations },
  socialPostTargetSetRepository: {
    countByWorkspace: mocks.countByWorkspace,
    delete: mocks.delete,
    findById: mocks.findById,
    insert: mocks.insert,
    list: mocks.list,
    listDestinations: mocks.listDestinations,
    lockWorkspaceSets: mocks.lockWorkspaceSets,
    rename: mocks.rename,
    replaceDestinations: mocks.replaceDestinations,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

const {
  MAX_DESTINATIONS_PER_TARGET_SET,
  MAX_POST_TARGET_SETS_PER_WORKSPACE,
  socialPostTargetSetService,
} = await import("../src/social-post-target-set/service")

const ready = {
  id: "10",
  provider: "facebook",
  state: "ready",
}

describe("socialPostTargetSetService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.countByWorkspace.mockResolvedValue(0)
    mocks.findDestinations.mockResolvedValue([ready])
    mocks.insert.mockResolvedValue({ id: "5", name: "Weekend" })
    mocks.findById.mockResolvedValue({ id: "5", name: "Weekend" })
    mocks.listDestinations.mockResolvedValue([
      { destinationId: "10", targetSetId: "5" },
    ])
  })

  test("creates a set and its destinations in one transaction", async () => {
    const created = await socialPostTargetSetService.create({
      destinationIds: ["10"],
      name: "Weekend",
      workspaceId: "ws-1",
    })

    expect(mocks.lockWorkspaceSets).toHaveBeenCalledWith("ws-1", tx)
    expect(mocks.replaceDestinations).toHaveBeenCalledWith(
      { destinationIds: ["10"], targetSetId: "5", workspaceId: "ws-1" },
      tx,
    )
    expect(created).toEqual({
      destinations: [{ id: "10", state: "ready" }],
      id: "5",
      name: "Weekend",
    })
  })

  test("refuses a destination of another workspace", async () => {
    mocks.findDestinations.mockResolvedValue([])

    await expect(
      socialPostTargetSetService.create({
        destinationIds: ["99"],
        name: "Foreign",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "destinationIds" })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("refuses duplicates and more destinations than the cap", async () => {
    await expect(
      socialPostTargetSetService.create({
        destinationIds: ["10", "10"],
        name: "Twice",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "destinationIds" })

    const many = Array.from(
      { length: MAX_DESTINATIONS_PER_TARGET_SET + 1 },
      (_, index) => String(index + 1),
    )
    await expect(
      socialPostTargetSetService.create({
        destinationIds: many,
        name: "Many",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "destinationIds" })
  })

  test("refuses past the set cap and a taken name", async () => {
    mocks.countByWorkspace.mockResolvedValue(MAX_POST_TARGET_SETS_PER_WORKSPACE)
    await expect(
      socialPostTargetSetService.create({
        destinationIds: ["10"],
        name: "Late",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("at most")

    mocks.countByWorkspace.mockResolvedValue(0)
    mocks.insert.mockResolvedValue(null)
    await expect(
      socialPostTargetSetService.create({
        destinationIds: ["10"],
        name: "Dup",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "targetSetNameTaken" })
  })

  test("reports a destination that needs attention instead of hiding or using it", async () => {
    mocks.listDestinations.mockResolvedValue([
      { destinationId: "10", targetSetId: "5" },
      { destinationId: "11", targetSetId: "5" },
      { destinationId: "12", targetSetId: "5" },
      { destinationId: "13", targetSetId: "5" },
    ])
    mocks.findDestinations.mockResolvedValue([
      ready,
      { ...ready, id: "11", state: "needsReconnect" },
      { ...ready, id: "12", state: "inboxDisconnected" },
    ])

    const set = await socialPostTargetSetService.get({
      id: "5",
      workspaceId: "ws-1",
    })

    // 13 is gone (not found in the workspace): it drops out of the set.
    expect(set.destinations).toEqual([
      { id: "10", state: "ready" },
      { id: "11", state: "needsReconnect" },
      { id: "12", state: "inboxDisconnected" },
    ])
  })

  test("a write that reaches a foreign destination is a not-found, never a 500", async () => {
    const foreign = new Error("not yours")
    foreign.name = "PublishDestinationWorkspaceError"
    mocks.replaceDestinations.mockRejectedValueOnce(foreign)

    await expect(
      socialPostTargetSetService.create({
        destinationIds: ["10"],
        name: "Race",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("update renames and replaces under one transaction; unknown ids are not found", async () => {
    await socialPostTargetSetService.update({
      destinationIds: ["10"],
      id: "5",
      name: "New",
      workspaceId: "ws-1",
    })
    expect(mocks.rename).toHaveBeenCalledWith(
      { id: "5", name: "New", workspaceId: "ws-1" },
      tx,
    )

    mocks.findById.mockResolvedValue(null)
    await expect(
      socialPostTargetSetService.update({
        id: "9",
        name: "x",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    mocks.delete.mockResolvedValue(false)
    await expect(
      socialPostTargetSetService.delete({ id: "9", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
