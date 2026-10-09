import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByWorkspaceId: vi.fn(),
  upsertSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  googleAdsSettingsRepository: {
    findByWorkspaceId: mocks.findByWorkspaceId,
    upsertSettings: mocks.upsertSettings,
  },
}))

const { googleAdsSettingsService } = await import(
  "../src/google-ads-settings/service"
)

const WORKSPACE_ID = "ws-1"
const CONSENT = {
  adUserData: { type: "granted" },
  adPersonalization: { type: "variable", template: "{{contact.consent}}" },
} as const

const rowWith = (settings: unknown) => ({
  id: "gas-1",
  workspaceId: WORKSPACE_ID,
  settings,
})

describe("googleAdsSettingsService.getConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns absent with not-provided consent when there is no row", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(null)

    const result = await googleAdsSettingsService.getConsent(WORKSPACE_ID)

    expect(result).toEqual({
      status: "absent",
      consent: {
        adUserData: { type: "notProvided" },
        adPersonalization: { type: "notProvided" },
      },
    })
  })

  test("returns the stored consent of a valid v1 document", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(
      rowWith({ version: 1, consent: CONSENT }),
    )

    const result = await googleAdsSettingsService.getConsent(WORKSPACE_ID)

    expect(result).toEqual({ status: "ok", consent: CONSENT })
  })

  test("returns invalid when the stored document fails the schema", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(
      rowWith({ version: 1, consent: { adUserData: { type: "bogus" } } }),
    )

    expect(await googleAdsSettingsService.getConsent(WORKSPACE_ID)).toEqual({
      status: "invalid",
    })
  })

  test("returns invalid for an unknown version", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(
      rowWith({ version: 2, consent: CONSENT }),
    )

    expect(await googleAdsSettingsService.getConsent(WORKSPACE_ID)).toEqual({
      status: "invalid",
    })
  })

  test("reads only the requested workspace", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(null)

    await googleAdsSettingsService.getConsent("ws-other")

    expect(mocks.findByWorkspaceId).toHaveBeenCalledTimes(1)
    expect(mocks.findByWorkspaceId).toHaveBeenCalledWith("ws-other")
  })
})

describe("googleAdsSettingsService.updateConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("writes the consent wrapped in a v1 document for the workspace", async () => {
    mocks.upsertSettings.mockResolvedValue(rowWith({}))

    await googleAdsSettingsService.updateConsent(WORKSPACE_ID, CONSENT)

    expect(mocks.upsertSettings).toHaveBeenCalledTimes(1)
    expect(mocks.upsertSettings).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      settings: { version: 1, consent: CONSENT },
    })
  })

  test("refuses an invalid payload without writing", async () => {
    await expect(
      googleAdsSettingsService.updateConsent(WORKSPACE_ID, {
        adUserData: { type: "bogus" },
        adPersonalization: { type: "granted" },
      } as never),
    ).rejects.toMatchObject({ httpStatusCode: 422, field: "adUserData.type" })

    expect(mocks.upsertSettings).not.toHaveBeenCalled()
  })

  test("refuses a variable template without a placeholder", async () => {
    await expect(
      googleAdsSettingsService.updateConsent(WORKSPACE_ID, {
        adUserData: { type: "variable", template: "granted" },
        adPersonalization: { type: "granted" },
      }),
    ).rejects.toThrow("googleAds.consent.validation.templateRequired")

    expect(mocks.upsertSettings).not.toHaveBeenCalled()
  })
})
