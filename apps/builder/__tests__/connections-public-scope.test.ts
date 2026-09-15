// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

// Importing the real public routers transitively pulls in
// `@chatbotx.io/database/client` (opens a real `pg.Pool`), the full
// `@chatbotx.io/business` barrel (queues, redis cache invalidation, audit
// dispatch), and `@/orpc`'s `authorizedAPI` chain (boots the full better-auth
// stack via `@/middlewares/auth`). None of that is reachable from this test —
// it only inspects which scope each submodule registered its procedures
// under — so all of it is stubbed to keep the import side-effect-free.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: { listPersonasByWorkspaceId: vi.fn() },
  connectionRepository: { findByProviderSourceId: vi.fn() },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: {
    disconnect: vi.fn(),
    connectFromCredentials: vi.fn(),
    startSession: vi.fn(),
    reconnect: vi.fn(),
    connectTargets: vi.fn(),
  },
  CONNECTION_REGISTRY: {},
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  selectRegisteredPersonas: vi.fn(() => []),
}))

vi.mock("@chatbotx.io/business", () => ({
  userPersistentMenuService: {},
  integrationWebchatService: {},
  resolveTenantSettings: vi.fn(),
  integrationSmtpService: {},
  messengerIntegrationService: { updateTagSync: vi.fn() },
  zaloIntegrationService: { updateTagSync: vi.fn() },
  integrationService: {},
  webhookService: {},
  externalWebhookService: {},
  integrationClaudeService: {},
  integrationDeepSeekService: {},
  integrationGeminiService: {},
  integrationOpenAIService: {},
  connectionStateService: {},
  platformCredentialService: { resolveForOwner: vi.fn() },
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByIdForWorkspace: vi.fn(),
    requireByIdForWorkspace: vi.fn(),
    submitInput: vi.fn(),
    cancel: vi.fn(),
  },
}))

vi.mock("@/features/connections/lib/resolve-connect-credential", () => ({
  resolveOAuthCredential: vi.fn(),
}))

vi.mock("@/features/connections/lib/connect-session-resource", () => ({
  toConnectSessionResource: vi.fn(),
}))

vi.mock("@/lib/oauth-referer", () => ({
  sanitizeOptionalReturnUrl: vi.fn(),
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(),
  resolvePlatformOwnerId: vi.fn(),
}))

vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: vi.fn(),
}))

vi.mock("@/features/connections/lib/resolve-provider", () => ({
  toConnectionResource: vi.fn(),
  listConnectionProviderResources: vi.fn(),
  channelForProvider: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => {
  class MockChatbotXException extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  }
  return {
    ChatbotXException: MockChatbotXException,
    notFoundException: vi.fn(),
    validationException: vi.fn(),
    channelHiddenException: vi.fn(),
    connectionNotConfiguredException: vi.fn(),
    connectSessionExpiredException: vi.fn(),
  }
})

vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: {
    enum: {
      claude: "claude",
      deepseek: "deepseek",
      gemini: "gemini",
      openai: "openai",
    },
  },
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiIntegrationService: {},
}))

vi.mock("@chatbotx.io/business/integration-ai-provider/verify", () => ({
  verifyAiProviderApiKey: vi.fn(),
}))

const workspaceTokenAuthAPIForScope = vi.hoisted(() =>
  vi.fn((_scope: string) => {
    const chain = {
      route: vi.fn(() => chain),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn(() => ({})),
    }
    return chain
  }),
)

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

// Each submodule calls `workspaceTokenAuthAPIForScope` exactly once at import
// time — `packages/utils`' Snowflake ID generator is a process-wide singleton
// that throws on re-init, so every submodule is imported exactly once here
// (no `vi.resetModules()` between them) and the full accumulated call list is
// asserted at the end, per submodule slice.
await import("@/features/user-persistent-menus/api/public")
const userPersistentMenusCallCount =
  workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integration-webchat/api/public")
const webchatsCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integration-smtp/api/public")
const smtpCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/personas/api/public")
const personasCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integration-messenger/api/public")
const messengerCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integration-zalo/api/public")
const zaloCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integrations/api/public/crud")
const crudCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integrations/api/public/ai")
const aiCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/webhooks/api/public")
const webhooksCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/external-webhooks/api/public")
const externalWebhooksCallCount =
  workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/connections/api/public")
const connectionsCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

const allScopeCalls = workspaceTokenAuthAPIForScope.mock.calls.map(
  (call) => call[0],
)

describe("connections public router scope wiring", () => {
  test("user-persistent-menus/api/public.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(0, userPersistentMenusCallCount)).toEqual([
      "connections",
    ])
  })

  test("integration-webchat/api/public.ts registers under the 'connections' scope", () => {
    expect(
      allScopeCalls.slice(userPersistentMenusCallCount, webchatsCallCount),
    ).toEqual(["connections"])
  })

  test("integration-smtp/api/public.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(webchatsCallCount, smtpCallCount)).toEqual([
      "connections",
    ])
  })

  test("personas/api/public.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(smtpCallCount, personasCallCount)).toEqual([
      "connections",
    ])
  })

  test("integration-messenger/api/public.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(personasCallCount, messengerCallCount)).toEqual([
      "connections",
    ])
  })

  test("integration-zalo/api/public.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(messengerCallCount, zaloCallCount)).toEqual([
      "connections",
    ])
  })

  test("integrations/api/public/crud.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(zaloCallCount, crudCallCount)).toEqual([
      "connections",
    ])
  })

  test("integrations/api/public/ai.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(crudCallCount, aiCallCount)).toEqual([
      "connections",
    ])
  })

  test("webhooks/api/public.ts registers under the 'connections' scope", () => {
    expect(allScopeCalls.slice(aiCallCount, webhooksCallCount)).toEqual([
      "connections",
    ])
  })

  test("external-webhooks/api/public.ts registers under the 'connections' scope", () => {
    expect(
      allScopeCalls.slice(webhooksCallCount, externalWebhooksCallCount),
    ).toEqual(["connections"])
  })

  test("connections/api/public.ts registers under the 'connections' scope", () => {
    expect(
      allScopeCalls.slice(externalWebhooksCallCount, connectionsCallCount),
    ).toEqual(["connections"])
  })
})
