import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listExportSegmentRows: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    listExportSegmentRows: mocks.listExportSegmentRows,
  },
  adsConversionRuleRepository: {},
  integrationFacebookAdsRepository: {},
  integrationWhatsappRepository: {},
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendConversionEvent: "sendConversionEvent" },
  enqueueIntegrationJob: vi.fn(),
}))

const { adsConversionService } = await import("../src/ads-conversion/service")

const baseInput = {
  workspaceId: "1",
  segment: "leads" as const,
  since: new Date("2026-08-10T00:00:00.000Z"),
  until: new Date("2026-08-11T23:59:59.999Z"),
  limit: 500,
}

describe("AdsConversionService.listExportRows channel default", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listExportSegmentRows.mockResolvedValue({ rows: [], hasMore: false })
  })

  test("defaults to whatsapp when channel and every integration id are absent", async () => {
    await adsConversionService.listExportRows(baseInput)

    expect(mocks.listExportSegmentRows).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp" }),
      undefined,
    )
  })

  test("leaves channel undefined when a messenger integration id is present", async () => {
    await adsConversionService.listExportRows({
      ...baseInput,
      integrationMessengerId: "111",
    })

    expect(mocks.listExportSegmentRows).toHaveBeenCalledWith(
      expect.objectContaining({ channel: undefined }),
      undefined,
    )
  })

  test("leaves channel undefined when an instagram integration id is present", async () => {
    await adsConversionService.listExportRows({
      ...baseInput,
      integrationInstagramId: "222",
    })

    expect(mocks.listExportSegmentRows).toHaveBeenCalledWith(
      expect.objectContaining({ channel: undefined }),
      undefined,
    )
  })

  test("leaves channel undefined when a whatsapp integration id is present", async () => {
    await adsConversionService.listExportRows({
      ...baseInput,
      integrationWhatsappId: "333",
    })

    expect(mocks.listExportSegmentRows).toHaveBeenCalledWith(
      expect.objectContaining({ channel: undefined }),
      undefined,
    )
  })

  test("never overrides an explicit channel", async () => {
    await adsConversionService.listExportRows({
      ...baseInput,
      channel: "messenger",
    })

    expect(mocks.listExportSegmentRows).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "messenger" }),
      undefined,
    )
  })
})

describe("AdsConversionService.listRetargetContacts stays unscoped", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listExportSegmentRows.mockResolvedValue({ rows: [], hasMore: false })
  })

  test("does not default channel when unscoped (any-channel saved filter semantics)", async () => {
    await adsConversionService.listRetargetContacts({
      workspaceId: "1",
      segment: "leads",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
      limit: 500,
    })

    expect(mocks.listExportSegmentRows).toHaveBeenCalledTimes(1)
    expect(mocks.listExportSegmentRows.mock.calls[0]?.[0]).not.toHaveProperty(
      "channel",
    )
  })
})
