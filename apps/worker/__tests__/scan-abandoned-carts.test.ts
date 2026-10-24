// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimAbandonedCarts: vi.fn(),
  remindAbandonedCart: vi.fn(),
  blocked: new Set<string>(),
}))

vi.mock("@chatbotx.io/business", () => ({
  webshopService: {
    claimAbandonedCarts: mocks.claimAbandonedCarts,
    remindAbandonedCart: mocks.remindAbandonedCart,
  },
  withBlockedOwnerGuard: async (workspaceId: string, fn: () => unknown) =>
    mocks.blocked.has(workspaceId) ? undefined : await fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: async ({ fn }: { fn: () => unknown }) => await fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

const { scanAbandonedCarts } = await import(
  "../src/schedule/handlers/scan-abandoned-carts"
)

const cart = (id: string, workspaceId = "ws-1") => ({
  id,
  workspaceId,
  contactId: `c-${id}`,
  contactInboxId: null,
  lastActivityAt: new Date(),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.blocked.clear()
  mocks.remindAbandonedCart.mockResolvedValue("reminded")
})

describe("scanAbandonedCarts", () => {
  test("reminds every claimed cart and stops on a short batch", async () => {
    mocks.claimAbandonedCarts.mockResolvedValueOnce([cart("a"), cart("b")])
    await expect(scanAbandonedCarts()).resolves.toEqual({ reminded: 2 })
    expect(mocks.claimAbandonedCarts).toHaveBeenCalledTimes(1)
    expect(mocks.claimAbandonedCarts).toHaveBeenCalledWith({ limit: 100 })
  })

  test("keeps claiming while batches are full", async () => {
    const full = Array.from({ length: 100 }, (_, index) => cart(`f${index}`))
    mocks.claimAbandonedCarts
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([cart("last")])
    await expect(scanAbandonedCarts()).resolves.toEqual({ reminded: 101 })
    expect(mocks.claimAbandonedCarts).toHaveBeenCalledTimes(2)
  })

  test("skips a blocked owner's cart and keeps going after a failure", async () => {
    mocks.blocked.add("ws-blocked")
    mocks.claimAbandonedCarts.mockResolvedValueOnce([
      cart("a", "ws-blocked"),
      cart("b"),
      cart("c"),
    ])
    mocks.remindAbandonedCart
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce("reminded")
    await expect(scanAbandonedCarts()).resolves.toEqual({ reminded: 1 })
    expect(mocks.remindAbandonedCart).toHaveBeenCalledTimes(2)
  })
})
