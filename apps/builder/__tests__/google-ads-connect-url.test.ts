// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getOriginUrlFromHeader: vi.fn(),
  findActiveByDomain: vi.fn(),
  updateReturnUrl: vi.fn(),
}))

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_BUILDER_URL: "https://builder.test" },
}))
vi.mock("@/lib/domain", () => ({
  getOriginUrlFromHeader: mocks.getOriginUrlFromHeader,
}))
vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => "https://broker.test",
}))
vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { findActiveByDomain: mocks.findActiveByDomain },
}))
vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { updateReturnUrl: mocks.updateReturnUrl },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: vi.fn(),
}))

const { buildSettingsReturnUrl, pointReturnUrlAtSession } = await import(
  "@/features/integration-google-ads/lib/connect-session"
)
const { sanitizeOptionalReturnUrl } = await import("@/lib/oauth-referer")

describe("buildSettingsReturnUrl", () => {
  beforeEach(() => {
    mocks.findActiveByDomain.mockResolvedValue(null)
  })

  test("is absolute and survives the engine's return-url allow-list on the builder origin", async () => {
    mocks.getOriginUrlFromHeader.mockResolvedValue(
      "https://builder.test/space/100/settings/integrations?tab=1",
    )

    const url = await buildSettingsReturnUrl("100")

    expect(url).toBe(
      "https://builder.test/space/100/settings/integrations/google-ads",
    )
    await expect(sanitizeOptionalReturnUrl(url)).resolves.toBe(url)
  })

  test("is accepted on an active white-label custom domain", async () => {
    mocks.getOriginUrlFromHeader.mockResolvedValue(
      "https://chat.reseller.test/space/100/settings",
    )
    mocks.findActiveByDomain.mockResolvedValue({ domain: "chat.reseller.test" })

    const url = await buildSettingsReturnUrl("100")

    expect(url).toBe(
      "https://chat.reseller.test/space/100/settings/integrations/google-ads",
    )
    await expect(sanitizeOptionalReturnUrl(url)).resolves.toBe(url)
  })

  test("an unknown host is dropped by the allow-list (no open redirect)", async () => {
    mocks.getOriginUrlFromHeader.mockResolvedValue("https://evil.test/x")

    const url = await buildSettingsReturnUrl("100")

    await expect(sanitizeOptionalReturnUrl(url)).resolves.toBeUndefined()
  })

  test("falls back to the builder URL when the header is empty", async () => {
    mocks.getOriginUrlFromHeader.mockResolvedValue("")

    await expect(buildSettingsReturnUrl("100")).resolves.toBe(
      "https://builder.test/space/100/settings/integrations/google-ads",
    )
  })
})

describe("pointReturnUrlAtSession", () => {
  const SETTINGS_PATH = "/space/100/settings/integrations/google-ads"

  beforeEach(() => {
    mocks.updateReturnUrl.mockReset()
  })

  test("appends the session id to the session's relative return path", async () => {
    await pointReturnUrlAtSession({
      id: "300",
      workspaceId: "100",
      returnUrl: SETTINGS_PATH,
    } as never)

    expect(mocks.updateReturnUrl).toHaveBeenCalledWith({
      id: "300",
      returnUrl: `${SETTINGS_PATH}?session=300`,
    })
  })

  test("replaces a stale session param instead of duplicating it", async () => {
    await pointReturnUrlAtSession({
      id: "300",
      workspaceId: "100",
      returnUrl: `${SETTINGS_PATH}?session=old&x=1`,
    } as never)

    expect(mocks.updateReturnUrl).toHaveBeenCalledWith({
      id: "300",
      returnUrl: `${SETTINGS_PATH}?session=300&x=1`,
    })
  })

  test("falls back to the workspace's Google Ads settings path when none was stored", async () => {
    await pointReturnUrlAtSession({
      id: "300",
      workspaceId: "100",
      returnUrl: null,
    } as never)

    expect(mocks.updateReturnUrl).toHaveBeenCalledWith({
      id: "300",
      returnUrl: `${SETTINGS_PATH}?session=300`,
    })
  })

  test("is a no-op without a session", async () => {
    await pointReturnUrlAtSession(null)

    expect(mocks.updateReturnUrl).not.toHaveBeenCalled()
  })
})
