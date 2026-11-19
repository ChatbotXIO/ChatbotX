import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  debugTokenOrThrow: vi.fn(),
  resolveCredentialOwnerIdForWorkspace: vi.fn(),
  resolveForInbox: vi.fn(),
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
  platformCredentialService: { resolveForInbox: mocks.resolveForInbox },
  resolveCredentialOwnerIdForWorkspace:
    mocks.resolveCredentialOwnerIdForWorkspace,
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
  inboxId: "inbox-1",
  auth: { clientId: "app-id" },
  hasCapiScope: false,
} as unknown as Parameters<typeof refreshScopeCache<"whatsapp">>[1]

describe("refreshScopeCache — whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWorkspace.mockResolvedValue({ ownerId: "owner-1" })
    mocks.resolveCredentialOwnerIdForWorkspace.mockResolvedValue("reseller-1")
    mocks.resolveForInbox.mockResolvedValue({
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
    expect(mocks.resolveForInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      integrationAuth: { clientId: "app-id" },
      type: "whatsapp",
    })
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
