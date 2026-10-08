// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listProvidersWithStatus: vi.fn(async () => []),
}))

// `resolve-provider.ts` also imports `connectionStateService`/
// `platformCredentialService` for its OTHER exports (`resolveOneProvider` /
// `resolveAlreadyConnectedProviders`, neither exercised here) — but merely
// importing the real `@chatbotx.io/business` barrel reaches `better-auth`'s
// init (via `enterprise/custom-domain/service.ts`), which opens a real DB
// pool. Mocked at the boundary so this narrow `toConnectionResource` test
// doesn't need a live database.
vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    list: vi.fn(),
    listProvidersWithStatus: mocks.listProvidersWithStatus,
  },
  platformCredentialService: { resolveForOwner: vi.fn() },
  // `packages/auth/src/server.ts`'s `trustedOrigins` (reached once
  // `better-auth` initializes, somewhere deep in this test's real,
  // unmocked `@/lib/workspace/resolve-visible-channels` import) also
  // pulls this from the same barrel.
  customDomainService: { listActiveDomains: vi.fn(async () => []) },
}))

vi.mock("@chatbotx.io/connections", () => ({
  CONNECTION_REGISTRY: {
    messenger: {
      provider: {
        strategy: "oauth_redirect",
        multiAccount: true,
        verify: vi.fn(),
      },
      integration: { refreshAuth: vi.fn() },
    },
    webchat: {
      provider: {
        kind: "channel",
        strategy: "self_serve",
        multiAccount: false,
        configFields: [],
      },
    },
    api: {
      provider: {
        kind: "channel",
        strategy: "self_serve",
        multiAccount: false,
        configFields: [],
      },
    },
    smtp: {
      provider: {
        kind: "channel",
        strategy: "self_serve",
        multiAccount: false,
        configFields: [],
      },
    },
  },
  isCredentialStrategy: (strategy: string) =>
    strategy === "token" || strategy === "api_key" || strategy === "self_serve",
  selfServeConnectorFor: (provider: string) =>
    provider === "webchat" || provider === "api"
      ? { multiInstance: true }
      : undefined,
  toChannelType: (provider: string) => provider,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => {
    const translate = (key: string) => key
    translate.has = () => false
    return translate
  }),
}))

vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: vi.fn(async () => null),
}))

// This module must load after every vi.mock registration above; static import
// evaluation would resolve its registry and policy dependencies first.

const { listConnectionProviderResources, toConnectionResource } = await import(
  "../src/features/connections/lib/resolve-provider"
)

describe("toConnectionResource", () => {
  test("never emits an auth-like key even when the row carries one (T5)", () => {
    const row = {
      id: "conn-1",
      workspaceId: "ws-1",
      kind: "channel",
      provider: "messenger",
      channel: "messenger",
      status: "connected",
      statusReason: null,
      sourceId: "page-1",
      displayName: "My Page",
      inboxId: "inbox-1",
      integrationId: null,
      authExpiresAt: null,
      lastError: null,
      connectedAt: new Date("2026-01-01T00:00:00.000Z"),
      disconnectedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: null,
      // Simulates a future column addition or a caller that forwards the
      // full row without stripping the credential first — the DTO
      // projection must still exclude it, not rely on the caller.
      auth: { accessToken: "secret-token" },
      encryptedAuth: { iv: "iv", content: "encrypted", tag: "tag" },
    } as any

    const resource = toConnectionResource(row)

    expect(resource).not.toHaveProperty("auth")
    expect(resource).not.toHaveProperty("encryptedAuth")
    expect(JSON.stringify(resource)).not.toContain("secret-token")
  })

  test("resolves capabilities from the registry adapter", () => {
    const row = {
      id: "conn-1",
      kind: "channel",
      provider: "messenger",
      channel: "messenger",
      status: "connected",
      statusReason: null,
      sourceId: "page-1",
      displayName: "My Page",
      inboxId: "inbox-1",
      integrationId: null,
      authExpiresAt: null,
      lastError: null,
      connectedAt: null,
      disconnectedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as any

    const resource = toConnectionResource(row)

    expect(resource.strategy).toBe("oauth_redirect")
    expect(resource.capabilities).toEqual({
      refreshable: true,
      verifiable: true,
      multiAccount: true,
    })
  })
})

describe("listConnectionProviderResources", () => {
  test("keeps self-serve webchat and API available for another channel while SMTP stays unavailable", async () => {
    mocks.listProvidersWithStatus.mockResolvedValue([
      "webchat",
      "api",
      "smtp",
    ] as never)

    const resources = await listConnectionProviderResources({
      workspaceId: "workspace-1",
      kind: "channel",
    })
    const byProvider = new Map(
      resources.map((resource) => [resource.provider, resource]),
    )

    expect(byProvider.get("webchat")).toMatchObject({
      available: true,
      unavailableReason: null,
    })
    expect(byProvider.get("api")).toMatchObject({
      available: true,
      unavailableReason: null,
    })
    expect(byProvider.get("smtp")).toMatchObject({
      available: false,
      unavailableReason: "notImplemented",
    })
  })
})
