// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

// Same rationale as integrations-public-scope.test.ts: importing the real
// public routers transitively pulls in `@chatbotx.io/database/client` (opens
// a real `pg.Pool`) and the full `@chatbotx.io/business` barrel (queues,
// redis cache invalidation, audit dispatch). None of that is reachable from
// this test — it only inspects which scope each submodule registered its
// procedures under — so all of it is stubbed to keep the import
// side-effect-free.
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: { listPersonasByWorkspaceId: vi.fn() },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  selectRegisteredPersonas: vi.fn(() => []),
}))

vi.mock("@chatbotx.io/business", () => ({
  userPersistentMenuService: {},
  resolveTenantSettings: vi.fn(),
  integrationSmtpService: {},
  messengerIntegrationService: { updateTagSync: vi.fn() },
  zaloIntegrationService: { updateTagSync: vi.fn() },
  integrationWebchatService: {},
  tiktokIntegrationService: {
    setCommentToMessage: vi.fn(),
    refreshCommentToMessage: vi.fn(),
  },
}))

// The settings writers reach Facebook/Instagram; only the scope wiring is
// under test here.
vi.mock(
  "@/features/integration-messenger/lib/update-messenger-settings",
  () => ({
    updateMessenger: vi.fn(),
  }),
)
vi.mock(
  "@/features/integration-instagram/lib/update-instagram-settings",
  () => ({
    updateInstagram: vi.fn(),
  }),
)

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

await import("@/features/integration-instagram/api/public")
const instagramCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integration-tiktok/api/public")
const tiktokCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/bot-simulator/api/public")
const botSimulatorCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

const allScopeCalls = workspaceTokenAuthAPIForScope.mock.calls.map(
  (call) => call[0],
)

describe("channels public router scope wiring", () => {
  test("user-persistent-menus/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(0, userPersistentMenusCallCount)).toEqual([
      "channels",
    ])
  })

  test("integration-webchat/api/public.ts registers under the 'channels' scope", () => {
    expect(
      allScopeCalls.slice(userPersistentMenusCallCount, webchatsCallCount),
    ).toEqual(["channels"])
  })

  test("integration-smtp/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(webchatsCallCount, smtpCallCount)).toEqual([
      "channels",
    ])
  })

  test("personas/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(smtpCallCount, personasCallCount)).toEqual([
      "channels",
    ])
  })

  test("integration-messenger/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(personasCallCount, messengerCallCount)).toEqual([
      "channels",
    ])
  })

  test("integration-zalo/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(messengerCallCount, zaloCallCount)).toEqual([
      "channels",
    ])
  })

  test("integration-instagram/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(zaloCallCount, instagramCallCount)).toEqual([
      "channels",
    ])
  })

  test("integration-tiktok/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(instagramCallCount, tiktokCallCount)).toEqual([
      "channels",
    ])
  })

  test("bot-simulator/api/public.ts registers under the 'channels' scope", () => {
    expect(allScopeCalls.slice(tiktokCallCount, botSimulatorCallCount)).toEqual(
      ["channels"],
    )
  })
})
