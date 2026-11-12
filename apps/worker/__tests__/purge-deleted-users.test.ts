import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  listDueDeletedUserIds: vi.fn(),
  purgeDeletedUser: vi.fn(),
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<void> }) => await fn(),
  ),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  userService: {
    listDueDeletedUserIds: mocks.listDueDeletedUserIds,
    purgeDeletedUser: mocks.purgeDeletedUser,
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: mocks.error,
    info: mocks.info,
    warn: mocks.warn,
  }),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: { exists: vi.fn() },
  isLockAcquisitionError: () => false,
}))

const { purgeDeletedUsers } = await import(
  "../src/schedule/handlers/purge-deleted-users"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listDueDeletedUserIds.mockResolvedValue([])
})

describe("purgeDeletedUsers", () => {
  test("purges a bounded batch and records completed work", async () => {
    mocks.listDueDeletedUserIds.mockResolvedValue(["user-1", "user-2"])
    mocks.purgeDeletedUser
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await purgeDeletedUsers()

    expect(mocks.listDueDeletedUserIds).toHaveBeenCalledWith({ limit: 100 })
    expect(mocks.purgeDeletedUser).toHaveBeenNthCalledWith(1, "user-1")
    expect(mocks.purgeDeletedUser).toHaveBeenNthCalledWith(2, "user-2")
    expect(mocks.info).toHaveBeenCalledWith(
      { attempted: 2, deleted: 1, failed: 0 },
      "purgeDeletedUsers: sweep completed",
    )
  })

  test("continues after one user fails so later due users are not stranded", async () => {
    const failure = new Error("database timeout")
    mocks.listDueDeletedUserIds.mockResolvedValue(["user-1", "user-2"])
    mocks.purgeDeletedUser
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(true)

    await purgeDeletedUsers()

    expect(mocks.purgeDeletedUser).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledWith(
      { err: failure, userId: "user-1" },
      "purgeDeletedUsers: user failed",
    )
    expect(mocks.info).toHaveBeenCalledWith(
      { attempted: 2, deleted: 1, failed: 1 },
      "purgeDeletedUsers: sweep completed",
    )
  })

  test("allows an idempotent rerun after a user was already deleted", async () => {
    mocks.listDueDeletedUserIds.mockResolvedValue(["user-1"])
    mocks.purgeDeletedUser
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await purgeDeletedUsers()
    await purgeDeletedUsers()

    expect(mocks.purgeDeletedUser).toHaveBeenCalledTimes(2)
    expect(mocks.info).toHaveBeenCalledTimes(1)
  })
})
