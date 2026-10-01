import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockPut, mockGet, mockWarn } = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockGet: vi.fn(),
  mockWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { put: mockPut, get: mockGet },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: mockWarn, info: vi.fn(), error: vi.fn() },
}))

import { resolveLiveComment } from "../src/integration/handlers/comment-automation/live-comment"

const BASE = { integrationId: "integration-1", postId: "page_story" }
const KEY = "comment-live-post:integration-1:page_story"

beforeEach(() => {
  vi.clearAllMocks()
  mockPut.mockResolvedValue(undefined)
  mockGet.mockResolvedValue(null)
})

describe("resolveLiveComment", () => {
  test("a live lookup marks the post live and remembers it", async () => {
    await expect(
      resolveLiveComment({ ...BASE, lookupIsLive: true }),
    ).resolves.toBe(true)
    expect(mockPut).toHaveBeenCalledWith(KEY, true, 7 * 24 * 60 * 60)
  })

  test("a failed lookup falls back to the remembered post", async () => {
    mockGet.mockResolvedValue(true)

    await expect(
      resolveLiveComment({ ...BASE, lookupIsLive: undefined }),
    ).resolves.toBe(true)
    expect(mockGet).toHaveBeenCalledWith(KEY)
  })

  test("a comment on a known live post without a timestamp is still live", async () => {
    mockGet.mockResolvedValue(true)

    await expect(
      resolveLiveComment({ ...BASE, lookupIsLive: false }),
    ).resolves.toBe(true)
  })

  test("an ordinary post comment is not live and logs nothing", async () => {
    await expect(
      resolveLiveComment({ ...BASE, lookupIsLive: false }),
    ).resolves.toBe(false)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  test("an unknown status on an unknown post is logged and treated as not live", async () => {
    await expect(
      resolveLiveComment({ ...BASE, lookupIsLive: undefined }),
    ).resolves.toBe(false)
    expect(mockWarn).toHaveBeenCalled()
  })

  test("a Redis failure never throws", async () => {
    mockGet.mockRejectedValue(new Error("redis down"))
    mockPut.mockRejectedValue(new Error("redis down"))

    await expect(
      resolveLiveComment({ ...BASE, lookupIsLive: false }),
    ).resolves.toBe(false)
    await expect(
      resolveLiveComment({ ...BASE, lookupIsLive: true }),
    ).resolves.toBe(true)
  })
})
