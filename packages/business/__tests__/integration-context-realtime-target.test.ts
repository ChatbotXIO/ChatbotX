import { beforeEach, describe, expect, test, vi } from "vitest"
import { buildContextWithAuthStore } from "../src/integration-context/build-context"

const mocks = vi.hoisted(() => ({
  buildBroadcastAuthHeader: vi.fn(),
  resolveRealtimeBroadcastTarget: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  buildBroadcastAuthHeader: mocks.buildBroadcastAuthHeader,
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  resolveRealtimeBroadcastTarget: mocks.resolveRealtimeBroadcastTarget,
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildBroadcastAuthHeader.mockResolvedValue("Bearer cached-token")
  mocks.resolveRealtimeBroadcastTarget.mockReturnValue({
    secret: "s".repeat(32),
    url: "http://realtime:1999/",
  })
  mocks.resolveTenantSettings.mockResolvedValue({
    appUrl: "http://builder:3123",
    storageUrl: "http://builder:3123/storage/",
    publicRealtimeUrl: "http://builder:3123/ws/",
  })
})

describe("buildContextWithAuthStore", () => {
  test("uses the memoized deployment target for realtime URL and auth headers", async () => {
    const context = await buildContextWithAuthStore({
      auth: { authType: "none" },
      authStore: {
        load: async () => ({ authType: "none" }),
        save: async () => undefined,
      },
      integrationDetail: {},
      workspaceId: "workspace_1",
    })

    expect(context.platform.internalRealtimeUrl).toBe("http://realtime:1999/")
    await expect(
      context.platform.getRealtimeBroadcastAuthHeaders({
        id: "guest_1",
        kind: "guest",
      }),
    ).resolves.toEqual({ Authorization: "Bearer cached-token" })
    expect(mocks.resolveRealtimeBroadcastTarget).toHaveBeenCalledTimes(1)
    expect(mocks.buildBroadcastAuthHeader).toHaveBeenCalledWith(
      { id: "guest_1", kind: "guest" },
      "s".repeat(32),
    )
  })
})
