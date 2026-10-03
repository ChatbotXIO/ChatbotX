import { describe, expect, test, vi } from "vitest"
import { buildContextWithAuthStore } from "../src/integration-context/build-context"

const mocks = vi.hoisted(() => ({
  publishGuestRealtimeEvent: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  getStoragePrefix: (workspaceId: string) => `storage/${workspaceId}`,
  uploader: {},
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  publishGuestRealtimeEvent: mocks.publishGuestRealtimeEvent,
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: async () => ({
    appUrl: "https://app.test",
    publicRealtimeUrl: "wss://realtime.test",
    storageUrl: "https://storage.test",
  }),
}))

describe("buildContextWithAuthStore", () => {
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
