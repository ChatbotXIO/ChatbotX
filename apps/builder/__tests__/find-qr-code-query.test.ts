// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  qrCodeService: { find: mocks.find },
  qrCodeWorkspaceCacheTag: (workspaceId: string) =>
    `workspaces:${workspaceId}#qr-codes`,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))

const { findQrCode } = await import("@/features/qr-codes/queries")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withCache.mockImplementation(
    async (_key: string, fn: () => unknown) => await fn(),
  )
})

describe("findQrCode", () => {
  // Regression test for the PR #1098 cache move: `qrCodeService.find` is now
  // deliberately uncached (the public QR landing page reads it directly), so
  // the builder-only cache lives here instead. This pins the cache's
  // existence and its tag/TTL shape so a future refactor doesn't
  // accidentally drop the cache from both places at once.
  test("caches the result under the workspace's qr-codes tag", async () => {
    mocks.find.mockResolvedValue({ id: "qr-1" })

    const result = await findQrCode({ workspaceId: "ws-1", id: "qr-1" })

    expect(result).toEqual({ id: "qr-1" })
    expect(mocks.withCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({
        tags: ["workspaces:ws-1#qr-codes"],
      }),
    )
    expect(mocks.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "qr-1",
    })
  })
})
