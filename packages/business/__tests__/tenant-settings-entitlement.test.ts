import { beforeEach, describe, expect, test, vi } from "vitest"

const BUILDER_URL = "https://app.chatbotx.io"

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_BUILDER_URL: "https://app.chatbotx.io",
    NEXT_PUBLIC_STORAGE_URL: undefined as string | undefined,
    FORCE_PUBLIC_HTTPS: false,
    REALTIME_BROADCAST_SECRET: "secret",
  },
  findActiveByDomain: vi.fn(),
  findByTenantId: vi.fn(),
  findTenantById: vi.fn(),
  findWorkspaceById: vi.fn(),
  hasEnterpriseFeatures: vi.fn(),
  listByTenant: vi.fn(),
}))

vi.mock("../src/integration-context/keys", () => ({
  integrationContextEnv: () => mocks.env,
}))

vi.mock("../src/enterprise/custom-domain/service", () => ({
  customDomainService: {
    findActiveByDomain: mocks.findActiveByDomain,
    findByTenantId: mocks.findByTenantId,
  },
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
  workspaceService: { findById: mocks.findWorkspaceById },
}))

const { resolveTenantSettings } = await import("../src/platform/settings")

const brandedTenant = {
  id: "tenant-1",
  status: "active",
  brandName: "Reseller Inc",
  logoLightPath: "brand/logo-light.svg",
  logoDarkPath: "brand/logo-dark.svg",
  faviconPath: "brand/favicon.ico",
  theme: "slate",
  customJs: "console.log('x')",
  customCss: "body{}",
  storageUrl: "https://cdn.customer.com/public",
  signupEmailTemplate: { subject: "Hi", body: "<b>welcome</b>" },
  forgotPasswordEmailTemplate: { body: "reset" },
  magicLinkEmailTemplate: { body: "magic" },
  accountCredentialsEmailTemplate: { body: "creds" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.NEXT_PUBLIC_BUILDER_URL = BUILDER_URL
  mocks.env.NEXT_PUBLIC_STORAGE_URL = undefined
  mocks.env.FORCE_PUBLIC_HTTPS = false
  mocks.listByTenant.mockResolvedValue([])
  mocks.findWorkspaceById.mockResolvedValue({
    id: "workspace-1",
    tenantId: "tenant-1",
  })
  mocks.findTenantById.mockResolvedValue(brandedTenant)
})

describe("resolveTenantSettings — enterprise entitlement gating", () => {
  test("without a valid license, branding and templates fall back to defaults", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(false)

    const settings = await resolveTenantSettings({ workspaceId: "workspace-1" })

    expect(settings.name).toBe("ChatbotX")
    expect(settings.logoLightUrl).toBe(`${BUILDER_URL}/brand/logo_white.svg`)
    expect(settings.logoDarkUrl).toBe(`${BUILDER_URL}/brand/logo_black.svg`)
    expect(settings.faviconUrl).toBe(`${BUILDER_URL}/brand/icon_black.svg`)
    expect(settings.theme).toBeNull()
    expect(settings.customJS).toBeNull()
    expect(settings.customCSS).toBeNull()
    expect(settings.signupEmailTemplate).toBeNull()
    expect(settings.forgotPasswordEmailTemplate).toBeNull()
    expect(settings.magicLinkEmailTemplate).toBeNull()
    expect(settings.accountCredentialsEmailTemplate).toBeNull()
  })

  test("without a valid license, non-gated fields still apply", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(false)

    const settings = await resolveTenantSettings({ workspaceId: "workspace-1" })

    expect(settings.storageUrl).toBe("https://cdn.customer.com/public/")
  })

  test("with a valid license, tenant branding and templates apply", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(true)

    const settings = await resolveTenantSettings({ workspaceId: "workspace-1" })

    expect(settings.name).toBe("Reseller Inc")
    expect(settings.logoLightUrl).toBe(
      "https://cdn.customer.com/public/brand/logo-light.svg",
    )
    expect(settings.faviconUrl).toBe(
      "https://cdn.customer.com/public/brand/favicon.ico",
    )
    expect(settings.theme).toBe("slate")
    expect(settings.customJS).toBe("console.log('x')")
    expect(settings.signupEmailTemplate).toEqual({
      subject: "Hi",
      body: "<b>welcome</b>",
    })
    expect(settings.accountCredentialsEmailTemplate).toEqual({ body: "creds" })
  })
})
