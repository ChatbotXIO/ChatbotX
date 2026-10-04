// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

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
  integrationWebchatService: {},
  resolveTenantSettings: vi.fn(),
  integrationSmtpService: {},
  messengerIntegrationService: { updateTagSync: vi.fn() },
  zaloIntegrationService: { updateTagSync: vi.fn() },
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
})
