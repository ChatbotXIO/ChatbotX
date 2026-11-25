import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getNumber: vi.fn(),
  incrWithWindow: vi.fn(),
  runExclusive: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: {
    getNumber: mocks.getNumber,
    incrWithWindow: mocks.incrWithWindow,
  },
}))

vi.mock("../../logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { commentLikeFence } from "../comment-like-fence"

const props = { commentId: "c-1", workspaceId: "ws-1" }

describe("commentLikeFence", () => {
  beforeEach(() => {
    mocks.getNumber.mockReset()
    mocks.incrWithWindow.mockReset()
  })

  test("next increments the per-comment key", async () => {
    mocks.incrWithWindow.mockResolvedValue(3)

    await expect(commentLikeFence.next(props)).resolves.toBe(3)
    expect(mocks.incrWithWindow.mock.calls[0]?.[0]).toBe(
      "postcomment:ws-1:c-1:seq",
    )
  })

  test("an older seq is stale once a later one exists", async () => {
    mocks.getNumber.mockResolvedValue(2)

    await expect(commentLikeFence.isLatest({ ...props, seq: 1 })).resolves.toBe(
      false,
    )
  })

  test("the latest seq is applied", async () => {
    mocks.getNumber.mockResolvedValue(2)

    await expect(commentLikeFence.isLatest({ ...props, seq: 2 })).resolves.toBe(
      true,
    )
  })

  test("an unfenced job (no seq) always applies without touching Redis", async () => {
    await expect(
      commentLikeFence.isLatest({ ...props, seq: undefined }),
    ).resolves.toBe(true)
    expect(mocks.getNumber).not.toHaveBeenCalled()
  })

  test("Redis unavailable: next returns no seq and the check still applies", async () => {
    mocks.incrWithWindow.mockRejectedValue(new Error("down"))
    mocks.getNumber.mockRejectedValue(new Error("down"))

    await expect(commentLikeFence.next(props)).resolves.toBeUndefined()
    await expect(commentLikeFence.isLatest({ ...props, seq: 1 })).resolves.toBe(
      true,
    )
  })

  test("an automation like queued before a member's unlike is skipped", async () => {
    let counter = 0
    mocks.incrWithWindow.mockImplementation(() => Promise.resolve(++counter))
    mocks.getNumber.mockImplementation(() => Promise.resolve(counter))

    const automationLikeSeq = await commentLikeFence.next(props)
    const manualUnlikeSeq = await commentLikeFence.next(props)

    await expect(
      commentLikeFence.isLatest({ ...props, seq: automationLikeSeq }),
    ).resolves.toBe(false)
    await expect(
      commentLikeFence.isLatest({ ...props, seq: manualUnlikeSeq }),
    ).resolves.toBe(true)
  })

  test("serialize runs a fenced job under a per-comment lock", async () => {
    mocks.runExclusive.mockImplementation(
      ({ fn }: { fn: () => Promise<string> }) => fn(),
    )

    await expect(
      commentLikeFence.serialize({ ...props, seq: 1 }, () =>
        Promise.resolve("done"),
      ),
    ).resolves.toBe("done")
    expect(mocks.runExclusive.mock.calls[0]?.[0].key).toBe(
      "postcomment:ws-1:c-1:like-lock",
    )
  })

  test("serialize lets a lock failure reach the job so it retries", async () => {
    mocks.runExclusive.mockRejectedValue(new Error("lock busy"))

    await expect(
      commentLikeFence.serialize({ ...props, seq: 1 }, () =>
        Promise.resolve("x"),
      ),
    ).rejects.toThrow("lock busy")
  })

  test("serialize does not lock an unfenced job", async () => {
    mocks.runExclusive.mockReset()

    await expect(
      commentLikeFence.serialize({ ...props, seq: undefined }, () =>
        Promise.resolve("x"),
      ),
    ).resolves.toBe("x")
    expect(mocks.runExclusive).not.toHaveBeenCalled()
  })
})
