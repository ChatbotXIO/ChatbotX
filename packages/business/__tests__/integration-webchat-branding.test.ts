import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isCommunity: vi.fn(),
  resolveWorkspaceAppUrl: vi.fn(),
}))

vi.mock("../src/keys", () => ({ isCommunity: mocks.isCommunity }))
vi.mock("../src/platform/settings", () => ({
  resolveWorkspaceAppUrl: mocks.resolveWorkspaceAppUrl,
}))

const { BRANDING_TITLE, buildBrandingUrl } = await import(
  "../src/platform/branding"
)
const { brandWebchatMenus } = await import(
  "../src/integration-webchat/branding"
)

describe("brandWebchatMenus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isCommunity.mockReturnValue(true)
    mocks.resolveWorkspaceAppUrl.mockResolvedValue("https://app.example.com")
  })

  test("does not rewrite a correctly placed branding entry", async () => {
    const brandingUrl = buildBrandingUrl(
      "https://app.example.com",
      "webchat",
      true,
    )
    const menus = [
      { label: BRANDING_TITLE, type: "url" as const, url: brandingUrl },
    ]

    await expect(
      brandWebchatMenus({ persistentMenus: menus, workspaceId: "ws-1" }),
    ).resolves.toBe(menus)
  })

  test("normalizes duplicate or mislabeled canonical branding entries", async () => {
    const brandingUrl = buildBrandingUrl(
      "https://app.example.com",
      "webchat",
      true,
    )
    const menus = [
      { label: BRANDING_TITLE, type: "url" as const, url: brandingUrl },
      { label: "Wrong label", type: "url" as const, url: brandingUrl },
    ]

    await expect(
      brandWebchatMenus({ persistentMenus: menus, workspaceId: "ws-1" }),
    ).resolves.toEqual([
      { label: BRANDING_TITLE, type: "url", url: brandingUrl },
    ])
  })

  test("keeps non-branding URLs that merely have branding query parameters", async () => {
    const menus = [
      {
        label: "Partner",
        type: "url" as const,
        url: "https://partner.example.com/?channel=webchat&ref=cloud",
      },
    ]

    await expect(
      brandWebchatMenus({ persistentMenus: menus, workspaceId: "ws-1" }),
    ).resolves.toEqual([
      ...menus,
      {
        label: BRANDING_TITLE,
        type: "url",
        url: buildBrandingUrl("https://app.example.com", "webchat", true),
      },
    ])
  })
})
