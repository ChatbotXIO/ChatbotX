import { describe, expect, test, vi } from "vitest"
import {
  AuthException,
  AuthRefreshException,
  AuthType,
  type AuthValue,
  type Context,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
  SdkException,
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
      publicRealtimeUrl: "wss://public.test",
      internalRealtimeUrl: "wss://internal.test",
      storageUrl: "https://storage.test",
      getRealtimeBroadcastAuthHeaders: async () => ({}),
    },
  }
  return { ctx, save, markOffline }
}
const makeIntegrationWithoutRefresh = () =>
  new Integration<IntegrationDefinition<Record<string, never>, AuthValue>>({
    name: "fixture-without-refresh",
    actions: {},
    handleRequest: async () => "ok",
    disconnect: async () => undefined,
  })

const makeNonOauthContext = (): Context<AuthValue> => ({
  storagePrefix: "test",
  auth: { authType: AuthType.secretText, secretText: "token-1" },
  platform: {
    appUrl: "https://app.test",
    publicRealtimeUrl: "wss://public.test",
    internalRealtimeUrl: "wss://internal.test",
    storageUrl: "https://storage.test",
    getRealtimeBroadcastAuthHeaders: async () => ({}),
  },
})

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
  test("force:true does not refresh non-oauth2 auth", async () => {
    const refreshAuth = vi.fn(async ({ auth }: { auth: AuthValue }) => auth)
    const integration = new Integration<
      IntegrationDefinition<Record<string, never>, AuthValue>
    >({
      name: "non-oauth-fixture",
      actions: {},
      handleRequest: async () => "ok",
      disconnect: async () => undefined,
      refreshAuth,
    })
    const ctx = makeNonOauthContext()

    const result = await integration.ensureFreshAuth(ctx, { force: true })

    expect(refreshAuth).not.toHaveBeenCalled()
    expect(result.auth).toBe(ctx.auth)
  })

  test("does not proactively refresh when no refresh implementation exists", async () => {
    const integration = makeIntegrationWithoutRefresh()
    const soon = new Date(Date.now() + 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(soon))

    const result = await integration.ensureFreshAuth(ctx)

    expect(result.auth).toBe(ctx.auth)
    expect(save).not.toHaveBeenCalled()
  })

  test("force:true rejects when no refresh implementation exists", async () => {
    const integration = makeIntegrationWithoutRefresh()
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { ctx } = makeContext(baseAuth(farFuture))

    await expect(
      integration.ensureFreshAuth(ctx, { force: true }),
    ).rejects.toThrow(SdkException)
  })

  test("marks the connection offline and throws on terminal refresh failure", async () => {
    const refreshAuth: RefreshAuthFn = () => {
      throw new AuthException("revoked")
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
