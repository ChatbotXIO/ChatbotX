import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  findAllForTokenRefresh: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findDecryptedCredential: vi.fn(),
  logProviderError: vi.fn(),
  markTokenRefreshError: vi.fn(),
  refreshAuth: vi.fn(),
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<void> }) => await fn(),
  ),
  updateAuth: vi.fn(),
  upsertCredential: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    findAllForTokenRefresh: mocks.findAllForTokenRefresh,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    markTokenRefreshError: mocks.markTokenRefreshError,
    updateAuth: mocks.updateAuth,
  },
  whatsappBusinessAccountService: {
    findDecryptedCredential: mocks.findDecryptedCredential,
    upsertCredential: mocks.upsertCredential,
  },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: mocks.logProviderError,
}))
vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  integration: { refreshAuth: mocks.refreshAuth },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: <T>(
    _params: unknown,
    fn: () => Promise<T>,
  ): Promise<T> => fn(),
}))

const { refreshWhatsappTokens } = await import(
  "../src/schedule/handlers/refresh-whatsapp-tokens"
)

const makeAuth = (token: string, isManual = false) => ({
  authType: "oauth2" as const,
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUrl: "https://example.com/callback",
  metadata: { isManual, wabaId: "waba-1" },
  tokens: { accessToken: token },
})

const makeIntegration = (id: string, wabaId = "waba-1") => ({
  id,
  workspaceId: "workspace-1",
  wabaId,
  auth: makeAuth(`row-${id}`),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findAllForTokenRefresh.mockResolvedValue([])
  mocks.findByIdForWorkspace.mockImplementation(async ({ id }) =>
    makeIntegration(id, id === "phone-2" ? "waba-2" : "waba-1"),
  )
  mocks.findDecryptedCredential.mockResolvedValue({
    businessId: "business-1",
    grantedScopes: ["whatsapp_business_manage_events"],
    revision: 4,
    scopeCheckedAt: new Date("2026-09-08T00:00:00.000Z"),
    decryptedCredential: { accessToken: "waba-token", apiVersion: "v22.0" },
  })
  mocks.refreshAuth.mockImplementation(async ({ auth }) => ({
    ...auth,
    tokens: {
      ...auth.tokens,
      accessToken: `refreshed-${auth.tokens.accessToken}`,
    },
  }))
  mocks.upsertCredential.mockResolvedValue({ revision: 5 })
})

describe("refreshWhatsappTokens", () => {
  test("refreshes every phone row and one WABA credential for shared WABA rows", async () => {
    mocks.findAllForTokenRefresh.mockResolvedValue([
      makeIntegration("phone-1"),
      makeIntegration("phone-2"),
    ])

    await refreshWhatsappTokens()

    expect(mocks.updateAuth).toHaveBeenCalledTimes(2)
    expect(mocks.upsertCredential).toHaveBeenCalledTimes(1)
    expect(mocks.upsertCredential).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      wabaId: "waba-1",
      businessId: "business-1",
      credential: {
        accessToken: "refreshed-waba-token",
        apiVersion: "v22.0",
      },
      grantedScopes: ["whatsapp_business_manage_events"],
      scopeCheckedAt: new Date("2026-09-08T00:00:00.000Z"),
      expectedRevision: 4,
    })
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "auth:refresh:whatsapp:waba:workspace-1:waba-1",
      }),
    )
  })

  test("keeps refreshing phone rows without creating a missing WABA record", async () => {
    mocks.findAllForTokenRefresh.mockResolvedValue([makeIntegration("phone-1")])
    mocks.findDecryptedCredential.mockResolvedValue(null)

    await refreshWhatsappTokens()

    expect(mocks.updateAuth).toHaveBeenCalledTimes(1)
    expect(mocks.refreshAuth).toHaveBeenCalledTimes(1)
    expect(mocks.upsertCredential).not.toHaveBeenCalled()
  })

  test("continues refreshing other WABAs after one WABA refresh fails", async () => {
    mocks.findAllForTokenRefresh.mockResolvedValue([
      makeIntegration("phone-1", "waba-1"),
      makeIntegration("phone-2", "waba-2"),
    ])
    mocks.findDecryptedCredential.mockImplementation(async ({ wabaId }) => ({
      businessId: `business-${wabaId}`,
      grantedScopes: [],
      revision: 4,
      scopeCheckedAt: new Date("2026-09-08T00:00:00.000Z"),
      decryptedCredential: {
        accessToken: wabaId === "waba-1" ? "fail-token" : "good-token",
        apiVersion: "v22.0",
      },
    }))
    mocks.refreshAuth.mockImplementation(({ auth }) => {
      if (auth.tokens.accessToken === "fail-token") {
        throw new Error("Meta unavailable")
      }
      return {
        ...auth,
        tokens: {
          ...auth.tokens,
          accessToken: `refreshed-${auth.tokens.accessToken}`,
        },
      }
    })

    await refreshWhatsappTokens()

    expect(mocks.upsertCredential).toHaveBeenCalledTimes(1)
    expect(mocks.upsertCredential).toHaveBeenCalledWith(
      expect.objectContaining({ wabaId: "waba-2" }),
    )
    expect(mocks.logProviderError).toHaveBeenCalledTimes(1)
  })

  test("treats a stale WABA credential revision as a no-op", async () => {
    mocks.findAllForTokenRefresh.mockResolvedValue([makeIntegration("phone-1")])
    mocks.upsertCredential.mockResolvedValue(null)

    await refreshWhatsappTokens()

    expect(mocks.upsertCredential).toHaveBeenCalledTimes(1)
    expect(mocks.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: "auto-refreshed the WhatsApp channel token",
      }),
    )
    expect(mocks.auditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({
        detail: "auto-refreshed the WhatsApp Business Account credential",
      }),
    )
  })
})
