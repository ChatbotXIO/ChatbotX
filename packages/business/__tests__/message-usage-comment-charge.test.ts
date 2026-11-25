import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  charge: vi.fn(),
  claimQuotaMarker: vi.fn(),
  loggerError: vi.fn(),
  releaseQuotaMarker: vi.fn(),
}))

vi.mock("../src/message/service", () => ({
  messageService: {
    claimQuotaMarker: mocks.claimQuotaMarker,
    releaseQuotaMarker: mocks.releaseQuotaMarker,
  },
}))
vi.mock("../src/message-usage/service", () => ({
  messageUsageService: { charge: mocks.charge },
}))
vi.mock("../src/logger", () => ({ logger: { error: mocks.loggerError } }))

const { chargeCommentActionOnce } = await import(
  "../src/message-usage/comment-charge"
)

const createdAt = new Date("2026-11-22T10:00:00.000Z")
const input = {
  comment: { createdAt, id: "m1" },
  key: "quotaChargedHide" as const,
  workspaceId: "ws-1",
}

describe("chargeCommentActionOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claimQuotaMarker.mockResolvedValue(true)
    mocks.charge.mockResolvedValue(undefined)
    mocks.releaseQuotaMarker.mockResolvedValue(undefined)
  })

  test("claims the marker, then charges one message", async () => {
    await expect(chargeCommentActionOnce(input)).resolves.toBe(true)

    expect(mocks.claimQuotaMarker).toHaveBeenCalledWith({
      createdAt,
      id: "m1",
      key: "quotaChargedHide",
      workspaceId: "ws-1",
    })
    expect(mocks.charge).toHaveBeenCalledWith({ count: 1, workspaceId: "ws-1" })
  })

  test("a redelivery finds the marker set and charges nothing", async () => {
    mocks.claimQuotaMarker.mockResolvedValue(false)

    await expect(chargeCommentActionOnce(input)).resolves.toBe(false)

    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("a failed charge releases the marker, logs the error and rethrows", async () => {
    const err = new Error("redis down")
    mocks.charge.mockRejectedValue(err)

    await expect(chargeCommentActionOnce(input)).rejects.toThrow("redis down")

    expect(mocks.releaseQuotaMarker).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      expect.any(String),
    )
  })

  test("a storage failure on the claim propagates and charges nothing", async () => {
    mocks.claimQuotaMarker.mockRejectedValue(new Error("shard down"))

    await expect(chargeCommentActionOnce(input)).rejects.toThrow("shard down")

    expect(mocks.charge).not.toHaveBeenCalled()
  })
})
