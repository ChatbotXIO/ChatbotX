import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  purgeExpired: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactExportService: { purgeExpired: mocks.purgeExpired },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: mocks.info, warn: mocks.warn }),
}))

const { purgeExpiredContactExports } = await import(
  "../src/schedule/handlers/purge-expired-contact-exports"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("purgeExpiredContactExports", () => {
  const cursor = (id: string) => ({
    createdAt: "2026-10-01T00:00:00.000000Z",
    id,
  })

  test("walks full batches, each one starting past the last, until one comes back short", async () => {
    mocks.purgeExpired
      .mockResolvedValueOnce({
        deleted: 500,
        failed: 0,
        nextCursor: cursor("a"),
      })
      .mockResolvedValueOnce({ deleted: 120, failed: 0, nextCursor: null })

    await purgeExpiredContactExports()

    expect(mocks.purgeExpired).toHaveBeenCalledTimes(2)
    expect(mocks.purgeExpired).toHaveBeenNthCalledWith(1, {
      batchSize: 500,
      now: expect.any(Date),
      after: undefined,
    })
    expect(mocks.purgeExpired).toHaveBeenNthCalledWith(2, {
      batchSize: 500,
      now: mocks.purgeExpired.mock.calls[0]?.[0].now,
      after: cursor("a"),
    })
    expect(mocks.info).toHaveBeenCalledWith(
      { totalDeleted: 620 },
      expect.any(String),
    )
  })

  test("a full batch of failing files does not stop the newer expired ones behind it", async () => {
    mocks.purgeExpired
      .mockResolvedValueOnce({
        deleted: 0,
        failed: 500,
        nextCursor: cursor("a"),
      })
      .mockResolvedValueOnce({ deleted: 30, failed: 0, nextCursor: null })

    await purgeExpiredContactExports()

    expect(mocks.purgeExpired).toHaveBeenCalledTimes(2)
    expect(mocks.warn).toHaveBeenCalledWith(
      { totalDeleted: 30, totalFailed: 500 },
      expect.any(String),
    )
  })

  test("logs nothing when there was nothing to delete", async () => {
    mocks.purgeExpired.mockResolvedValueOnce({
      deleted: 0,
      failed: 0,
      nextCursor: null,
    })

    await purgeExpiredContactExports()

    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.warn).not.toHaveBeenCalled()
  })
})
