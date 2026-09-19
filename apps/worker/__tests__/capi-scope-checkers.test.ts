import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  debugTokenOrThrow: vi.fn(),
  resolveForOwner: vi.fn(),
  findWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  WHATSAPP_CAPI_SCOPE: "whatsapp_business_manage_events",
  instagramIntegrationService: {},
  integrationWhatsappService: {},
  messengerIntegrationService: {},
  metaConversionsService: {
    // Runs the checker straight away so the test observes its verdict.
    refreshCapiScopeCache: async ({
      integration,
      checkScope,
    }: {
      integration: { wabaId: string }
      checkScope: (input: {
        accessToken: string
        resourceId: string
      }) => Promise<boolean>
    }) => ({
      ...integration,
      hasCapiScope: await checkScope({
        accessToken: "waba-token",
        resourceId: integration.wabaId,
      }),
    }),
  },
  platformCredentialService: { resolveForOwner: mocks.resolveForOwner },
  workspaceService: { findById: mocks.findWorkspace },
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({}))
vi.mock("@chatbotx.io/integration-messenger", () => ({}))
vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  debugTokenOrThrow: mocks.debugTokenOrThrow,
}))

const { refreshScopeCache } = await import(
  "../src/integration/handlers/meta-conversions/capi-scope-checkers"
)

const integration = {
  id: "wa-1",
  workspaceId: "ws-1",
  wabaId: "1606681630903299",
  hasCapiScope: false,
} as unknown as Parameters<typeof refreshScopeCache<"whatsapp">>[1]

describe("refreshScopeCache — whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWorkspace.mockResolvedValue({ ownerId: "owner-1" })
    mocks.resolveForOwner.mockResolvedValue({
      config: { clientId: "app-id", clientSecret: "app-secret" },
    })
  })

  test("keeps CAPI enabled when manage_events is granted on the WABA's Business Presence account", async () => {
    mocks.debugTokenOrThrow.mockResolvedValueOnce({
      granular_scopes: [
        {
          scope: "whatsapp_business_management",
          target_ids: ["1606681630903299"],
        },
        {
          scope: "whatsapp_business_manage_events",
          target_ids: ["1053913244099763"],
        },
      ],
    })

    const refreshed = await refreshScopeCache("whatsapp", integration)

    expect(refreshed.hasCapiScope).toBe(true)
    expect(mocks.debugTokenOrThrow).toHaveBeenCalledWith(
      "waba-token",
      "app-id|app-secret",
    )
  })

  test("disables CAPI when the token has no manage_events grant", async () => {
    mocks.debugTokenOrThrow.mockResolvedValueOnce({
      granular_scopes: [
        {
          scope: "whatsapp_business_management",
          target_ids: ["1606681630903299"],
        },
      ],
    })

    const refreshed = await refreshScopeCache("whatsapp", integration)

    expect(refreshed.hasCapiScope).toBe(false)
  })
})
