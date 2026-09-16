import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeOrphanedAttachments = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const lockExists = vi.fn()
const info = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  messageCleanupService: { purgeOrphanedAttachments },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
  distributedStore: { exists: lockExists },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn: vi.fn() }),
}))

const { purgeOrphanedAttachments: handlePurgeOrphanedAttachments } =
  await import("../src/schedule/handlers/purge-orphaned-attachments")

beforeEach(() => {
  purgeOrphanedAttachments.mockReset()
  purgeOrphanedAttachments.mockResolvedValue(0)
  runExclusive.mockClear()
  info.mockReset()
})

describe("purgeOrphanedAttachments", () => {
  test("deletes one bounded orphan batch under the distributed lock", async () => {
    await handlePurgeOrphanedAttachments()

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:purge-orphaned-attachments",
        timeoutInSeconds: 60 * 60,
      }),
    )
    expect(purgeOrphanedAttachments).toHaveBeenCalledWith({ limit: 1000 })
  })

  test("logs the deleted count when orphaned attachments are purged", async () => {
    purgeOrphanedAttachments.mockResolvedValue(2)

    await handlePurgeOrphanedAttachments()

    expect(info).toHaveBeenCalledWith(
      { deleted: 2 },
      "purgeOrphanedAttachments: orphaned attachments purged",
    )
  })

  test("does not log when no orphaned attachments exist", async () => {
    await handlePurgeOrphanedAttachments()

    expect(info).not.toHaveBeenCalled()
  })
})
