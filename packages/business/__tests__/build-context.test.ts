import { describe, expect, test, vi } from "vitest"
import {
  buildContext,
  buildContextWithAuthStore,
} from "../src/integration-context/build-context"

const mocks = vi.hoisted(() => ({
  getChannelMediaPrefix: vi.fn(),
  publishGuestRealtimeEvent: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  getChannelMediaPrefix: mocks.getChannelMediaPrefix,
  getStoragePrefix: (workspaceId: string) => `storage/${workspaceId}`,
  uploader: {},
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  publishGuestRealtimeEvent: mocks.publishGuestRealtimeEvent,
}))

vi.mock("../src/integration-context/auth-store", () => ({
  makeAuthStore: vi.fn(() => ({})),
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: async () => ({
    appUrl: "https://app.test",
    publicRealtimeUrl: "wss://realtime.test",
    storageUrl: "https://storage.test",
  }),
}))

describe("buildContextWithAuthStore", () => {
  test("scopes channel media by channel, workspace, and integration", async () => {
    mocks.getChannelMediaPrefix.mockReturnValue(
      "public/messenger/workspace-1/integration-1/2026/10/06",
    )

    const context = await buildContext({
      workspaceId: "workspace-1",
      integrationType: "messenger",
      integration: { auth: {} as never, id: "integration-1" },
    })

    expect(mocks.getChannelMediaPrefix).toHaveBeenCalledWith({
      channel: "messenger",
      integrationId: "integration-1",
      workspaceId: "workspace-1",
    })
    expect(context.mediaStoragePrefix).toBe(
      "public/messenger/workspace-1/integration-1/2026/10/06",
    )
    expect(context.storagePrefix).toBe("storage/workspace-1")
  })

  test("leaves the media prefix unset without a channel integration", async () => {
    const context = await buildContextWithAuthStore({
      workspaceId: "workspace-1",
      auth: {} as never,
      authStore: {} as never,
      integrationDetail: {},
    })

    expect(context.mediaStoragePrefix).toBeUndefined()
  })

  test("forwards guest realtime events with the context workspace and guest ids", async () => {
    const context = await buildContextWithAuthStore({
      workspaceId: "workspace-1",
      auth: {} as never,
      authStore: {} as never,
      integrationDetail: {},
    })
    const event = { data: { typing: true }, eventType: "typing" } as never

    await context.platform.publishGuestRealtimeEvent("guest-1", event)

    expect(mocks.publishGuestRealtimeEvent).toHaveBeenCalledWith(
      { guestConversationId: "guest-1", workspaceId: "workspace-1" },
      event,
    )
  })
})
