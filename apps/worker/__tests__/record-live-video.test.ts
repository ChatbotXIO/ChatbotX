import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  hasChannelHandler: vi.fn(),
  identify: vi.fn(),
  loggerInfo: vi.fn(),
  recordLiveObservation: vi.fn(),
  resolvePostIntegration: vi.fn(),
  runChannelHandler: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  channelPostService: { recordLiveObservation: mocks.recordLiveObservation },
}))
vi.mock("../src/lib/logger", () => ({ logger: { info: mocks.loggerInfo } }))
vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mocks.identify,
  },
}))
vi.mock("../src/channel-post-sync/resolve-post-integration", () => ({
  resolvePostIntegration: mocks.resolvePostIntegration,
}))

const { recordLiveVideoStatusChange } = await import(
  "../src/channel-post-sync/record-live-video"
)

const data = {
  integrationIdentifier: "page-1",
  integrationType: "messenger",
  liveVideoId: "live-1",
  status: "live_stopped",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.identify.mockResolvedValue({
    inbox: { channel: "messenger", id: "11", workspaceId: "ws-1" },
  })
  mocks.resolvePostIntegration.mockResolvedValue({
    channel: "messenger",
    ctx: { kind: "ctx" },
    integration: {
      hasChannelHandler: mocks.hasChannelHandler,
      runChannelHandler: mocks.runChannelHandler,
    },
    integrationId: "5",
    sourceAccountId: "page-1",
  })
  mocks.hasChannelHandler.mockReturnValue(true)
  mocks.recordLiveObservation.mockResolvedValue(true)
})

describe("recordLiveVideoStatusChange", () => {
  test("re-reads the broadcast and records what the read says, not the webhook's status", async () => {
    mocks.runChannelHandler.mockResolvedValue({
      caption: "Live!",
      externalPostId: "page-1_555",
      liveStatus: "ended",
      permalink: "https://facebook.com/live-1",
      publishedAt: new Date("2026-11-24T09:00:00Z"),
    })

    await recordLiveVideoStatusChange({ ...data, status: "live" })

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "post",
      "readLiveBroadcast",
      { ctx: { kind: "ctx" }, data: { liveVideoId: "live-1" } },
    )
    expect(mocks.recordLiveObservation).toHaveBeenCalledWith({
      caption: "Live!",
      channel: "messenger",
      externalPostId: "page-1_555",
      inboxId: "11",
      integrationId: "5",
      observedAt: expect.any(Date),
      permalink: "https://facebook.com/live-1",
      publishedAt: new Date("2026-11-24T09:00:00Z"),
      source: "webhook",
      sourceAccountId: "page-1",
      status: "ended",
      workspaceId: "ws-1",
    })
  })

  test("a broadcast that is scheduled or has no post records nothing", async () => {
    mocks.runChannelHandler.mockResolvedValue(null)

    await recordLiveVideoStatusChange(data)

    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("a channel without the read records nothing and reads nothing", async () => {
    mocks.hasChannelHandler.mockReturnValue(false)

    await recordLiveVideoStatusChange(data)

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("a failed read propagates so the job retries", async () => {
    mocks.runChannelHandler.mockRejectedValue(new Error("graph down"))

    await expect(recordLiveVideoStatusChange(data)).rejects.toThrow(
      "graph down",
    )
    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("a failed write propagates so the job retries", async () => {
    mocks.runChannelHandler.mockResolvedValue({
      caption: null,
      externalPostId: "page-1_555",
      liveStatus: "live",
      permalink: null,
      publishedAt: null,
    })
    mocks.recordLiveObservation.mockRejectedValue(new Error("db down"))

    await expect(recordLiveVideoStatusChange(data)).rejects.toThrow("db down")
  })
})
