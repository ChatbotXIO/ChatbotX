import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  lockFirstWorkspace: vi.fn(async () => undefined),
  findActiveByOwner: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
  },
}))
vi.mock("@chatbotx.io/database/repositories/workspace", () => ({
  workspaceRepository: {
    lockFirstWorkspace: mocks.lockFirstWorkspace,
    findActiveByOwner: mocks.findActiveByOwner,
  },
}))

const { workspaceService } = await import("../src/workspace/service")

const OWNER_ID = "owner-1"
const existingWorkspace = { id: "ws-existing" }
const createdWorkspace = { id: "ws-created" }

const callerTx = {}

describe("workspaceService.ensureFirstForOwner", () => {
  let create: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    create = vi.spyOn(workspaceService, "create")
    create.mockResolvedValue(createdWorkspace as never)
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn(callerTx),
    )
  })

  test("returns the existing workspace without creating one", async () => {
    mocks.findActiveByOwner.mockResolvedValue(existingWorkspace)

    const result = await workspaceService.ensureFirstForOwner({
      ownerId: OWNER_ID,
      name: "Home",
    })

    expect(result).toBe(existingWorkspace)
    expect(create).not.toHaveBeenCalled()
  })

  test("creates a workspace when the owner has none", async () => {
    mocks.findActiveByOwner.mockResolvedValue(undefined)

    const result = await workspaceService.ensureFirstForOwner({
      ownerId: OWNER_ID,
      name: "Home",
    })

    expect(result).toBe(createdWorkspace)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Home", ownerId: OWNER_ID },
        createdBy: OWNER_ID,
      }),
    )
  })

  test("takes the lock on the caller's transaction and passes it to create", async () => {
    mocks.findActiveByOwner.mockResolvedValue(undefined)

    await workspaceService.ensureFirstForOwner({
      ownerId: OWNER_ID,
      name: "Home",
      tx: callerTx as never,
    })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.lockFirstWorkspace).toHaveBeenCalledWith(
      { ownerId: OWNER_ID },
      callerTx,
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tx: callerTx }),
    )
  })

  test("opens its own transaction and lets create own its tx when none is given", async () => {
    mocks.findActiveByOwner.mockResolvedValue(undefined)

    await workspaceService.ensureFirstForOwner({
      ownerId: OWNER_ID,
      name: "Home",
    })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.lockFirstWorkspace).toHaveBeenCalledWith(
      { ownerId: OWNER_ID },
      callerTx,
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tx: undefined }),
    )
  })
})
