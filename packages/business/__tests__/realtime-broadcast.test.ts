import { beforeEach, describe, expect, test, vi } from "vitest"
import { broadcastToWorkspaceParty } from "../src/platform/realtime-broadcast"

const {
  broadcastToWorkspacePartyLow,
  loggerError,
  resolveBroadcastSecret,
  resolveRealtimeBroadcastUrl,
  resolveTenantSettings,
} = vi.hoisted(() => ({
  broadcastToWorkspacePartyLow: vi.fn(),
  loggerError: vi.fn(),
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

vi.mock("../src/logger", () => ({
  logger: { error: loggerError },
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
  loggerError.mockReset()
  broadcastToWorkspacePartyLow.mockResolvedValue(undefined)
  resolveBroadcastSecret.mockReturnValue("s".repeat(32))
  resolveRealtimeBroadcastUrl.mockReturnValue("http://realtime:1999")
})

describe("broadcastToWorkspaceParty", () => {
  test("returns null when resolving the realtime target fails", async () => {
    const error = new Error("missing realtime secret")
    resolveBroadcastSecret.mockImplementation(() => {
      throw error
    })

    await expect(broadcastToWorkspaceParty("workspace_1", event)).resolves.toBe(
      null,
    )

    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledWith(
      { err: error },
      "Failed to resolve realtime broadcast target",
    )
  })

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
