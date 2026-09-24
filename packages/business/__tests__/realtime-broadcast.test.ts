import { beforeEach, describe, expect, test, vi } from "vitest"
import { broadcastToWorkspaceParty } from "../src/platform/realtime-broadcast"

const {
  broadcastToWorkspacePartyLow,
  resolveBroadcastSecret,
  resolveRealtimeBroadcastUrl,
  resolveTenantSettings,
} = vi.hoisted(() => ({
  broadcastToWorkspacePartyLow: vi.fn(),
  resolveBroadcastSecret: vi.fn(),
  resolveRealtimeBroadcastUrl: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  broadcastToWorkspaceParty: broadcastToWorkspacePartyLow,
}))

vi.mock("../src/platform/settings", () => ({
  resolveBroadcastSecret,
  resolveRealtimeBroadcastUrl,
  resolveTenantSettings,
}))

const event = {
  eventType: "typing",
  data: { conversationId: "conversation_1", seconds: 1, typing: true },
} as const

beforeEach(() => {
  broadcastToWorkspacePartyLow.mockReset()
  resolveBroadcastSecret.mockReset()
  resolveRealtimeBroadcastUrl.mockReset()
  resolveTenantSettings.mockReset()
  broadcastToWorkspacePartyLow.mockResolvedValue(undefined)
  resolveBroadcastSecret.mockReturnValue("s".repeat(32))
  resolveRealtimeBroadcastUrl.mockReturnValue("http://realtime:1999")
})

describe("broadcastToWorkspaceParty", () => {
  test("uses the shared realtime target without resolving tenant settings", async () => {
    await broadcastToWorkspaceParty("workspace_1", event)
    await broadcastToWorkspaceParty("workspace_2", event)
    expect(resolveBroadcastSecret).toHaveBeenCalledTimes(1)
    expect(resolveRealtimeBroadcastUrl).toHaveBeenCalledTimes(1)
    expect(resolveTenantSettings).not.toHaveBeenCalled()
    expect(broadcastToWorkspacePartyLow).toHaveBeenNthCalledWith(
      1,
      { secret: "s".repeat(32), url: "http://realtime:1999" },
      "workspace_1",
      event,
    )
    expect(broadcastToWorkspacePartyLow).toHaveBeenNthCalledWith(
      2,
      { secret: "s".repeat(32), url: "http://realtime:1999" },
      "workspace_2",
      event,
    )
  })
})
