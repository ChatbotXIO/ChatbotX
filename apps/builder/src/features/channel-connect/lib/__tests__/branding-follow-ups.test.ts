// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock logger to suppress output and assert on the failure-path log
// ---------------------------------------------------------------------------
const loggerWarn = vi.fn()
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: loggerWarn, info: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/business: `buildContext` (used by the un-mocked
// `runBrandingFollowUps` this file exercises for real), plus the
// workspace/tenant-settings lookups `seedReconnectBranding` itself owns.
// ---------------------------------------------------------------------------
const buildContext = vi.fn()
const findWorkspaceById = vi.fn()
const resolveTenantSettingsMock = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  buildContext,
  workspaceService: { findById: findWorkspaceById },
  resolveTenantSettings: resolveTenantSettingsMock,
}))

const getBrandingUrl = vi.fn(
  (channel: string, appUrl: string) => `${appUrl}/branding/${channel}`,
)
vi.mock("@/features/integration-webchat/lib", () => ({
  getBrandingUrl,
  BRANDING_TITLE: "Built with ChatbotX",
}))

const updateWorkspaceLogo = vi.fn()
vi.mock("@/features/workspaces/actions/upload-logo", () => ({
  updateWorkspaceLogo,
}))

// ---------------------------------------------------------------------------
// Dynamic import is required here (not a static-import violation): vi.mock()
// factories above are hoisted above static imports, so the module under test
// must be loaded with `await import()` after they register, or it would pick
// up the real, unmocked dependencies.
// ---------------------------------------------------------------------------
const { seedReconnectBranding } = await import("../branding-follow-ups")

const WORKSPACE_ID = "ws-1"
const INTEGRATION_ID = "int-1"
const WORKSPACE = { id: WORKSPACE_ID, name: "Acme" }
const MOCK_CTX = { __ctx: true }

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    integrationId: INTEGRATION_ID,
    channel: "messenger" as const,
    integrationRow: {
      id: INTEGRATION_ID,
      auth: { authType: "none" as const },
    },
    integration: { runChannelHandler: vi.fn(async () => undefined) },
    integrationType: "messenger",
    logLabel: "Messenger",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findWorkspaceById.mockResolvedValue(WORKSPACE)
  resolveTenantSettingsMock.mockResolvedValue({ appUrl: "https://app.example" })
  buildContext.mockResolvedValue(MOCK_CTX)
  updateWorkspaceLogo.mockResolvedValue(undefined)
})

describe("seedReconnectBranding", () => {
  test("resolves the workspace/appUrl, pushes branding, and returns appUrl", async () => {
    const integration = { runChannelHandler: vi.fn(async () => undefined) }
    const result = await seedReconnectBranding(
      baseInput({ integration, channel: "instagram" }),
    )

    expect(result).toEqual({ appUrl: "https://app.example" })
    expect(findWorkspaceById).toHaveBeenCalledWith({ id: WORKSPACE_ID })
    expect(resolveTenantSettingsMock).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
    })
    expect(getBrandingUrl).toHaveBeenCalledWith(
      "instagram",
      "https://app.example",
    )
    expect(buildContext).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      integrationType: "messenger",
      integration: { id: INTEGRATION_ID, auth: { authType: "none" } },
    })
    expect(integration.runChannelHandler).toHaveBeenCalledWith(
      "bot",
      "addBranding",
      {
        ctx: MOCK_CTX,
        title: "Built with ChatbotX",
        url: "https://app.example/branding/instagram",
      },
    )
    expect(updateWorkspaceLogo).toHaveBeenCalledWith({
      id: WORKSPACE_ID,
      integration,
      ctx: MOCK_CTX,
    })
  })

  test("forwards persistBrandingMenu through to the branding push", async () => {
    const persistBrandingMenu = vi.fn(async () => undefined)

    await seedReconnectBranding(baseInput({ persistBrandingMenu }))

    expect(persistBrandingMenu).toHaveBeenCalledWith({
      label: "Built with ChatbotX",
      type: "url",
      url: "https://app.example/branding/messenger",
    })
  })

  test("regression: a branding push failure is logged and swallowed, never failing the reconnect", async () => {
    const pushError = new Error("Graph API down")
    const integration = {
      runChannelHandler: vi.fn(() => {
        throw pushError
      }),
    }

    const result = await seedReconnectBranding(
      baseInput({ integration, logLabel: "Instagram (via Facebook)" }),
    )

    expect(result).toEqual({ appUrl: "https://app.example" })
    expect(loggerWarn).toHaveBeenCalledWith(
      {
        err: pushError,
        workspaceId: WORKSPACE_ID,
        integrationId: INTEGRATION_ID,
      },
      "Instagram (via Facebook) branding follow-up failed during reconnect",
    )
  })
})
