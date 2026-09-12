import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildFacebookAdsContext: vi.fn(),
  runAction: vi.fn(),
  enqueueIntegrationJob: vi.fn(),
}))

vi.mock("../src/integration-facebook-ads/graph-reads", () => ({
  buildFacebookAdsContext: mocks.buildFacebookAdsContext,
  facebookAdsIntegration: {
    runAction: mocks.runAction,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    syncRetargetAudience: "syncRetargetAudience",
  },
  enqueueIntegrationJob: mocks.enqueueIntegrationJob,
}))

const { adsRetargetService } = await import("../src/ads-retarget/service")

describe("adsRetargetService.startAudienceSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildFacebookAdsContext.mockResolvedValue({ ctx: true })
    mocks.enqueueIntegrationJob.mockResolvedValue(undefined)
  })

  test("threads channel + integrationMessengerId through the retarget job payload and jobId (Phase 3 widening)", async () => {
    await adsRetargetService.startAudienceSync({
      workspaceId: "ws-1",
      segment: "conversations",
      since: "2026-08-01",
      until: "2026-08-10",
      adAccountId: "act_1",
      customAudienceId: "aud-1",
      channel: "messenger",
      integrationMessengerId: "im-1",
    })

    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "syncRetargetAudience",
        data: expect.objectContaining({
          workspaceId: "ws-1",
          customAudienceId: "aud-1",
          segment: "conversations",
          channel: "messenger",
          integrationMessengerId: "im-1",
        }),
      },
      { jobId: expect.stringContaining("messenger") },
    )
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      expect.anything(),
      { jobId: expect.stringContaining("im-1") },
    )
  })

  test("reuses a supplied customAudienceId instead of creating a new audience", async () => {
    await adsRetargetService.startAudienceSync({
      workspaceId: "ws-1",
      segment: "leads",
      since: "2026-08-01",
      until: "2026-08-10",
      adAccountId: "act_1",
      customAudienceId: "aud-existing",
    })

    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customAudienceId: "aud-existing" }),
      }),
      expect.anything(),
    )
  })

  test("creates a new audience via Graph when no customAudienceId is supplied", async () => {
    mocks.runAction.mockResolvedValue({ id: "aud-created" })

    const result = await adsRetargetService.startAudienceSync({
      workspaceId: "ws-1",
      segment: "leads",
      since: "2026-08-01",
      until: "2026-08-10",
      adAccountId: "act_1",
      audienceName: "New audience",
    })

    expect(mocks.runAction).toHaveBeenCalledWith("createCustomAudience", {
      ctx: { ctx: true },
      props: { adAccountId: "act_1", name: "New audience" },
    })
    expect(result).toEqual({ customAudienceId: "aud-created", enqueued: true })
  })

  test("rejects when neither audienceName nor customAudienceId is supplied", async () => {
    await expect(
      adsRetargetService.startAudienceSync({
        workspaceId: "ws-1",
        segment: "leads",
        since: "2026-08-01",
        until: "2026-08-10",
        adAccountId: "act_1",
      } as never),
    ).rejects.toThrow()

    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
  })
})
