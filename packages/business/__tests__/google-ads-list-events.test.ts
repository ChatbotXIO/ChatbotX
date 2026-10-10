import { beforeEach, describe, expect, test, vi } from "vitest"

const listByWorkspace = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/database/repositories", () => ({
  googleAdsConversionEventRepository: { listByWorkspace },
}))
vi.mock("../src/google-ads/delivery", () => ({
  deliverGoogleAdsConversion: vi.fn(),
}))
vi.mock("../src/google-ads/housekeeping", () => ({
  pollGoogleAdsProcessingStatus: vi.fn(),
  sweepStrandedGoogleAdsEvents: vi.fn(),
  syncGoogleAdsSetups: vi.fn(),
}))
vi.mock("../src/google-ads/record-conversion", () => ({
  recordGoogleAdsConversion: vi.fn(),
}))
vi.mock("../src/google-ads/send-queue", () => ({ enqueueSend: vi.fn() }))

import { googleAdsConversionService } from "../src/google-ads/service"

describe("googleAdsConversionService.listEvents", () => {
  beforeEach(() => {
    listByWorkspace.mockReset()
  })

  test("delegates the workspace-scoped query to the repository", async () => {
    listByWorkspace.mockResolvedValueOnce({ rows: [], total: 0 })
    const input = {
      workspaceId: "ws-1",
      status: "failed" as const,
      page: 2,
      perPage: 50,
    }

    const result = await googleAdsConversionService.listEvents(input)

    expect(listByWorkspace).toHaveBeenCalledWith(input)
    expect(result).toEqual({ rows: [], total: 0 })
  })
})

describe("googleAdsConversionService.listEvents conversion action filter", () => {
  test("passes conversionActionId through to the repository", async () => {
    listByWorkspace.mockResolvedValueOnce({ rows: [], total: 0 })
    const input = {
      workspaceId: "ws-1",
      conversionActionId: "123",
      page: 1,
      perPage: 10,
    }

    await googleAdsConversionService.listEvents(input)

    expect(listByWorkspace).toHaveBeenCalledWith(input)
  })
})
