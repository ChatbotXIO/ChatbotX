import { describe, expect, test, vi } from "vitest"
import {
  AuthRefreshException,
  AuthType,
  type Context,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "../src"

const baseAuth = (expiresAt: string): Oauth2AuthValue => ({
  authType: AuthType.oauth2,
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://example.com/callback",
  tokens: { accessToken: "token-1", expiresAt },
})

type RefreshAuthFn = (props: {
  auth: Oauth2AuthValue
}) => Promise<Oauth2AuthValue>

const makeIntegration = (refreshAuth: RefreshAuthFn) =>
  new Integration<
    IntegrationDefinition<Record<string, never>, Oauth2AuthValue>
  >({
    name: "fixture",
    actions: {},
    handleRequest: async () => "ok",
    disconnect: async () => undefined,
    refreshAuth,
  })

const makeContext = (auth: Oauth2AuthValue) => {
  const save = vi.fn(async () => undefined)
  const markOffline = vi.fn(async () => undefined)
  const ctx: Context<Oauth2AuthValue> = {
    storagePrefix: "test",
    auth,
    authStore: { load: async () => auth, save, markOffline },
    platform: {
      appUrl: "https://app.test",
      wsUrl: "wss://app.test",
      storageUrl: "https://storage.test",
      getRealtimeAuthHeaders: async () => ({}),
    },
  }
  return { ctx, save, markOffline }
}

describe("Integration.ensureFreshAuth", () => {
  test("no-ops when the token is far from expiry and force is not set", async () => {
    const refreshAuth = vi.fn()
    const integration = makeIntegration(refreshAuth)
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(farFuture))

    const result = await integration.ensureFreshAuth(ctx)

    expect(refreshAuth).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(result.auth.tokens.expiresAt).toBe(farFuture)
  })

  test("refreshes and persists when within the proactive-refresh window", async () => {
    const newAuth = baseAuth(
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    )
    const refreshAuth = vi.fn(async () => newAuth)
    const integration = makeIntegration(refreshAuth)
    const soon = new Date(Date.now() + 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(soon))

    const result = await integration.ensureFreshAuth(ctx)

    expect(refreshAuth).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(newAuth)
    expect(result.auth).toBe(newAuth)
  })

  test("force:true refreshes even when the token is far from expiry", async () => {
    const newAuth = baseAuth(
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    )
    const refreshAuth = vi.fn(async () => newAuth)
    const integration = makeIntegration(refreshAuth)
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(farFuture))

    const result = await integration.ensureFreshAuth(ctx, { force: true })

    expect(refreshAuth).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(newAuth)
    expect(result.auth).toBe(newAuth)
  })

  test("a custom withinMs widens the proactive-refresh window beyond the default buffer", async () => {
    const newAuth = baseAuth(
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    )
    const refreshAuth = vi.fn(async () => newAuth)
    const integration = makeIntegration(refreshAuth)
    // 20 minutes out — outside the SDK's default 5-minute buffer, so a bare
    // `ensureFreshAuth(ctx)` would NOT refresh this; a 30-minute window does.
    const twentyMinutesOut = new Date(Date.now() + 20 * 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(twentyMinutesOut))

    const untouched = await integration.ensureFreshAuth(ctx)
    expect(refreshAuth).not.toHaveBeenCalled()
    expect(untouched.auth.tokens.expiresAt).toBe(twentyMinutesOut)

    const refreshed = await integration.ensureFreshAuth(ctx, {
      withinMs: 30 * 60 * 1000,
    })
    expect(refreshAuth).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(newAuth)
    expect(refreshed.auth).toBe(newAuth)
  })

  test("marks the connection offline and throws on terminal refresh failure", async () => {
    class FixtureAuthException extends Error {}
    const refreshAuth: RefreshAuthFn = () => {
      throw new FixtureAuthException("revoked")
    }
    const integration = makeIntegration(refreshAuth)
    const { ctx, markOffline } = makeContext(
      baseAuth(new Date(Date.now() + 60 * 60 * 1000).toISOString()),
    )

    await expect(
      integration.ensureFreshAuth(ctx, { force: true }),
    ).rejects.toBeInstanceOf(AuthRefreshException)
    expect(markOffline).toHaveBeenCalledTimes(1)
  })
})
