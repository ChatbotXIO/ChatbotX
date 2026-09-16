import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  drop: vi.fn(),
  liveMembers: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  presenceStore: {
    heartbeat: mocks.heartbeat,
    drop: mocks.drop,
    liveMembers: mocks.liveMembers,
  },
}))

const {
  whatsappVoipPresenceService,
  VOIP_PRESENCE_TTL_MS,
  MAX_VOIP_RING_TARGETS,
} = await import("../src/whatsapp-call/voip-presence-service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("whatsappVoipPresenceService", () => {
  test("heartbeat marks the agent live under the workspace key for the presence TTL", async () => {
    await whatsappVoipPresenceService.heartbeat({
      workspaceId: "ws1",
      userId: "agent-1",
    })

    expect(mocks.heartbeat).toHaveBeenCalledWith(
      "voip:presence:ws1",
      "agent-1",
      VOIP_PRESENCE_TTL_MS,
    )
  })

  test("signOff drops the agent from the workspace key", async () => {
    await whatsappVoipPresenceService.signOff({
      workspaceId: "ws1",
      userId: "agent-1",
    })

    expect(mocks.drop).toHaveBeenCalledWith("voip:presence:ws1", "agent-1")
  })

  test("liveAgents reads the workspace key capped at the ring-target max by default", async () => {
    mocks.liveMembers.mockResolvedValue(["agent-1", "agent-2"])

    await expect(
      whatsappVoipPresenceService.liveAgents({ workspaceId: "ws1" }),
    ).resolves.toEqual(["agent-1", "agent-2"])

    expect(mocks.liveMembers).toHaveBeenCalledWith(
      "voip:presence:ws1",
      MAX_VOIP_RING_TARGETS,
    )
  })

  test("liveAgents honors an explicit limit", async () => {
    mocks.liveMembers.mockResolvedValue([])

    await whatsappVoipPresenceService.liveAgents({
      workspaceId: "ws1",
      limit: 3,
    })

    expect(mocks.liveMembers).toHaveBeenCalledWith("voip:presence:ws1", 3)
  })
})
