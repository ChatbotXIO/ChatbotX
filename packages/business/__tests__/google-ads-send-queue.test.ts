import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enqueueIntegrationJob: vi.fn(),
  getJob: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendGoogleAdsConversion: "sendGoogleAdsConversion" },
  enqueueIntegrationJob: mocks.enqueueIntegrationJob,
  integrationQueue: { getJob: mocks.getJob },
}))

const { enqueueSend, isSendJobLive, sendJobId } = await import(
  "../src/google-ads/send-queue"
)

describe("sendJobId", () => {
  test("encodes event and generation without ':'", () => {
    expect(sendJobId("evt-1", 3)).toBe("google-ads-send-evt-1-a3")
    expect(sendJobId("evt-1", 0)).not.toContain(":")
  })
})

describe("enqueueSend", () => {
  beforeEach(() => vi.clearAllMocks())

  test("enqueues the generation's job with its delay and deterministic jobId", async () => {
    await enqueueSend({ id: "evt-1", workspaceId: "ws-1" }, 2, 5000)
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "sendGoogleAdsConversion",
        data: {
          googleAdsConversionEventId: "evt-1",
          workspaceId: "ws-1",
          attempt: 2,
        },
      },
      { jobId: "google-ads-send-evt-1-a2", delay: 5000 },
    )
  })
})

describe("isSendJobLive", () => {
  beforeEach(() => vi.clearAllMocks())

  test("looks the job up by its generation id", async () => {
    mocks.getJob.mockResolvedValue(undefined)
    await isSendJobLive("evt-1", 4)
    expect(mocks.getJob).toHaveBeenCalledWith("google-ads-send-evt-1-a4")
  })

  test("is false when the job does not exist", async () => {
    mocks.getJob.mockResolvedValue(undefined)
    expect(await isSendJobLive("evt-1", 0)).toBe(false)
  })

  test.each([
    "waiting",
    "delayed",
    "active",
    "prioritized",
  ])("is true while the job is %s", async (state) => {
    mocks.getJob.mockResolvedValue({ getState: async () => state })
    expect(await isSendJobLive("evt-1", 0)).toBe(true)
  })

  test.each([
    "completed",
    "failed",
    "unknown",
  ])("is false when the retained job is %s", async (state) => {
    mocks.getJob.mockResolvedValue({ getState: async () => state })
    expect(await isSendJobLive("evt-1", 0)).toBe(false)
  })
})
