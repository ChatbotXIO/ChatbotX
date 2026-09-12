import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWorkspaceEvent: vi.fn(),
  updateCapiStatus: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    findWorkspaceEvent: mocks.findWorkspaceEvent,
    updateCapiStatus: mocks.updateCapiStatus,
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

describe("AdsConversionService.updateCapiStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rejects a non-pending from via the zod schema, without reaching the repository", () => {
    expect(() =>
      adsConversionService.updateCapiStatus({
        id: "event-1",
        workspaceId: "ws-1",
        // @ts-expect-error — deliberately not "pending" to exercise the schema
        from: "sent",
        to: "failed",
      }),
    ).toThrow()

    expect(mocks.updateCapiStatus).not.toHaveBeenCalled()
  })

  test("passes the repository's null no-match result through untouched", async () => {
    mocks.updateCapiStatus.mockResolvedValue(null)

    const result = await adsConversionService.updateCapiStatus({
      id: "event-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })

    expect(result).toBeNull()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith(
      {
        id: "event-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "failed",
      },
      undefined,
    )
  })
})

describe("AdsConversionService.findWorkspaceEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates straight to the repository", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({ id: "event-1" })

    const result = await adsConversionService.findWorkspaceEvent({
      id: "event-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ id: "event-1" })
    expect(mocks.findWorkspaceEvent).toHaveBeenCalledWith(
      { id: "event-1", workspaceId: "ws-1" },
      undefined,
    )
  })
})
