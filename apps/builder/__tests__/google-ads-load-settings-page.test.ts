// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSetup: vi.fn(),
  isConfigured: vi.fn(),
  getConsent: vi.fn(),
  loadSettingsSession: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationGoogleAdsService: {
    getSetup: mocks.getSetup,
    isConfigured: mocks.isConfigured,
  },
  googleAdsSettingsService: { getConsent: mocks.getConsent },
}))
vi.mock("@/features/integration-google-ads/lib/load-settings-session", () => ({
  loadSettingsSession: mocks.loadSettingsSession,
}))

const { loadGoogleAdsSettingsPage } = await import(
  "@/features/integration-google-ads/lib/load-settings-page"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSetup.mockResolvedValue(null)
  mocks.isConfigured.mockResolvedValue(true)
  mocks.loadSettingsSession.mockResolvedValue(null)
  mocks.getConsent.mockResolvedValue({
    status: "ok",
    consent: {
      adUserData: { type: "granted" },
      adPersonalization: { type: "notProvided" },
    },
  })
})

describe("loadGoogleAdsSettingsPage", () => {
  test("passes the consent through when nothing is connected", async () => {
    const result = await loadGoogleAdsSettingsPage({
      workspaceId: "100",
      searchParams: {},
    })

    expect(result.setup).toBeNull()
    expect(result.consent).toEqual({
      status: "ok",
      adUserData: { type: "granted", template: null },
      adPersonalization: { type: "notProvided", template: null },
    })
    expect(mocks.getConsent).toHaveBeenCalledWith("100")
  })

  test("reports an unreadable stored consent as invalid", async () => {
    mocks.getConsent.mockResolvedValue({ status: "invalid" })

    const result = await loadGoogleAdsSettingsPage({
      workspaceId: "100",
      searchParams: {},
    })

    expect(result.consent.status).toBe("invalid")
  })

  test("forwards the session param and the configured flag", async () => {
    mocks.loadSettingsSession.mockResolvedValue({ id: "3", status: "failed" })
    mocks.isConfigured.mockResolvedValue(false)

    const result = await loadGoogleAdsSettingsPage({
      workspaceId: "100",
      searchParams: { session: "3" },
    })

    expect(mocks.loadSettingsSession).toHaveBeenCalledWith({
      workspaceId: "100",
      sessionParam: "3",
    })
    expect(result.session).toEqual({ id: "3", status: "failed" })
    expect(result.isConfigured).toBe(false)
  })
})
