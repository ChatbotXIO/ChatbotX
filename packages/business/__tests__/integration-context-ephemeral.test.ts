import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  take: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  distributedStore: { put: mocks.put, take: mocks.take },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: vi.fn(async () => ({
    appUrl: "https://app.test",
    publicRealtimeUrl: "https://rt.test",
    storageUrl: "https://s3.test",
  })),
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  publishGuestRealtimeEvent: vi.fn(),
}))

import { buildContextWithAuthStore } from "../src/integration-context/build-context"

const baseArgs = {
  workspaceId: "w1",
  auth: {},
  authStore: {} as never,
  integrationDetail: {},
}

describe("buildContextWithAuthStore ephemeral store", () => {
  beforeEach(() => {
    mocks.put.mockReset()
    mocks.take.mockReset()
  })

  test("put writes under the channel/integration-prefixed key", async () => {
    const ctx = await buildContextWithAuthStore({
      ...baseArgs,
      media: { channel: "line", integrationId: "9" },
    })
    await ctx.ephemeral?.put("a", "v", 50)
    expect(mocks.put).toHaveBeenCalledWith(
      "integration-ephemeral:line:9:a",
      "v",
      50,
    )
  })

  test("take reads and returns the prefixed key's value", async () => {
    mocks.take.mockResolvedValue("tok")
    const ctx = await buildContextWithAuthStore({
      ...baseArgs,
      media: { channel: "line", integrationId: "9" },
    })
    await expect(ctx.ephemeral?.take("a")).resolves.toBe("tok")
    expect(mocks.take).toHaveBeenCalledWith("integration-ephemeral:line:9:a")
  })

  test("ephemeral is omitted without media", async () => {
    const ctx = await buildContextWithAuthStore(baseArgs)
    expect(ctx.ephemeral).toBeUndefined()
  })
})
