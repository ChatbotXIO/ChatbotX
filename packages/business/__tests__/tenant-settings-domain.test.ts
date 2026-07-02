import { beforeEach, describe, expect, test, vi } from "vitest"

const BUILDER_URL = "https://app.chatbotx.io"
const CUSTOM_DOMAIN = "chat.customer.com"
const ENV_STORAGE_URL = "https://files.chatbotx.io/assets"
const TENANT_STORAGE_URL = "https://cdn.customer.com/public"

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_BUILDER_URL: "https://app.chatbotx.io",
    NEXT_PUBLIC_STORAGE_URL: undefined as string | undefined,
    REALTIME_BROADCAST_SECRET: "secret",
  },
  findActiveByDomain: vi.fn(),
  findTenantById: vi.fn(),
  hasEnterpriseFeatures: vi.fn(),
  listByTenant: vi.fn(),
}))

vi.mock("../src/integration-context/keys", () => ({
  integrationContextEnv: () => mocks.env,
}))

vi.mock("../src/enterprise/custom-domain/service", () => ({
  customDomainService: { findActiveByDomain: mocks.findActiveByDomain },
}))

vi.mock("../src/enterprise/tenant/service", () => ({
  tenantService: { findById: mocks.findTenantById },
}))

vi.mock("../src/enterprise/tenant-help-item/service", () => ({
  tenantHelpItemService: { listByTenant: mocks.listByTenant },
}))

vi.mock("../src/user/entitlements", () => ({
  hasEnterpriseFeatures: mocks.hasEnterpriseFeatures,
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { findById: vi.fn() },
}))

const { resolveTenantSettingsByDomain } = await import(
  "../src/platform/settings"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.NEXT_PUBLIC_STORAGE_URL = undefined
  mocks.listByTenant.mockResolvedValue([])
})

describe("resolveTenantSettingsByDomain", () => {
  test("anchors appUrl and wsUrl to the custom domain for an active white-label tenant", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(true)
    mocks.findActiveByDomain.mockResolvedValue({
      domain: CUSTOM_DOMAIN,
      tenantId: "tenant-1",
    })
    mocks.findTenantById.mockResolvedValue({
      id: "tenant-1",
      status: "active",
    })

    const settings = await resolveTenantSettingsByDomain(CUSTOM_DOMAIN)

    expect(settings.appUrl).toBe(`https://${CUSTOM_DOMAIN}`)
    expect(settings.wsUrl).toBe(`https://${CUSTOM_DOMAIN}/ws/`)
    expect(settings.storageUrl).toBe(`https://${CUSTOM_DOMAIN}/storage/`)
    expect(settings.faviconUrl).toBe(
      `https://${CUSTOM_DOMAIN}/brand/icon_black.svg`,
    )
  })

  test("resolves relative tenant asset paths from the custom domain storage URL", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(true)
    mocks.findActiveByDomain.mockResolvedValue({
      domain: CUSTOM_DOMAIN,
      tenantId: "tenant-1",
    })
    mocks.findTenantById.mockResolvedValue({
      faviconPath: "brand/favicon.ico",
      id: "tenant-1",
      logoDarkPath: "brand/logo-dark.svg",
      logoLightPath: "brand/logo-light.svg",
      status: "active",
    })

    const settings = await resolveTenantSettingsByDomain(CUSTOM_DOMAIN)

    expect(settings.logoLightUrl).toBe(
      `https://${CUSTOM_DOMAIN}/storage/brand/logo-light.svg`,
    )
    expect(settings.logoDarkUrl).toBe(
      `https://${CUSTOM_DOMAIN}/storage/brand/logo-dark.svg`,
    )
    expect(settings.faviconUrl).toBe(
      `https://${CUSTOM_DOMAIN}/storage/brand/favicon.ico`,
    )
  })

  test("preserves explicit env storage URL on a custom domain", async () => {
    mocks.env.NEXT_PUBLIC_STORAGE_URL = ENV_STORAGE_URL
    mocks.hasEnterpriseFeatures.mockResolvedValue(true)
    mocks.findActiveByDomain.mockResolvedValue({
      domain: CUSTOM_DOMAIN,
      tenantId: "tenant-1",
    })
    mocks.findTenantById.mockResolvedValue({
      id: "tenant-1",
      logoLightPath: "brand/logo-light.svg",
      status: "active",
    })

    const settings = await resolveTenantSettingsByDomain(CUSTOM_DOMAIN)

    expect(settings.storageUrl).toBe(`${ENV_STORAGE_URL}/`)
    expect(settings.logoLightUrl).toBe(
      `${ENV_STORAGE_URL}/brand/logo-light.svg`,
    )
  })

  test("preserves explicit tenant storage URL on a custom domain", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(true)
    mocks.findActiveByDomain.mockResolvedValue({
      domain: CUSTOM_DOMAIN,
      tenantId: "tenant-1",
    })
    mocks.findTenantById.mockResolvedValue({
      id: "tenant-1",
      logoLightPath: "brand/logo-light.svg",
      status: "active",
      storageUrl: TENANT_STORAGE_URL,
    })

    const settings = await resolveTenantSettingsByDomain(CUSTOM_DOMAIN)

    expect(settings.storageUrl).toBe(`${TENANT_STORAGE_URL}/`)
    expect(settings.logoLightUrl).toBe(
      `${TENANT_STORAGE_URL}/brand/logo-light.svg`,
    )
  })

  test("falls back to the builder URL when no active custom domain matches", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(true)
    mocks.findActiveByDomain.mockResolvedValue(null)

    const settings = await resolveTenantSettingsByDomain(CUSTOM_DOMAIN)

    expect(settings.appUrl).toBe(BUILDER_URL)
  })

  test("falls back to the builder URL on the community edition", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(false)

    const settings = await resolveTenantSettingsByDomain(CUSTOM_DOMAIN)

    expect(settings.appUrl).toBe(BUILDER_URL)
    expect(mocks.findActiveByDomain).not.toHaveBeenCalled()
  })
})
