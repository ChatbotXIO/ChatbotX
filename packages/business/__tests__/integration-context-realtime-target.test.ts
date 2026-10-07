import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  buildContext,
  buildContextWithAuthStore,
} from "../src/integration-context/build-context"

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

vi.mock("../src/integration-context/auth-store", () => ({
  makeAuthStore: () => ({
    load: async () => ({ authType: "none" }),
    save: async () => undefined,
  }),
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

describe("buildContext media storage prefix", () => {
  test("scopes channel media by channel, workspace and integration", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-06T08:00:00.000Z"))
    try {
      const context = await buildContext({
        workspaceId: "workspace_1",
        integrationType: "messenger",
        integration: { id: "integration_1", auth: { authType: "none" } },
      })

      expect(context.mediaStoragePrefix).toBe(
        "public/messenger/workspace_1/integration_1/2026/10/06",
      )
      // Avatars and other workspace files keep the workspace prefix.
      expect(context.storagePrefix).toBe("public/ws/workspace_1/2026/10/06")
    } finally {
      vi.useRealTimers()
    }
  })

  test("leaves the media prefix unset for a context built without a channel", async () => {
    const context = await buildContextWithAuthStore({
      auth: { authType: "none" },
      authStore: {
        load: async () => ({ authType: "none" }),
        save: async () => undefined,
      },
      integrationDetail: {},
      workspaceId: "workspace_1",
    })

    expect(context.mediaStoragePrefix).toBeUndefined()
  })
})
